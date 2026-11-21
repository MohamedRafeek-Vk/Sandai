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
    {
      id: 0,
      name: 'Abilash',
      style: 'Inferno Fist',
      archetype: 'Fire Brawler',
      color: '#FF1744',
      secondaryColor: '#FFD700',
      hairColor: '#1a1a1e',
      shirtColor: '#cc1122',
      speed: 6,
      power: 8,
      defense: 6,
      special: 9,
      abilityName: 'Inferno Dragon Blast',
      abilityDesc: 'Hurls a roaring sphere of flame that scorches through guard and ignites the arena.',
      portraitFile: 'Abilash.webp',
      heightScale: 1.0,
      widthScale: 1.0,
      gearType: 'headband_fists'
    },
    {
      id: 1,
      name: 'Anas',
      style: 'Iron Guard',
      archetype: 'Steel Juggernaut',
      color: '#90a4ae',
      secondaryColor: '#37474f',
      hairColor: '#111116',
      shirtColor: '#cfd8dc',
      speed: 4,
      power: 7,
      defense: 10,
      special: 7,
      abilityName: 'Aegis Shockwave',
      abilityDesc: 'Fortifies in titanium armor, generating a kinetic deflection dome that repels attacks.',
      portraitFile: 'Anas.webp',
      heightScale: 1.02,
      widthScale: 1.1,
      gearType: 'helmet_armor'
    },
    {
      id: 2,
      name: 'Dhinesh',
      style: 'Shadow Strike',
      archetype: 'Shadow Assassin',
      color: '#7c4dff',
      secondaryColor: '#311b92',
      hairColor: '#0a0a0f',
      shirtColor: '#512da8',
      speed: 9,
      power: 6,
      defense: 4,
      special: 8,
      abilityName: 'Phantom Void Dash',
      abilityDesc: 'Phases into the shadow plane, instantly reappearing behind the enemy with twin phantom blades.',
      portraitFile: 'Dhinesh.webp',
      heightScale: 0.98,
      widthScale: 0.92,
      gearType: 'ninja_cowl'
    },
    {
      id: 3,
      name: 'Farook',
      style: 'Thunder Claw',
      archetype: 'Lightning Striker',
      color: '#00e5ff',
      secondaryColor: '#0d47a1',
      hairColor: '#1c2833',
      shirtColor: '#1565c0',
      speed: 7,
      power: 8,
      defense: 5,
      special: 8,
      abilityName: 'Thunder Surge Claws',
      abilityDesc: 'Overcharges clawed gauntlets with high-voltage electricity, blasting a chain lightning storm.',
      portraitFile: 'Farook.webp',
      heightScale: 1.03,
      widthScale: 1.04,
      gearType: 'electric_spikes'
    },
    {
      id: 4,
      name: 'Kiran',
      style: 'Storm Blade',
      archetype: 'Storm Samurai',
      color: '#ff5722',
      secondaryColor: '#4e342e',
      hairColor: '#212121',
      shirtColor: '#bf360c',
      speed: 8,
      power: 7,
      defense: 5,
      special: 8,
      abilityName: 'Gale Blade Vortex',
      abilityDesc: 'Unsheathes a gale-force katana blade releasing a compressed crescent wind vortex across the lane.',
      portraitFile: 'Kiran.webp',
      heightScale: 1.04,
      widthScale: 0.96,
      gearType: 'ronin_hat'
    },
    {
      id: 5,
      name: 'Nawin',
      style: 'Venom Fury',
      archetype: 'Toxic Chemist',
      color: '#00e676',
      secondaryColor: '#1b5e20',
      hairColor: '#1e272c',
      shirtColor: '#2e7d32',
      speed: 6,
      power: 6,
      defense: 6,
      special: 10,
      abilityName: 'Toxic Viper Cloud',
      abilityDesc: 'Deploys pressurized canisters of corrosive venom gas that creates an inescapable toxic mist.',
      portraitFile: 'Nawin.webp',
      heightScale: 0.97,
      widthScale: 0.94,
      gearType: 'gas_mask'
    },
    {
      id: 6,
      name: 'Rafeek',
      style: 'Titan Grip',
      archetype: 'Titan Colossus',
      color: '#ff9100',
      secondaryColor: '#e65100',
      hairColor: '#263238',
      shirtColor: '#ef6c00',
      speed: 3,
      power: 10,
      defense: 9,
      special: 6,
      abilityName: 'Seismic Quake Slam',
      abilityDesc: 'Crushes the arena floor with titanic force, erupting jagged boulders and seismic shockwaves.',
      portraitFile: 'Rafeek.webp',
      heightScale: 1.15,
      widthScale: 1.22,
      gearType: 'titan_harness'
    },
    {
      id: 7,
      name: 'Tharun',
      style: 'Divine Wrath',
      archetype: 'Divine Sage',
      color: '#ffd600',
      secondaryColor: '#ff6d00',
      hairColor: '#212121',
      shirtColor: '#fff9c4',
      speed: 6,
      power: 8,
      defense: 7,
      special: 9,
      abilityName: 'Solar Judgement Beam',
      abilityDesc: 'Summons a blinding pillar of celestial solar radiation directly from the heavens upon the opponent.',
      portraitFile: 'Tharun.webp',
      heightScale: 1.02,
      widthScale: 0.98,
      gearType: 'divine_halo'
    }
  ];

  window.SANDAI.CHARACTERS = CHARACTERS;

  // ── Combat Constants ─────────────────────────────────────────
  var GRAVITY         = 0.65;
  var GROUND_Y        = 520;   // feet baseline
  var PUNCH_RANGE     = 95;
  var KICK_RANGE      = 125;
  var SPECIAL_RANGE   = 240;
  var PUNCH_DAMAGE    = 8;
  var KICK_DAMAGE     = 14;
  var SPECIAL_DAMAGE  = 24;
  var BLOCK_REDUCTION = 0.70;  // 70% damage reduction on successful guard
  var COMBO_WINDOW    = 32;    // frames
  var COMBO_RESET     = 55;    // frames
  var GUARD_MAX       = 100;
  var ENERGY_MAX      = 100;

  // ── Fighter Class ────────────────────────────────────────────
  function Fighter(charId, playerIndex, scene) {
    var data = CHARACTERS[charId] || CHARACTERS[0];

    // Character identity
    this.charId         = data.id;
    this.name           = data.name;
    this.style          = data.style;
    this.color          = data.color;
    this.secondaryColor = data.secondaryColor;
    this.statSpeed      = data.speed;
    this.statPower      = data.power;
    this.statDefense    = data.defense;
    this.statSpecial    = data.special;
    this.portraitFile   = data.portraitFile;
    this.playerIndex    = playerIndex; // 0 or 1

    // Scene reference
    this.scene = scene;

    // Position & velocity
    this.x = playerIndex === 0 ? 300 : 980;
    this.y = GROUND_Y;
    this.velocityX = 0;
    this.velocityY = 0;

    // Health & Super Energy Meter (0-100%)
    this.health         = 100;
    this.maxHealth      = 100;
    this.energy         = 0;   // Builds via combat: +8% hit, +5% hurt, +4% block
    this.maxEnergy      = ENERGY_MAX;
    this.guardStamina   = GUARD_MAX;
    this.isGuardBroken  = false;
    this.guardBreakTimer = 0;

    // Movement & state
    this.facing         = playerIndex === 0 ? 1 : -1;
    this.isJumping      = false;
    this.isBlocking     = false;
    this.isAttacking    = false;
    this.attackCooldown = 0;
    this.specialCooldown = 0;
    this.knockbackX     = 0;
    this.hitStunTimer   = 0;
    this.blockStunTimer = 0;

    // Animation state
    this.state          = 'idle';
    this.currentAnimKey = '';
    this.stateTimer     = 0;

    // Combo & Damage statistics
    this.comboCount       = 0;
    this.comboTimer       = 0;
    this.comboDamage      = 0;
    this.maxCombo         = 0;
    this.totalDamageDealt = 0;
    this.lastHitLanded    = false;

    // Frame-data attack descriptor
    this.currentAttack  = null;
    this.hitRegistered  = false;

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
    if (this.isAttacking || this.isBlocking || this.hitStunTimer > 0 || this.isGuardBroken) return;
    this.velocityX = -(2.6 + this.statSpeed * 0.55);
    if (!this.isJumping) {
      this.state = 'walk';
      this.playAnim('walk');
    }
  };

  Fighter.prototype.moveRight = function () {
    if (this.isAttacking || this.isBlocking || this.hitStunTimer > 0 || this.isGuardBroken) return;
    this.velocityX = 2.6 + this.statSpeed * 0.55;
    if (!this.isJumping) {
      this.state = 'walk';
      this.playAnim('walk');
    }
  };

  Fighter.prototype.jump = function () {
    if (this.health <= 0 || this.isJumping || this.isAttacking || this.isBlocking || this.hitStunTimer > 0 || this.isGuardBroken) return;
    this.isJumping = true;
    this.velocityY = -(12.8 + this.statSpeed * 0.35);
    this.state = 'jump';
    this.playAnim('jump');
    if (window.SANDAI.Audio) window.SANDAI.Audio.playJump();
  };

  // ── Combat Attacks with Frame Data ───────────────────────────
  // Light Attack (Punch): Fast startup (3 frames), low recovery, high frame advantage
  Fighter.prototype.punch = function () {
    if (this.health <= 0 || this.isAttacking || this.attackCooldown > 0 || this.isBlocking || this.hitStunTimer > 0 || this.isGuardBroken) return;
    this.isAttacking = true;
    this.state = 'punch';
    this.stateTimer = 0;
    this.attackCooldown = 15;
    this.playAnim('punch');

    this.currentAttack = {
      type: 'punch',
      isHeavy: false,
      isJump: this.isJumping,
      startup: 3,
      activeStart: 3,
      activeEnd: 8,
      recovery: 5,
      totalDuration: 13,
      range: PUNCH_RANGE,
      damage: (PUNCH_DAMAGE + this.statPower * 0.45) * (this.isJumping ? 1.2 : 1.0),
      guardDrain: 12,
      hitStun: 14,
      blockStun: 8,
      hitDetected: false
    };
    this.hitRegistered = false;
  };

  // Heavy Attack (Kick): Martial arts front/side kick (Mae Geri) with active hitbox window & recovery
  Fighter.prototype.kick = function () {
    if (this.health <= 0 || this.isAttacking || this.attackCooldown > 0 || this.isBlocking || this.hitStunTimer > 0 || this.isGuardBroken) return;
    this.isAttacking = true;
    this.state = 'kick';
    this.stateTimer = 0;
    this.attackCooldown = 26;
    this.playAnim('kick');

    this.currentAttack = {
      type: 'kick',
      isHeavy: true,
      isJump: this.isJumping,
      startup: 5,
      activeStart: 6,
      activeEnd: 15,
      recovery: 11,
      totalDuration: 26,
      range: KICK_RANGE,
      damage: (KICK_DAMAGE + this.statPower * 0.65) * (this.isJumping ? 1.25 : 1.0),
      guardDrain: 22,
      hitStun: 22,
      blockStun: 12,
      hitDetected: false
    };
    this.hitRegistered = false;
  };

  // Special Attack: Super ability requiring 50% Special Energy Meter
  Fighter.prototype.special = function () {
    // Special attack costs 50% energy meter!
    if (this.health <= 0 || this.isAttacking || this.specialCooldown > 0 || this.attackCooldown > 0 || this.isBlocking || this.hitStunTimer > 0 || this.isGuardBroken) return;

    // Energy meter check: Must have at least 50% energy to unleash special
    if (this.energy < 50) {
      if (this.scene && typeof this.scene.showFloatingBanner === 'function') {
        this.scene.showFloatingBanner('METER NOT READY', this.x, this.y - 120, '#ffaa33');
      }
      return;
    }

    // Deduct 50% Special Energy
    this.energy = Math.max(0, this.energy - 50);

    this.isAttacking = true;
    this.state = 'special';
    this.stateTimer = 0;
    this.attackCooldown = 30;
    this.specialCooldown = 90;
    this.playAnim('special');

    this.currentAttack = {
      type: 'special',
      isHeavy: true,
      isJump: false,
      startup: 8,
      activeStart: 8,
      activeEnd: 19,
      recovery: 13,
      totalDuration: 32,
      range: SPECIAL_RANGE,
      damage: SPECIAL_DAMAGE + this.statSpecial * 1.15,
      guardDrain: 38,
      hitStun: 30,
      blockStun: 18,
      hitDetected: false
    };
    this.hitRegistered = false;
  };

  Fighter.prototype.block = function () {
    if (this.health <= 0 || this.isAttacking || this.isGuardBroken || this.hitStunTimer > 0) return;
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

  // ── Damage System (Guard Break, Counter Hits, Block Reduction) ──
  Fighter.prototype.takeDamage = function (amount, isCounter, attackType, attacker) {
    var actual = amount;

    // 1. Check if defending player is blocking
    if (this.isBlocking && !this.isGuardBroken) {
      var guardDrain = attackType === 'special' ? 38 : (attackType === 'kick' ? 22 : 12);
      this.guardStamina -= guardDrain;

      // Check for Guard Break
      if (this.guardStamina <= 0) {
        this.guardStamina = 0;
        this.isGuardBroken = true;
        this.guardBreakTimer = 65; // ~1.1 seconds dizzy stumble
        this.state = 'guard_break';
        this.isBlocking = false;
        this.isAttacking = false;
        this.currentAttack = null;
        this.playAnim('hit');

        if (this.scene && typeof this.scene.showFloatingBanner === 'function') {
          this.scene.showFloatingBanner('GUARD BREAK!', this.x, this.y - 130, '#e040fb');
        }
        if (this.scene && typeof this.scene.triggerHitStop === 'function') {
          this.scene.triggerHitStop(4);
        }
      } else {
        // Block successful: 70% damage reduction
        actual = amount * (1 - BLOCK_REDUCTION);
        this.knockbackX = -this.facing * 3.5;
        this.blockStunTimer = attackType === 'special' ? 18 : (attackType === 'kick' ? 12 : 8);

        // Blocking awards +4% Super Energy
        this.energy = Math.min(ENERGY_MAX, this.energy + 4);
        return actual;
      }
    }

    // 2. Counter Hit bonus: If hit while winding up an attack
    if (isCounter) {
      actual = actual * 1.30;
      this.knockbackX = -this.facing * (9 + amount * 0.35);
      this.hitStunTimer = 26;
      if (this.scene && typeof this.scene.showFloatingBanner === 'function') {
        this.scene.showFloatingBanner('COUNTER HIT!', this.x, this.y - 130, '#ff1744');
      }
      if (this.scene && typeof this.scene.triggerHitStop === 'function') {
        this.scene.triggerHitStop(3);
      }
    } else {
      this.knockbackX = -this.facing * (6 + amount * 0.25);
      this.hitStunTimer = attackType === 'special' ? 28 : (attackType === 'kick' ? 20 : 14);
    }

    // 3. Defense stat mitigation (3% per stat point)
    actual = actual * (1 - this.statDefense * 0.03);
    this.health = Math.max(0, this.health - actual);

    // 4. Taking damage builds +6% Super Energy
    this.energy = Math.min(ENERGY_MAX, this.energy + 6);

    // Enter Hit Stun
    this.state = 'hit';
    this.stateTimer = 0;
    this.isAttacking = false;
    this.currentAttack = null;
    this.playAnim('hit');

    return actual;
  };

  // ── Hit Detection (Active Hitbox Overlap During Active Frames Only) ──
  Fighter.prototype.checkHit = function (opponent) {
    if (!this.currentAttack || this.hitRegistered) return false;

    var atk = this.currentAttack;
    // Connect ONLY during active hitbox window (no hits during startup or recovery)
    if (this.stateTimer < atk.activeStart || this.stateTimer > atk.activeEnd) return false;

    var dist = Math.abs(this.x - opponent.x);
    var yDist = Math.abs(this.y - opponent.y);

    if (dist < atk.range && yDist < 85) {
      this.hitRegistered = true;
      atk.hitDetected = true;
      this.lastHitLanded = true;

      // Landing an attack builds +8% (Punch) or +12% (Kick) Super Energy
      var gain = atk.type === 'kick' ? 12 : 8;
      this.energy = Math.min(ENERGY_MAX, this.energy + gain);

      // Check if opponent was caught in startup frames -> Counter Hit!
      var isCounter = opponent.isAttacking && opponent.currentAttack && opponent.stateTimer < opponent.currentAttack.activeStart;

      // Combo Tracking & Scaling
      if (this.comboTimer > 0) {
        this.comboCount++;
      } else {
        this.comboCount = 1;
        this.comboDamage = 0;
      }
      this.comboTimer = COMBO_RESET;
      this.maxCombo = Math.max(this.maxCombo, this.comboCount);

      // Combo damage scaling prevents infinite 100% combos
      var scale = 1.0;
      if (this.comboCount === 2) scale = 0.85;
      else if (this.comboCount === 3) scale = 0.75;
      else if (this.comboCount >= 4) scale = 0.65;

      var finalDamage = atk.damage * scale;
      var dealt = opponent.takeDamage(finalDamage, isCounter, atk.type, this);
      this.comboDamage += dealt;
      this.totalDamageDealt += dealt;

      // Trigger scene visual effects: Hit sparks, shockwaves, camera shake
      if (this.scene && typeof this.scene.onHitLanded === 'function') {
        var impactX = (this.x + opponent.x) / 2;
        var impactY = this.y - 70;
        this.scene.onHitLanded(this, opponent, atk.type, impactX, impactY, isCounter);
      }

      return true;
    }
    return false;
  };

  // ── Main Fighter Update Loop ─────────────────────────────────
  Fighter.prototype.update = function (delta) {
    var dt = delta / 16.667;

    // Guard Stamina Regeneration (when not blocking)
    if (!this.isBlocking && !this.isGuardBroken && this.guardStamina < GUARD_MAX) {
      this.guardStamina = Math.min(GUARD_MAX, this.guardStamina + 0.35 * dt);
    }

    // Guard Break Recovery Timer
    if (this.isGuardBroken) {
      this.guardBreakTimer -= dt;
      this.state = 'guard_break';
      if (this.guardBreakTimer <= 0) {
        this.isGuardBroken = false;
        this.guardStamina = 50; // Restore to 50% upon waking up
        this.state = 'idle';
        this.playAnim('idle');
      }
    }

    // Stun Timers
    if (this.hitStunTimer > 0) {
      this.hitStunTimer -= dt;
      if (this.hitStunTimer <= 0 && this.state === 'hit' && !this.isGuardBroken) {
        this.state = 'idle';
        this.playAnim('idle');
      }
    }
    if (this.blockStunTimer > 0) {
      this.blockStunTimer -= dt;
    }

    // Attack State & Frame Timing
    if (this.isAttacking && this.currentAttack) {
      this.stateTimer += dt;
      var dur = this.currentAttack.totalDuration || 16;
      if (this.stateTimer >= dur) {
        this.isAttacking = false;
        this.currentAttack = null;
        this.state = 'idle';
        this.stateTimer = 0;
        this.playAnim('idle');
      }
    }

    // Hit reaction timing
    if (this.state === 'hit' && !this.isAttacking && this.hitStunTimer <= 0 && !this.isGuardBroken) {
      this.state = 'idle';
      this.stateTimer = 0;
      this.playAnim('idle');
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

    // Knockback physics
    if (this.knockbackX !== 0) {
      this.x += this.knockbackX * dt;
      this.knockbackX *= 0.85;
      if (Math.abs(this.knockbackX) < 0.4) this.knockbackX = 0;
    }

    // Velocity & position updates
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
        if (!this.isAttacking && this.state === 'jump' && !this.isGuardBroken) {
          this.state = 'idle';
          this.playAnim('idle');
        }
      }
    }

    // Ground friction
    this.velocityX *= 0.82;
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
    if (!this.isAttacking && this.state !== 'hit' && !this.isGuardBroken) {
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
    this.guardStamina = GUARD_MAX;
    this.isGuardBroken = false;
    this.guardBreakTimer = 0;
    this.hitStunTimer = 0;
    this.blockStunTimer = 0;
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
    this.comboDamage = 0;
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
