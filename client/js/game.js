// ============================================================
// SANDAI — game.js
// Main Phaser 3 Fighting Game Engine & Scene Management
// ============================================================

(function () {
  'use strict';

  window.SANDAI = window.SANDAI || {};

  var gameInstance = null;
  var currentScene = null;

  // ── FightScene Definition ────────────────────────────────────
  class FightScene extends Phaser.Scene {
    constructor() {
      super({ key: 'FightScene' });
    }

    preload() {
      currentScene = this;
      var chars = window.SANDAI.CHARACTERS || [];

      // Preload all 8 character portraits & full-body spritesheets
      for (var i = 0; i < chars.length; i++) {
        var c = chars[i];
        // Portrait for HUD & VS Screen
        var pKey = 'portrait_' + c.name;
        var pPath = 'assets/characters/' + c.portraitFile;
        this.load.image(pKey, pPath);

        // Full-body 2D fighting spritesheet (140x200 per frame, 28 frames)
        var sheetKey = 'spritesheet_' + c.name.toLowerCase();
        var sheetPath = 'assets/sprites/' + c.name.toLowerCase() + '_sheet.png';
        this.load.spritesheet(sheetKey, sheetPath, {
          frameWidth: 140,
          frameHeight: 200
        });
      }
    }

    create() {
      var self = this;
      var W = 1280;
      var H = 720;

      // Register animations for all 8 characters
      this.registerAllFighterAnimations();

      // Read match settings from global state
      this.gameMode = window.SANDAI.gameMode || 'ai';
      this.p1CharId = window.SANDAI.player1Character !== undefined && window.SANDAI.player1Character !== null ? window.SANDAI.player1Character : 0;
      this.p2CharId = window.SANDAI.player2Character !== undefined && window.SANDAI.player2Character !== null ? window.SANDAI.player2Character : 1;
      this.localPlayerIndex = (window.SANDAI.playerNumber === 2) ? 1 : 0;
      this.isOnline = (this.gameMode === 'online');

      // Match state
      this.roundNumber = 1;
      this.maxRounds = 3;
      this.p1RoundWins = 0;
      this.p2RoundWins = 0;
      this.roundTimer = 99;
      this.timerAccumulator = 0;
      this.roundActive = false;
      this.matchOver = false;
      this.stateSyncTimer = 0;

      // Build Visual Arena
      this.createArenaBackground(W, H);

      // Create Full-Body Fighters
      this.fighter1 = new window.SANDAI.Fighter(this.p1CharId, 0, this);
      this.fighter2 = new window.SANDAI.Fighter(this.p2CharId, 1, this);

      this.fighter1.createSprite();
      this.fighter2.createSprite();

      // AI Controller
      if (this.gameMode === 'ai') {
        this.ai = new window.SANDAI.AIController(this.fighter2, 'medium');
      } else {
        this.ai = null;
      }

      // Build HUD
      this.createHUD(W, H);

      // Controls Setup
      if (window.SANDAI.Controls) {
        window.SANDAI.Controls.initKeyboard();
        if (window.SANDAI.deviceType === 'mobile') {
          window.SANDAI.Controls.createTouchControls();
        }
      }

      // Online Socket Event Listeners
      if (this.isOnline && window.SANDAI.socket) {
        this.setupSocketListeners();
      }

      // Start Round 1
      this.startRound(1);
    }

    // ── Animation Registration ────────────────────────────────
    registerAllFighterAnimations() {
      var chars = window.SANDAI.CHARACTERS || [];
      var self = this;

      chars.forEach(function (c) {
        var charName = c.name.toLowerCase();
        var sheetKey = 'spritesheet_' + charName;

        if (self.textures.exists(sheetKey)) {
          // 1. Idle (frames 0-3)
          if (!self.anims.exists(charName + '_idle')) {
            self.anims.create({
              key: charName + '_idle',
              frames: self.anims.generateFrameNumbers(sheetKey, { start: 0, end: 3 }),
              frameRate: 6,
              repeat: -1
            });
          }
          // 2. Walk (frames 4-7)
          if (!self.anims.exists(charName + '_walk')) {
            self.anims.create({
              key: charName + '_walk',
              frames: self.anims.generateFrameNumbers(sheetKey, { start: 4, end: 7 }),
              frameRate: 8,
              repeat: -1
            });
          }
          // 3. Jump (frames 8-10)
          if (!self.anims.exists(charName + '_jump')) {
            self.anims.create({
              key: charName + '_jump',
              frames: self.anims.generateFrameNumbers(sheetKey, { start: 8, end: 10 }),
              frameRate: 6,
              repeat: 0
            });
          }
          // 4. Punch (frames 11-13)
          if (!self.anims.exists(charName + '_punch')) {
            self.anims.create({
              key: charName + '_punch',
              frames: self.anims.generateFrameNumbers(sheetKey, { start: 11, end: 13 }),
              frameRate: 12,
              repeat: 0
            });
          }
          // 5. Kick (frames 14-16)
          if (!self.anims.exists(charName + '_kick')) {
            self.anims.create({
              key: charName + '_kick',
              frames: self.anims.generateFrameNumbers(sheetKey, { start: 14, end: 16 }),
              frameRate: 10,
              repeat: 0
            });
          }
          // 6. Block (frames 17-18)
          if (!self.anims.exists(charName + '_block')) {
            self.anims.create({
              key: charName + '_block',
              frames: self.anims.generateFrameNumbers(sheetKey, { start: 17, end: 18 }),
              frameRate: 6,
              repeat: -1
            });
          }
          // 7. Special (frames 19-22)
          if (!self.anims.exists(charName + '_special')) {
            self.anims.create({
              key: charName + '_special',
              frames: self.anims.generateFrameNumbers(sheetKey, { start: 19, end: 22 }),
              frameRate: 8,
              repeat: 0
            });
          }
          // 8. Hit (frames 23-24)
          if (!self.anims.exists(charName + '_hit')) {
            self.anims.create({
              key: charName + '_hit',
              frames: self.anims.generateFrameNumbers(sheetKey, { start: 23, end: 24 }),
              frameRate: 8,
              repeat: 0
            });
          }
          // 9. Victory (frames 25-27)
          if (!self.anims.exists(charName + '_victory')) {
            self.anims.create({
              key: charName + '_victory',
              frames: self.anims.generateFrameNumbers(sheetKey, { start: 25, end: 27 }),
              frameRate: 5,
              repeat: -1
            });
          }
        }
      });
    }

    // ── Visual Arena Background ───────────────────────────────
    createArenaBackground(W, H) {
      var bg = this.add.graphics();

      // Deep arcade night sky gradient
      bg.fillGradientStyle(0x080812, 0x080812, 0x180b22, 0x1f0b24, 1);
      bg.fillRect(0, 0, W, H);

      // Distant City Skyline Silhouettes
      bg.fillStyle(0x0e0e1a, 0.9);
      var buildings = [
        { x: 30, w: 90, h: 260 }, { x: 130, w: 70, h: 320 }, { x: 210, w: 110, h: 220 },
        { x: 330, w: 85, h: 350 }, { x: 425, w: 100, h: 280 }, { x: 535, w: 60, h: 370 },
        { x: 605, w: 120, h: 240 }, { x: 735, w: 85, h: 360 }, { x: 830, w: 110, h: 290 },
        { x: 950, w: 95, h: 330 }, { x: 1055, w: 80, h: 250 }, { x: 1145, w: 110, h: 310 }
      ];
      for (var i = 0; i < buildings.length; i++) {
        var b = buildings[i];
        bg.fillRect(b.x, 520 - b.h, b.w, b.h);
        bg.fillStyle(0xffaa33, 0.35);
        for (var wy = 520 - b.h + 20; wy < 500; wy += 35) {
          for (var wx = b.x + 12; wx < b.x + b.w - 15; wx += 22) {
            if ((wx + wy) % 3 === 0) {
              bg.fillRect(wx, wy, 8, 12);
            }
          }
        }
        bg.fillStyle(0x0e0e1a, 0.9);
      }

      // Midground Platform
      bg.fillStyle(0x151528, 1);
      bg.fillRect(0, 480, W, 40);

      // Arena Floor — Metallic Fighting Stage
      bg.fillGradientStyle(0x221124, 0x221124, 0x110816, 0x110816, 1);
      bg.fillRect(0, 520, W, H - 520);

      // Neon Grate Floor Lines
      bg.lineStyle(3, 0xdc143c, 0.8);
      bg.lineBetween(0, 520, W, 520);

      bg.lineStyle(1, 0xff6b35, 0.35);
      for (var lx = 0; lx <= W; lx += 40) {
        bg.lineBetween(lx, 520, lx + (lx - W / 2) * 0.4, H);
      }
      for (var ly = 540; ly < H; ly += 25) {
        bg.lineBetween(0, ly, W, ly);
      }

      // Arena Edge Pillars
      bg.fillStyle(0x1a0f26, 1);
      bg.fillRect(0, 200, 60, 320);
      bg.fillRect(W - 60, 200, 60, 320);

      bg.lineStyle(2, 0xdc143c, 0.9);
      bg.strokeRect(10, 200, 40, 320);
      bg.strokeRect(W - 50, 200, 40, 320);

      // Overhead Arena Lighting
      bg.fillStyle(0xffeedd, 0.04);
      bg.fillTriangle(300, 0, 100, 520, 500, 520);
      bg.fillTriangle(980, 0, 780, 520, 1180, 520);

      // Ambient Floating Embers
      this.createEmberParticles(W, H);
    }

    createEmberParticles(W, H) {
      this.embers = [];
      for (var i = 0; i < 35; i++) {
        var ember = this.add.circle(
          Phaser.Math.Between(40, W - 40),
          Phaser.Math.Between(100, 600),
          Phaser.Math.Between(2, 4),
          Phaser.Math.RND.pick([0xdc143c, 0xff6b35, 0xffd700]),
          Phaser.Math.FloatBetween(0.2, 0.7)
        );
        ember.speedY = Phaser.Math.FloatBetween(-0.4, -1.2);
        ember.speedX = Phaser.Math.FloatBetween(-0.3, 0.3);
        this.embers.push(ember);
      }
    }

    updateEmbers() {
      for (var i = 0; i < this.embers.length; i++) {
        var e = this.embers[i];
        e.y += e.speedY;
        e.x += e.speedX;
        if (e.y < 50) {
          e.y = 600;
          e.x = Phaser.Math.Between(40, 1240);
        }
      }
    }

    // ── HUD Elements ──────────────────────────────────────────
    createHUD(W, H) {
      this.hudGraphics = this.add.graphics().setDepth(100);

      var p1Data = window.SANDAI.CHARACTERS[this.p1CharId] || window.SANDAI.CHARACTERS[0];
      var p2Data = window.SANDAI.CHARACTERS[this.p2CharId] || window.SANDAI.CHARACTERS[1];

      // P1 Portrait icon in HUD
      if (this.textures.exists('portrait_' + p1Data.name)) {
        this.add.image(55, 52, 'portrait_' + p1Data.name).setDisplaySize(64, 64).setDepth(101);
      }
      this.p1NameText = this.add.text(95, 26, p1Data.name.toUpperCase(), {
        fontFamily: 'Rajdhani, sans-serif',
        fontSize: '24px',
        fontWeight: '700',
        color: '#ffffff'
      }).setDepth(101);
      this.p1StyleText = this.add.text(95, 54, p1Data.style, {
        fontFamily: 'Inter, sans-serif',
        fontSize: '12px',
        color: '#ffaa66'
      }).setDepth(101);

      // P2 Portrait icon in HUD
      if (this.textures.exists('portrait_' + p2Data.name)) {
        this.add.image(W - 55, 52, 'portrait_' + p2Data.name).setDisplaySize(64, 64).setDepth(101);
      }
      this.p2NameText = this.add.text(W - 95, 26, p2Data.name.toUpperCase(), {
        fontFamily: 'Rajdhani, sans-serif',
        fontSize: '24px',
        fontWeight: '700',
        color: '#ffffff'
      }).setOrigin(1, 0).setDepth(101);
      this.p2StyleText = this.add.text(W - 95, 54, p2Data.style, {
        fontFamily: 'Inter, sans-serif',
        fontSize: '12px',
        color: '#66aaff'
      }).setOrigin(1, 0).setDepth(101);

      // Center Timer Display
      this.timerText = this.add.text(W / 2, 48, '99', {
        fontFamily: 'Rajdhani, sans-serif',
        fontSize: '48px',
        fontWeight: 'bold',
        color: '#ffffff'
      }).setOrigin(0.5).setDepth(102);

      // Round & Match Announcement Text (Centered)
      this.announcementText = this.add.text(W / 2, H / 2 - 60, '', {
        fontFamily: 'Rajdhani, sans-serif',
        fontSize: '76px',
        fontWeight: 'bold',
        color: '#ffdd00',
        stroke: '#000000',
        strokeThickness: 8
      }).setOrigin(0.5).setDepth(200);

      // Combo Texts
      this.p1ComboText = this.add.text(120, 180, '', {
        fontFamily: 'Rajdhani, sans-serif',
        fontSize: '32px',
        fontWeight: 'bold',
        color: '#ff6b35'
      }).setDepth(101);

      this.p2ComboText = this.add.text(W - 120, 180, '', {
        fontFamily: 'Rajdhani, sans-serif',
        fontSize: '32px',
        fontWeight: 'bold',
        color: '#ff6b35'
      }).setOrigin(1, 0).setDepth(101);
    }

    drawHUD(W, H) {
      if (!this.hudGraphics) return;
      var g = this.hudGraphics;
      g.clear();

      // Health Bar Dimensions
      var barW = 440;
      var barH = 24;
      var barY = 76;
      var p1BarX = 95;
      var p2BarX = W - 95 - barW;

      // P1 Health Background Bar
      g.fillStyle(0x222233, 0.85);
      g.fillRoundedRect(p1BarX, barY, barW, barH, 4);
      g.lineStyle(2, 0xdc143c, 1);
      g.strokeRoundedRect(p1BarX, barY, barW, barH, 4);

      // P1 Health Fill
      var p1Ratio = Math.max(0, this.fighter1.health / 100);
      var p1FillW = barW * p1Ratio;
      if (p1FillW > 0) {
        var p1Color = p1Ratio > 0.5 ? 0x00ff88 : (p1Ratio > 0.25 ? 0xffaa00 : 0xdc143c);
        g.fillStyle(p1Color, 1);
        g.fillRoundedRect(p1BarX, barY, p1FillW, barH, 4);
      }

      // P1 Special Cooldown Bar
      var specW = 180;
      var specH = 6;
      var specY = barY + barH + 6;
      g.fillStyle(0x333333, 0.8);
      g.fillRect(p1BarX, specY, specW, specH);
      var p1SpecReady = (this.fighter1.specialCooldown <= 0);
      var p1SpecRatio = p1SpecReady ? 1 : (1 - this.fighter1.specialCooldown / 180);
      g.fillStyle(p1SpecReady ? 0xffd700 : 0x5588cc, 1);
      g.fillRect(p1BarX, specY, specW * p1SpecRatio, specH);

      // P1 Round Win Markers
      for (var r1 = 0; r1 < 2; r1++) {
        var dotX = p1BarX + barW - 30 + r1 * 20;
        g.fillStyle(r1 < this.p1RoundWins ? 0xffd700 : 0x444455, 1);
        g.fillCircle(dotX, specY + 3, 5);
      }

      // P2 Health Background Bar
      g.fillStyle(0x222233, 0.85);
      g.fillRoundedRect(p2BarX, barY, barW, barH, 4);
      g.lineStyle(2, 0xdc143c, 1);
      g.strokeRoundedRect(p2BarX, barY, barW, barH, 4);

      // P2 Health Fill
      var p2Ratio = Math.max(0, this.fighter2.health / 100);
      var p2FillW = barW * p2Ratio;
      if (p2FillW > 0) {
        var p2Color = p2Ratio > 0.5 ? 0x00ff88 : (p2Ratio > 0.25 ? 0xffaa00 : 0xdc143c);
        g.fillStyle(p2Color, 1);
        g.fillRoundedRect(p2BarX + (barW - p2FillW), barY, p2FillW, barH, 4);
      }

      // P2 Special Cooldown Bar
      g.fillStyle(0x333333, 0.8);
      g.fillRect(p2BarX + barW - specW, specY, specW, specH);
      var p2SpecReady = (this.fighter2.specialCooldown <= 0);
      var p2SpecRatio = p2SpecReady ? 1 : (1 - this.fighter2.specialCooldown / 180);
      g.fillStyle(p2SpecReady ? 0xffd700 : 0x5588cc, 1);
      g.fillRect(p2BarX + barW - (specW * p2SpecRatio), specY, specW * p2SpecRatio, specH);

      // P2 Round Win Markers
      for (var r2 = 0; r2 < 2; r2++) {
        var dotX2 = p2BarX + 10 + r2 * 20;
        g.fillStyle(r2 < this.p2RoundWins ? 0xffd700 : 0x444455, 1);
        g.fillCircle(dotX2, specY + 3, 5);
      }
    }

    // ── Round Management ──────────────────────────────────────
    startRound(num) {
      this.roundNumber = num;
      this.roundActive = false;
      this.roundTimer = 99;
      this.timerAccumulator = 0;
      this.timerText.setText('99');
      this.timerText.setColor('#ffffff');

      // Reset Fighters
      this.fighter1.reset();
      this.fighter2.reset();

      var roundLabel = num === 3 ? 'FINAL ROUND' : ('ROUND ' + num);
      this.showAnnouncement(roundLabel, 1200, () => {
        this.showAnnouncement('FIGHT!', 800, () => {
          this.roundActive = true;
        });
      });
    }

    showAnnouncement(text, duration, onComplete) {
      this.announcementText.setText(text);
      this.announcementText.setScale(0.5);
      this.announcementText.setAlpha(0);

      this.tweens.add({
        targets: this.announcementText,
        scale: 1,
        alpha: 1,
        duration: 250,
        ease: 'Back.easeOut',
        onComplete: () => {
          this.time.delayedCall(duration, () => {
            this.tweens.add({
              targets: this.announcementText,
              alpha: 0,
              duration: 200,
              onComplete: () => {
                if (onComplete) onComplete();
              }
            });
          });
        }
      });
    }

    handleRoundEnd(victorIndex, reason) {
      if (!this.roundActive) return;
      this.roundActive = false;

      var label = reason === 'ko' ? 'K.O.!' : 'TIME UP!';
      if (victorIndex === 0) {
        this.p1RoundWins++;
        this.fighter1.setVictory();
        this.fighter2.setDefeat();
      } else if (victorIndex === 1) {
        this.p2RoundWins++;
        this.fighter2.setVictory();
        this.fighter1.setDefeat();
      }

      this.showAnnouncement(label, 1500, () => {
        // Check for Match Winner
        if (this.p1RoundWins >= 2 || this.p2RoundWins >= 2 || this.roundNumber >= 3) {
          var matchWinner = this.p1RoundWins > this.p2RoundWins ? 1 : (this.p2RoundWins > this.p1RoundWins ? 2 : (victorIndex !== -1 ? victorIndex + 1 : 1));
          this.handleMatchComplete(matchWinner);
        } else {
          // Next Round
          this.time.delayedCall(1000, () => {
            this.startRound(this.roundNumber + 1);
          });
        }
      });
    }

    handleMatchComplete(winnerPlayerNum) {
      this.matchOver = true;
      var winnerCharId = winnerPlayerNum === 1 ? this.p1CharId : this.p2CharId;
      var winnerChar = window.SANDAI.CHARACTERS[winnerCharId] || window.SANDAI.CHARACTERS[0];

      this.showAnnouncement(winnerChar.name.toUpperCase() + ' WINS!', 2000, () => {
        if (typeof window.SANDAI.onMatchComplete === 'function') {
          window.SANDAI.onMatchComplete({
            winner: winnerPlayerNum,
            winnerCharacter: winnerChar,
            p1RoundWins: this.p1RoundWins,
            p2RoundWins: this.p2RoundWins,
            p1Health: Math.round(this.fighter1.health),
            p2Health: Math.round(this.fighter2.health)
          });
        }
      });
    }

    // ── Online Socket Listeners ───────────────────────────────
    setupSocketListeners() {
      var socket = window.SANDAI.socket;
      var self = this;
      if (!socket) return;

      socket.off('game-action');
      socket.on('game-action', (data) => {
        if (!self.roundActive || self.matchOver) return;
        var act = data.action;
        var remoteFighter = (data.playerIndex === 0) ? self.fighter1 : self.fighter2;

        if (!remoteFighter) return;
        if (act === 'moveLeft') remoteFighter.moveLeft();
        else if (act === 'moveRight') remoteFighter.moveRight();
        else if (act === 'jump') remoteFighter.jump();
        else if (act === 'punch') remoteFighter.punch();
        else if (act === 'kick') remoteFighter.kick();
        else if (act === 'special') remoteFighter.special();
        else if (act === 'block') remoteFighter.block();
        else if (act === 'stopBlock') remoteFighter.stopBlocking();
      });

      socket.off('game-state');
      socket.on('game-state', (data) => {
        if (!self.roundActive || self.matchOver) return;
        if (self.localPlayerIndex === 1 && data.state) {
          var s = data.state;
          self.fighter1.x = Phaser.Math.Linear(self.fighter1.x, s.p1X, 0.4);
          self.fighter1.y = s.p1Y;
          self.fighter1.health = s.p1Hp;
          self.fighter2.x = Phaser.Math.Linear(self.fighter2.x, s.p2X, 0.4);
          self.fighter2.y = s.p2Y;
          self.fighter2.health = s.p2Hp;
          if (s.timer !== undefined) self.roundTimer = s.timer;
        }
      });
    }

    sendLocalAction(actionName) {
      if (!this.isOnline || !window.SANDAI.socket || !window.SANDAI.roomCode) return;
      window.SANDAI.socket.emit('game-action', {
        roomCode: window.SANDAI.roomCode,
        action: actionName
      });
    }

    // ── Main Game Loop ────────────────────────────────────────
    update(time, delta) {
      this.updateEmbers();
      this.drawHUD(1280, 720);

      if (!this.roundActive || this.matchOver) {
        if (this.fighter1) this.fighter1.update(delta);
        if (this.fighter2) this.fighter2.update(delta);
        return;
      }

      // Round Timer Countdown
      this.timerAccumulator += delta;
      if (this.timerAccumulator >= 1000) {
        this.timerAccumulator -= 1000;
        this.roundTimer--;
        this.timerText.setText(this.roundTimer.toString());
        if (this.roundTimer <= 10) {
          this.timerText.setColor('#ff3333');
        }
        if (this.roundTimer <= 0) {
          var victor = this.fighter1.health > this.fighter2.health ? 0 : (this.fighter2.health > this.fighter1.health ? 1 : -1);
          this.handleRoundEnd(victor, 'time');
          return;
        }
      }

      // Read Inputs
      var ctrl = window.SANDAI.Controls;
      var p1Input = ctrl ? ctrl.getP1Input() : {};
      var p2Input = ctrl ? ctrl.getP2Input() : {};

      // Handle Player 1
      if (!this.isOnline || this.localPlayerIndex === 0) {
        if (p1Input.left) { this.fighter1.moveLeft(); this.sendLocalAction('moveLeft'); }
        if (p1Input.right) { this.fighter1.moveRight(); this.sendLocalAction('moveRight'); }
        if (p1Input.jump) { this.fighter1.jump(); this.sendLocalAction('jump'); }
        if (p1Input.punch) { this.fighter1.punch(); this.sendLocalAction('punch'); }
        if (p1Input.kick) { this.fighter1.kick(); this.sendLocalAction('kick'); }
        if (p1Input.special) { this.fighter1.special(); this.sendLocalAction('special'); }
        if (p1Input.block) { this.fighter1.block(); this.sendLocalAction('block'); }
        else if (this.fighter1.isBlocking && !p1Input.block) { this.fighter1.stopBlocking(); this.sendLocalAction('stopBlock'); }
      }

      // Handle Player 2
      if (this.gameMode === 'ai' && this.ai) {
        this.ai.update(this.fighter1);
      } else if (this.gameMode === 'local') {
        if (p2Input.left) this.fighter2.moveLeft();
        if (p2Input.right) this.fighter2.moveRight();
        if (p2Input.jump) this.fighter2.jump();
        if (p2Input.punch) this.fighter2.punch();
        if (p2Input.kick) this.fighter2.kick();
        if (p2Input.special) this.fighter2.special();
        if (p2Input.block) this.fighter2.block();
        else if (this.fighter2.isBlocking && !p2Input.block) this.fighter2.stopBlocking();
      } else if (this.isOnline && this.localPlayerIndex === 1) {
        if (p1Input.left) { this.fighter2.moveLeft(); this.sendLocalAction('moveLeft'); }
        if (p1Input.right) { this.fighter2.moveRight(); this.sendLocalAction('moveRight'); }
        if (p1Input.jump) { this.fighter2.jump(); this.sendLocalAction('jump'); }
        if (p1Input.punch) { this.fighter2.punch(); this.sendLocalAction('punch'); }
        if (p1Input.kick) { this.fighter2.kick(); this.sendLocalAction('kick'); }
        if (p1Input.special) { this.fighter2.special(); this.sendLocalAction('special'); }
        if (p1Input.block) { this.fighter2.block(); this.sendLocalAction('block'); }
        else if (this.fighter2.isBlocking && !p1Input.block) { this.fighter2.stopBlocking(); this.sendLocalAction('stopBlock'); }
      }

      // Clear pressed single-frame inputs
      if (ctrl) ctrl.clearPressed();

      // Facing Direction
      this.fighter1.faceOpponent(this.fighter2);
      this.fighter2.faceOpponent(this.fighter1);

      // Fighter Updates & Collisions
      this.fighter1.update(delta);
      this.fighter2.update(delta);

      this.fighter1.checkHit(this.fighter2);
      this.fighter2.checkHit(this.fighter1);

      // Update Combo Texts
      if (this.fighter1.comboCount > 1) {
        this.p1ComboText.setText(this.fighter1.comboCount + ' HITS! COMBO');
      } else {
        this.p1ComboText.setText('');
      }

      if (this.fighter2.comboCount > 1) {
        this.p2ComboText.setText(this.fighter2.comboCount + ' HITS! COMBO');
      } else {
        this.p2ComboText.setText('');
      }

      // Health Check for KO
      if (this.fighter1.health <= 0) {
        this.handleRoundEnd(1, 'ko');
      } else if (this.fighter2.health <= 0) {
        this.handleRoundEnd(0, 'ko');
      }

      // Host State Sync (every 6 frames in online mode)
      if (this.isOnline && this.localPlayerIndex === 0 && window.SANDAI.socket) {
        this.stateSyncTimer++;
        if (this.stateSyncTimer >= 6) {
          this.stateSyncTimer = 0;
          window.SANDAI.socket.emit('game-state', {
            roomCode: window.SANDAI.roomCode,
            state: {
              p1X: Math.round(this.fighter1.x),
              p1Y: Math.round(this.fighter1.y),
              p1Hp: Math.round(this.fighter1.health),
              p2X: Math.round(this.fighter2.x),
              p2Y: Math.round(this.fighter2.y),
              p2Hp: Math.round(this.fighter2.health),
              timer: this.roundTimer
            }
          });
        }
      }
    }
  }

  // ── Global Interface ─────────────────────────────────────────

  function startGame() {
    stopGame();

    var config = {
      type: Phaser.AUTO,
      width: 1280,
      height: 720,
      parent: 'game-container',
      backgroundColor: '#0a0a0f',
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
      },
      scene: [FightScene]
    };

    gameInstance = new Phaser.Game(config);
  }

  function stopGame() {
    if (gameInstance) {
      gameInstance.destroy(true);
      gameInstance = null;
      currentScene = null;
    }
    if (window.SANDAI.Controls) {
      window.SANDAI.Controls.destroyKeyboard();
      window.SANDAI.Controls.destroyTouchControls();
    }
  }

  window.SANDAI.startGame = startGame;
  window.SANDAI.stopGame = stopGame;

})();
