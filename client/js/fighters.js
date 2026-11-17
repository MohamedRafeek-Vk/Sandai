// ============================================================
// SANDAI — fighters.js
// Fighter class with full-body 2D fighting spritesheets,
// animations, combat logic, and collision detection.
// ============================================================

(function () {
  'use strict';

  window.SANDAI = window.SANDAI || {};

  // ── 8 Selectable Characters Data ─────────────────────────────
  const CHARACTERS = [
    { id: 0, name: 'Abilash',  style: 'Inferno Fist',  color: '#FFD700', secondaryColor: '#B8860B', hairColor: '#2d2d2d', shirtColor: '#DAA520', speed: 5, power: 7, defense: 5, special: 8, portraitFile: 'Abilash.webp' },
    { id: 1, name: 'Anas',     style: 'Iron Guard',    color: '#FFFFFF', secondaryColor: '#888888', hairColor: '#1a1a1a', shirtColor: '#f0f0f0', speed: 4, power: 6, defense: 9, special: 6, portraitFile: 'Anas.webp' },
    { id: 2, name: 'Dhinesh',  style: 'Shadow Strike', color: '#7B68EE', secondaryColor: '#483D8B', hairColor: '#333333', shirtColor: '#708090', speed: 8, power: 6, defense: 4, special: 7, portraitFile: 'Dhinesh.webp' },
    { id: 3, name: 'Farook',   style: 'Thunder Claw',  color: '#4169E1', secondaryColor: '#1E3A5F', hairColor: '#2a2a2a', shirtColor: '#36454F', speed: 6, power: 8, defense: 5, special: 6, portraitFile: 'Farook.webp' },
    { id: 4, name: 'Kiran',    style: 'Storm Blade',   color: '#FF6347', secondaryColor: '#8B0000', hairColor: '#1f1f1f', shirtColor: '#4a3728', speed: 7, power: 7, defense: 5, special: 6, portraitFile: 'Kiran.webp' },
    { id: 5, name: 'Nawin',    style: 'Venom Fury',    color: '#32CD32', secondaryColor: '#006400', hairColor: '#252525', shirtColor: '#556B2F', speed: 6, power: 5, defense: 6, special: 9, portraitFile: 'Nawin.webp' },
    { id: 6, name: 'Rafeek',   style: 'Titan Grip',    color: '#FF8C00', secondaryColor: '#B25900', hairColor: '#2b2b2b', shirtColor: '#8B7355', speed: 3, power: 9, defense: 8, special: 5, portraitFile: 'Rafeek.webp' },
    { id: 7, name: 'Tharun',   style: 'Divine Wrath',  color: '#DC143C', secondaryColor: '#8B0000', hairColor: '#1e1e1e', shirtColor: '#FFF8DC', speed: 5, power: 7, defense: 6, special: 7, portraitFile: 'Tharun.webp' }
  ];

  window.SANDAI.CHARACTERS = CHARACTERS;

  // ── Combat Constants ─────────────────────────────────────────
  var GRAVITY        = 0.65;
  var GROUND_Y       = 520;   // feet baseline
  var PUNCH_RANGE    = 95;
  var KICK_RANGE     = 125;
  var SPECIAL_RANGE  = 220;
  var PUNCH_DAMAGE   = 8;
  var KICK_DAMAGE    = 12;
  var SPECIAL_DAMAGE = 20;
  var BLOCK_REDUCTION = 0.7;
  var COMBO_WINDOW   = 30;    // frames
  var COMBO_RESET    = 60;    // frames

  // ── Fighter Class ────────────────────────────────────────────
  function Fighter(charId, playerIndex, scene) {
    var data = CHARACTERS[charId] || CHARACTERS[0];

    // Character identity
    this.charId        = data.id;
    this.name          = data.name;
    this.style         = data.style;
    this.color         = data.color;
    this.secondaryColor = data.secondaryColor;
    this.statSpeed     = data.speed;
    this.statPower     = data.power;
    this.statDefense   = data.defense;
    this.statSpecial   = data.special;
    this.portraitFile  = data.portraitFile;
    this.playerIndex   = playerIndex; // 0 or 1

    // Scene reference
    this.scene = scene;

    // Position & velocity
    this.x = playerIndex === 0 ? 300 : 980;
    this.y = GROUND_Y;
    this.velocityX = 0;
    this.velocityY = 0;

    // Combat state
    this.health         = 100;
    this.facing         = playerIndex === 0 ? 1 : -1;
    this.isJumping      = false;
    this.isBlocking     = false;
    this.isAttacking    = false;
    this.attackCooldown = 0;
    this.specialCooldown = 0;
    this.knockbackX     = 0;

    // Animation state
    this.state          = 'idle';
    this.currentAnimKey = '';
    this.stateTimer     = 0;

    // Combo system
    this.comboCount    = 0;
    this.comboTimer    = 0;
    this.lastHitLanded = false;

    // Hit detection
    this.currentAttack = null;
    this.hitRegistered = false;

    // Full-Body Phaser Sprite
    this.sprite = null;
    this.roundWins = 0;
  }

  // ── Create Full-Body Sprite ──────────────────────────────────
  Fighter.prototype.createSprite = function () {
    var sheetKey = 'spritesheet_' + this.name.toLowerCase();

    // Fallback texture if spritesheet not loaded
    if (!this.scene.textures.exists(sheetKey)) {
      sheetKey = 'portrait_' + this.name;
    }

    this.sprite = this.scene.add.sprite(this.x, this.y, sheetKey, 0);
    this.sprite.setOrigin(0.5, 0.92);
    this.sprite.setDepth(15);
    this.sprite.setFlipX(this.facing === -1);

    this.playAnim('idle');
  };

  // Backwards compatibility hook
  Fighter.prototype.createGraphics = function () {
    this.createSprite();
  };

  // ── Play Animation Helper ────────────────────────────────────
  Fighter.prototype.playAnim = function (action) {
    if (!this.sprite) return;
    var animKey = this.name.toLowerCase() + '_' + action;

    if (this.currentAnimKey !== animKey && this.scene.anims.exists(animKey)) {
      this.currentAnimKey = animKey;
      this.sprite.play(animKey);
    }
  };

  // ── Movement Actions ─────────────────────────────────────────
  Fighter.prototype.moveLeft = function () {
    if (this.isAttacking || this.isBlocking) return;
    this.velocityX = -(2.5 + this.statSpeed * 0.55);
    if (!this.isJumping) {
      this.state = 'walk';
      this.playAnim('walk');
    }
  };

  Fighter.prototype.moveRight = function () {
    if (this.isAttacking || this.isBlocking) return;
    this.velocityX = 2.5 + this.statSpeed * 0.55;
    if (!this.isJumping) {
      this.state = 'walk';
      this.playAnim('walk');
    }
  };

  Fighter.prototype.jump = function () {
    if (this.isJumping || this.isAttacking || this.isBlocking) return;
    this.isJumping = true;
    this.velocityY = -(12.5 + this.statSpeed * 0.35);
    this.state = 'jump';
    this.playAnim('jump');
  };

  // ── Combat Attacks ───────────────────────────────────────────
  Fighter.prototype.punch = function () {
    if (this.isAttacking || this.attackCooldown > 0 || this.isBlocking) return;
    this.isAttacking = true;
    this.state = 'punch';
    this.stateTimer = 0;
    this.attackCooldown = 18;
    this.playAnim('punch');

    this.currentAttack = {
      type: 'punch',
      range: PUNCH_RANGE,
      damage: PUNCH_DAMAGE + this.statPower * 0.5,
      hitDetected: false
    };
    this.hitRegistered = false;
  };

  Fighter.prototype.kick = function () {
    if (this.isAttacking || this.attackCooldown > 0 || this.isBlocking) return;
    this.isAttacking = true;
    this.state = 'kick';
    this.stateTimer = 0;
    this.attackCooldown = 24;
    this.playAnim('kick');

    this.currentAttack = {
      type: 'kick',
      range: KICK_RANGE,
      damage: KICK_DAMAGE + this.statPower * 0.6,
      hitDetected: false
    };
    this.hitRegistered = false;
  };

  Fighter.prototype.special = function () {
    if (this.isAttacking || this.specialCooldown > 0 || this.attackCooldown > 0 || this.isBlocking) return;
    this.isAttacking = true;
    this.state = 'special';
    this.stateTimer = 0;
    this.attackCooldown = 32;
    this.specialCooldown = 180;
    this.playAnim('special');

    this.currentAttack = {
      type: 'special',
      range: SPECIAL_RANGE,
      damage: SPECIAL_DAMAGE + this.statSpecial * 1.1,
      hitDetected: false
    };
    this.hitRegistered = false;
  };

  Fighter.prototype.block = function () {
    if (this.isAttacking) return;
    this.isBlocking = true;
    this.state = 'block';
    this.playAnim('block');
  };

  Fighter.prototype.stopBlocking = function () {
    this.isBlocking = false;
    if (this.state === 'block') {
      this.state = 'idle';
      this.playAnim('idle');
    }
  };

  // ── Damage System ────────────────────────────────────────────
  Fighter.prototype.takeDamage = function (amount) {
    var actual = amount;
    if (this.isBlocking) {
      actual = amount * (1 - BLOCK_REDUCTION);
      this.knockbackX = -this.facing * 3;
    } else {
      this.knockbackX = -this.facing * (6 + amount * 0.25);
      this.state = 'hit';
      this.stateTimer = 0;
      this.isAttacking = false;
      this.currentAttack = null;
      this.playAnim('hit');
    }

    // Defense stat mitigation
    actual = actual * (1 - this.statDefense * 0.03);
    this.health -= actual;
    if (this.health < 0) this.health = 0;
    return actual;
  };

  // ── Hit Detection ────────────────────────────────────────────
  Fighter.prototype.checkHit = function (opponent) {
    if (!this.currentAttack || this.hitRegistered) return false;
    if (this.stateTimer < 3 || this.stateTimer > 11) return false;

    var dist = Math.abs(this.x - opponent.x);
    var yDist = Math.abs(this.y - opponent.y);

    if (dist < this.currentAttack.range && yDist < 80) {
      this.hitRegistered = true;
      this.currentAttack.hitDetected = true;
      this.lastHitLanded = true;

      // Combo Tracking
      if (this.comboTimer > 0) {
        this.comboCount++;
      } else {
        this.comboCount = 1;
      }
      this.comboTimer = COMBO_RESET;

      // Multipliers
      var multiplier = 1;
      if (this.comboCount === 2) multiplier = 1.2;
      else if (this.comboCount >= 3) multiplier = 1.5;

      var damage = this.currentAttack.damage * multiplier;
      opponent.takeDamage(damage);
      return true;
    }
    return false;
  };

  // ── Main Fighter Update Loop ─────────────────────────────────
  Fighter.prototype.update = function (delta) {
    var dt = delta / 16.667;

    // Attack state timing
    if (this.isAttacking) {
      this.stateTimer += dt;
      var dur = this.state === 'special' ? 24 : (this.state === 'kick' ? 16 : 12);
      if (this.stateTimer >= dur) {
        this.isAttacking = false;
        this.currentAttack = null;
        this.state = 'idle';
        this.stateTimer = 0;
        this.playAnim('idle');
      }
    }

    // Hit reaction timing
    if (this.state === 'hit' && !this.isAttacking) {
      this.stateTimer += dt;
      if (this.stateTimer >= 14) {
        this.state = 'idle';
        this.stateTimer = 0;
        this.playAnim('idle');
      }
    }

    // Cooldown timers
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this.specialCooldown > 0) this.specialCooldown -= dt;

    // Combo timer
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.comboTimer = 0;
        this.comboCount = 0;
      }
    }

    // Knockback
    if (this.knockbackX !== 0) {
      this.x += this.knockbackX * dt;
      this.knockbackX *= 0.85;
      if (Math.abs(this.knockbackX) < 0.4) this.knockbackX = 0;
    }

    // Position updates
    this.x += this.velocityX * dt;
    this.y += this.velocityY * dt;

    // Gravity & Ground Collision
    if (this.y < GROUND_Y) {
      this.velocityY += GRAVITY * dt;
    } else {
      this.y = GROUND_Y;
      this.velocityY = 0;
      if (this.isJumping) {
        this.isJumping = false;
        if (!this.isAttacking && this.state === 'jump') {
          this.state = 'idle';
          this.playAnim('idle');
        }
      }
    }

    // Friction
    this.velocityX *= 0.8;
    if (Math.abs(this.velocityX) < 0.3) {
      this.velocityX = 0;
      if (this.state === 'walk') {
        this.state = 'idle';
        this.playAnim('idle');
      }
    }

    // Arena boundary clamp
    if (this.x < 70) this.x = 70;
    if (this.x > 1210) this.x = 1210;

    // Sprite sync
    if (this.sprite) {
      this.sprite.setPosition(this.x, this.y);
      this.sprite.setFlipX(this.facing === -1);
    }
  };

  // ── Facing Opponent ──────────────────────────────────────────
  Fighter.prototype.faceOpponent = function (opponent) {
    if (!this.isAttacking && this.state !== 'hit') {
      this.facing = opponent.x > this.x ? 1 : -1;
      if (this.sprite) {
        this.sprite.setFlipX(this.facing === -1);
      }
    }
  };

  // ── Draw Method (No-op since Sprite renders via Phaser) ──────
  Fighter.prototype.draw = function () {
    // Sprite is rendered by Phaser scenegraph
  };

  // ── Reset for New Round ──────────────────────────────────────
  Fighter.prototype.reset = function () {
    this.x = this.playerIndex === 0 ? 300 : 980;
    this.y = GROUND_Y;
    this.velocityX = 0;
    this.velocityY = 0;
    this.health = 100;
    this.isJumping = false;
    this.isBlocking = false;
    this.isAttacking = false;
    this.attackCooldown = 0;
    this.specialCooldown = 0;
    this.knockbackX = 0;
    this.state = 'idle';
    this.stateTimer = 0;
    this.comboCount = 0;
    this.comboTimer = 0;
    this.currentAttack = null;
    this.hitRegistered = false;
    this.facing = this.playerIndex === 0 ? 1 : -1;

    if (this.sprite) {
      this.sprite.setPosition(this.x, this.y);
      this.sprite.setFlipX(this.facing === -1);
      this.playAnim('idle');
    }
  };

  Fighter.prototype.setVictory = function () {
    this.state = 'victory';
    this.isAttacking = false;
    this.isBlocking = false;
    this.velocityX = 0;
    this.playAnim('victory');
  };

  Fighter.prototype.setDefeat = function () {
    this.state = 'defeat';
    this.isAttacking = false;
    this.isBlocking = false;
    this.velocityX = 0;
    this.playAnim('hit');
  };

  Fighter.prototype.destroy = function () {
    if (this.sprite) {
      this.sprite.destroy();
      this.sprite = null;
    }
  };

  // Export
  window.SANDAI.Fighter = Fighter;
  window.SANDAI.GROUND_Y = GROUND_Y;
  window.SANDAI.COMBO_WINDOW = COMBO_WINDOW;

})();
