// ============================================================
// SANDAI — ai.js
// AI opponent controller with difficulty-based decision making.
// ============================================================

(function () {
  'use strict';

  window.SANDAI = window.SANDAI || {};

  // ── AI Difficulty Presets ───────────────────────────────────
  var DIFFICULTY = {
    easy: {
      reactionDelay: 28,
      aggressiveness: 0.35,
      blockChance: 0.25,
      specialChance: 0.15,
      comboChance: 0.15,
      retreatThreshold: 0.2,
      whiffPunishChance: 0.2,
      antiAirChance: 0.15
    },
    normal: {
      reactionDelay: 18,
      aggressiveness: 0.55,
      blockChance: 0.50,
      specialChance: 0.30,
      comboChance: 0.35,
      retreatThreshold: 0.28,
      whiffPunishChance: 0.45,
      antiAirChance: 0.40
    },
    medium: { // alias for normal
      reactionDelay: 18,
      aggressiveness: 0.55,
      blockChance: 0.50,
      specialChance: 0.30,
      comboChance: 0.35,
      retreatThreshold: 0.28,
      whiffPunishChance: 0.45,
      antiAirChance: 0.40
    },
    hard: {
      reactionDelay: 9,
      aggressiveness: 0.78,
      blockChance: 0.72,
      specialChance: 0.45,
      comboChance: 0.55,
      retreatThreshold: 0.32,
      whiffPunishChance: 0.75,
      antiAirChance: 0.70
    }
  };

  // ── AIController ───────────────────────────────────────────
  function AIController(fighter, difficulty) {
    this.fighter = fighter;
    this.difficulty = difficulty || window.SANDAI.aiDifficulty || 'normal';
    this.params = DIFFICULTY[this.difficulty] || DIFFICULTY.normal;

    // Internal state
    this.decisionTimer   = 0;      // frames until next decision
    this.reactionTimer   = 0;      // reaction delay counter
    this.currentAction   = null;   // current decided action
    this.actionFrames    = 0;      // how long to hold current action
    this.comboStep       = 0;      // position in combo chain
    this.lastPlayerState = 'idle';
    this.whiffTimer      = 0;
  }

  AIController.prototype.setDifficulty = function (diff) {
    this.difficulty = diff || 'normal';
    this.params = DIFFICULTY[this.difficulty] || DIFFICULTY.normal;
  };

  // ── Main Update — called each frame ────────────────────────
  AIController.prototype.update = function (opponent) {
    var ai   = this.fighter;
    var opp  = opponent;
    var p    = this.params;

    // Distance to opponent
    var dist = Math.abs(ai.x - opp.x);
    var facing = opp.x > ai.x ? 1 : -1;

    // Track opponent attack whiff
    if (opp.isAttacking) {
      this.whiffTimer = 20;
    } else if (this.whiffTimer > 0) {
      this.whiffTimer--;
    }

    // Decrease decision timers
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
    var rand = Math.random();

    // 1. Anti-Air Reaction (Opponent is airborne and attacking/approaching)
    if (opp.isJumping && opp.y < ai.y - 30 && dist < 170) {
      if (rand < p.antiAirChance) {
        if (rand < 0.5 && !ai.isJumping) {
          this.currentAction = 'jump-attack';
          this.decisionTimer = 16;
        } else {
          this.currentAction = 'block';
          this.decisionTimer = 18;
        }
        this._executeAction(facing);
        return;
      }
    }

    // 2. Defensive: Block incoming attacks within strike range
    if ((opp.isAttacking || opp.state === 'punch' || opp.state === 'kick' || opp.state === 'special') && dist < 160) {
      if (rand < p.blockChance) {
        this.currentAction = 'block';
        this.decisionTimer = 14 + Math.floor(Math.random() * 10);
        this._executeAction(facing);
        return;
      }
    }

    // 3. Whiff Punish (Opponent just finished an attack and missed)
    if (this.whiffTimer > 0 && !opp.isAttacking && dist < 150) {
      if (rand < p.whiffPunishChance) {
        this.whiffTimer = 0;
        this.currentAction = rand < 0.5 ? 'kick' : 'punch';
        this.decisionTimer = 10;
        this._executeAction(facing);
        return;
      }
    }

    // 4. Try to continue active combo
    if (ai.comboCount > 0 && ai.comboTimer > 0 && rand < p.comboChance) {
      this.comboStep++;
      if (this.comboStep === 1) {
        this.currentAction = 'kick';
        this.decisionTimer = 8;
      } else if (this.comboStep >= 2 && ai.specialCooldown <= 0) {
        this.currentAction = 'special';
        this.decisionTimer = 14;
        this.comboStep = 0;
      } else {
        this.currentAction = 'punch';
        this.decisionTimer = 7;
      }
      this._executeAction(facing);
      return;
    }

    // Reset combo tracking
    if (ai.comboCount === 0) this.comboStep = 0;

    // 5. Retreat when critically low health
    if (healthRatio < p.retreatThreshold && rand < 0.45) {
      if (rand < 0.35 && !ai.isJumping) {
        this.currentAction = 'jump-retreat';
        this.decisionTimer = 18;
      } else {
        this.currentAction = 'retreat';
        this.decisionTimer = 18 + Math.floor(Math.random() * 12);
      }
      this._executeAction(facing);
      return;
    }

    // 6. Close range (dist < 135) — Strike or mixup
    if (dist < 135) {
      if (rand < p.aggressiveness) {
        var atkRand = Math.random();
        if (atkRand < 0.20 && ai.specialCooldown <= 0 && rand < p.specialChance) {
          this.currentAction = 'special';
          this.decisionTimer = 16;
        } else if (atkRand < 0.60) {
          this.currentAction = 'punch';
          this.decisionTimer = 9;
        } else {
          this.currentAction = 'kick';
          this.decisionTimer = 11;
        }
      } else {
        // Spacing: Step back slightly or hold guard
        this.currentAction = rand < 0.45 ? 'block' : 'retreat';
        this.decisionTimer = 12;
      }
      this._executeAction(facing);
      return;
    }

    // 7. Medium range (135 < dist < 220) — Fire projectile or close in
    if (dist <= 220 && dist >= 135) {
      if (ai.specialCooldown <= 0 && rand < p.specialChance) {
        this.currentAction = 'special';
        this.decisionTimer = 16;
        this._executeAction(facing);
        return;
      }
      // Intelligent approach to close the gap
      this.currentAction = (rand < 0.25 && !ai.isJumping) ? 'jump-approach' : 'approach';
      this.decisionTimer = 12 + Math.floor(Math.random() * 10);
      this._executeAction(facing);
      return;
    }

    // 8. Far range (dist > 220) — Approach to re-engage
    if (dist > 220) {
      if (rand < 0.3 && !ai.isJumping) {
        this.currentAction = 'jump-approach';
        this.decisionTimer = 22;
      } else {
        this.currentAction = 'approach';
        this.decisionTimer = 16 + Math.floor(Math.random() * 14);
      }
      this._executeAction(facing);
      return;
    }

    // 9. Default: Idle spacing
    this.currentAction = 'idle';
    this.decisionTimer = 10 + Math.floor(Math.random() * 10);
  };

  // ── Execute the current action ─────────────────────────────
  AIController.prototype._executeAction = function (facing) {
    var ai = this.fighter;

    // Stop blocking if switching away from block action
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

      case 'jump-attack':
        ai.jump();
        ai.kick();
        this.currentAction = 'idle';
        break;

      case 'punch':
        ai.punch();
        this.currentAction = 'idle'; // one-shot action
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
  AIController.DIFFICULTY_PRESETS = DIFFICULTY;
  window.SANDAI.AIController = AIController;
})();
