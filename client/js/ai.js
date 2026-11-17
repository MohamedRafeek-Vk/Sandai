// ============================================================
// SANDAI — ai.js
// AI opponent controller with difficulty-based decision making.
// ============================================================

(function () {
  'use strict';

  window.SANDAI = window.SANDAI || {};

  // ── AI Difficulty Presets ───────────────────────────────────
  var DIFFICULTY = {
    easy:   { reactionDelay: 30, aggressiveness: 0.3, blockChance: 0.2, specialChance: 0.15, comboChance: 0.1, retreatThreshold: 0.2 },
    medium: { reactionDelay: 20, aggressiveness: 0.5, blockChance: 0.4, specialChance: 0.25, comboChance: 0.3, retreatThreshold: 0.3 },
    hard:   { reactionDelay: 10, aggressiveness: 0.7, blockChance: 0.65, specialChance: 0.35, comboChance: 0.5, retreatThreshold: 0.35 }
  };

  // ── AIController ───────────────────────────────────────────
  function AIController(fighter, difficulty) {
    this.fighter = fighter;
    this.difficulty = difficulty || 'medium';
    this.params = DIFFICULTY[this.difficulty] || DIFFICULTY.medium;

    // Internal state
    this.decisionTimer   = 0;      // frames until next decision
    this.reactionTimer   = 0;      // reaction delay counter
    this.currentAction   = null;   // current decided action
    this.actionFrames    = 0;      // how long to hold current action
    this.comboStep       = 0;      // position in combo chain
    this.lastPlayerState = 'idle';
  }

  AIController.prototype.setDifficulty = function (diff) {
    this.difficulty = diff;
    this.params = DIFFICULTY[diff] || DIFFICULTY.medium;
  };

  // ── Main Update — called each frame ────────────────────────
  AIController.prototype.update = function (opponent) {
    var ai   = this.fighter;
    var opp  = opponent;
    var p    = this.params;

    // Distance to opponent
    var dist = Math.abs(ai.x - opp.x);
    var facing = opp.x > ai.x ? 1 : -1;

    // Decrease timers
    if (this.decisionTimer > 0) {
      this.decisionTimer--;
      this._executeAction(facing);
      return;
    }

    // Reaction delay when opponent changes state
    if (opp.state !== this.lastPlayerState) {
      this.reactionTimer = p.reactionDelay * (0.7 + Math.random() * 0.6);
      this.lastPlayerState = opp.state;
    }
    if (this.reactionTimer > 0) {
      this.reactionTimer--;
      this._executeAction(facing);
      return;
    }

    // ── Decision Making ──────────────────────────────────────
    var healthRatio   = ai.health / 100;
    var oppHealthRatio = opp.health / 100;
    var rand = Math.random();

    // Try to continue combo
    if (ai.comboCount > 0 && ai.comboTimer > 0 && rand < p.comboChance) {
      this.comboStep++;
      if (this.comboStep === 1) {
        this.currentAction = 'kick';
        this.decisionTimer = 8;
      } else if (this.comboStep >= 2 && ai.specialCooldown <= 0) {
        this.currentAction = 'special';
        this.decisionTimer = 12;
        this.comboStep = 0;
      } else {
        this.currentAction = 'punch';
        this.decisionTimer = 6;
      }
      this._executeAction(facing);
      return;
    }

    // Reset combo tracking
    if (ai.comboCount === 0) this.comboStep = 0;

    // ── Defensive: Block incoming attacks ─────────────────────
    if ((opp.isAttacking || opp.state === 'punch' || opp.state === 'kick' || opp.state === 'special') && dist < 160) {
      if (rand < p.blockChance) {
        this.currentAction = 'block';
        this.decisionTimer = 15 + Math.floor(Math.random() * 10);
        this._executeAction(facing);
        return;
      }
    }

    // ── Retreat when low health ───────────────────────────────
    if (healthRatio < p.retreatThreshold && rand < 0.5) {
      // Jump away or walk away
      if (rand < 0.3 && !ai.isJumping) {
        this.currentAction = 'jump-retreat';
        this.decisionTimer = 20;
      } else {
        this.currentAction = 'retreat';
        this.decisionTimer = 20 + Math.floor(Math.random() * 15);
      }
      this._executeAction(facing);
      return;
    }

    // ── Close range — Attack ──────────────────────────────────
    if (dist < 130) {
      if (rand < p.aggressiveness) {
        // Choose attack
        var atkRand = Math.random();
        if (atkRand < 0.1 && ai.specialCooldown <= 0) {
          this.currentAction = 'special';
          this.decisionTimer = 14;
        } else if (atkRand < 0.5) {
          this.currentAction = 'punch';
          this.decisionTimer = 8;
        } else {
          this.currentAction = 'kick';
          this.decisionTimer = 10;
        }
      } else {
        // back off slightly or block
        this.currentAction = rand < 0.4 ? 'block' : 'retreat';
        this.decisionTimer = 12;
      }
      this._executeAction(facing);
      return;
    }

    // ── Medium range — Use special if available ───────────────
    if (dist < 200 && dist > 120) {
      if (ai.specialCooldown <= 0 && rand < p.specialChance) {
        this.currentAction = 'special';
        this.decisionTimer = 14;
        this._executeAction(facing);
        return;
      }
      // approach
      this.currentAction = 'approach';
      this.decisionTimer = 10 + Math.floor(Math.random() * 10);
      this._executeAction(facing);
      return;
    }

    // ── Far range — Approach ──────────────────────────────────
    if (dist >= 200) {
      if (rand < 0.2 && !ai.isJumping) {
        this.currentAction = 'jump-approach';
        this.decisionTimer = 24;
      } else {
        this.currentAction = 'approach';
        this.decisionTimer = 15 + Math.floor(Math.random() * 15);
      }
      this._executeAction(facing);
      return;
    }

    // ── Default: idle ─────────────────────────────────────────
    this.currentAction = 'idle';
    this.decisionTimer = 10 + Math.floor(Math.random() * 10);
  };

  // ── Execute the current action ─────────────────────────────
  AIController.prototype._executeAction = function (facing) {
    var ai = this.fighter;

    // Stop blocking if switching action
    if (this.currentAction !== 'block' && ai.isBlocking) {
      ai.stopBlocking();
    }

    switch (this.currentAction) {
      case 'approach':
        if (facing === 1) ai.moveRight(); else ai.moveLeft();
        break;

      case 'retreat':
        if (facing === 1) ai.moveLeft(); else ai.moveRight();
        break;

      case 'jump-approach':
        ai.jump();
        if (facing === 1) ai.moveRight(); else ai.moveLeft();
        break;

      case 'jump-retreat':
        ai.jump();
        if (facing === 1) ai.moveLeft(); else ai.moveRight();
        break;

      case 'punch':
        ai.punch();
        this.currentAction = 'idle'; // one-shot
        break;

      case 'kick':
        ai.kick();
        this.currentAction = 'idle';
        break;

      case 'special':
        ai.special();
        this.currentAction = 'idle';
        break;

      case 'block':
        ai.block();
        break;

      case 'idle':
      default:
        break;
    }
  };

  // ── Reset ──────────────────────────────────────────────────
  AIController.prototype.reset = function () {
    this.decisionTimer = 30; // give a pause before first action in new round
    this.reactionTimer = 0;
    this.currentAction = null;
    this.comboStep = 0;
  };

  // Export
  window.SANDAI.AIController = AIController;
})();
