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
      this.isTraining = (this.gameMode === 'training');

      // Match state
      this.roundNumber = 1;
      this.maxRounds = this.isTraining ? 999 : 3;
      this.p1RoundWins = 0;
      this.p2RoundWins = 0;
      this.roundTimer = this.isTraining ? 999 : 99;
      this.timerAccumulator = 0;
      this.roundActive = false;
      this.matchOver = false;
      this.stateSyncTimer = 0;
      this.lightningTimer = 0;

      // Next-Gen Combat Feel: Hit Stop & Slow-Motion KO
      this.hitStopFrames = 0;
      this.isSlowMo = false;
      this.slowMoTimer = 0;

      // Training Mode Controllers & Telemetry
      this.dummyMode = window.SANDAI.trainingDummyMode || 'stand';
      this.inputHistory = [];
      this.dummyRecoverTimer = 0;
      this.trainingStats = { lastHit: 0, comboDamage: 0, maxCombo: 0 };

      // Recoil health tracking for smooth fighting game health bar trails
      this.p1RecoilHealth = 100;
      this.p2RecoilHealth = 100;

      // Initialize Three.js 2.5D Real-time 3D Engine (Stage 2 Upgrade)
      this.renderer3d = null;
      this.selectedArena = window.SANDAI.selectedArena || 'mountain';
      if (window.SANDAI.Renderer3D && typeof THREE !== 'undefined') {
        try {
          this.renderer3d = new window.SANDAI.Renderer3D('game-container');
          this.renderer3d.loadArena(this.selectedArena);
          var p1Data = window.SANDAI.CHARACTERS[this.p1CharId] || window.SANDAI.CHARACTERS[0];
          var p2Data = window.SANDAI.CHARACTERS[this.p2CharId] || window.SANDAI.CHARACTERS[1];
          this.renderer3d.fighter1Mesh = this.renderer3d.createFighterModel(p1Data, 0);
          this.renderer3d.fighter2Mesh = this.renderer3d.createFighterModel(p2Data, 1);
          console.log('[SANDAI 2.5D] Three.js articulated 3D fighters & 3D arena initialized:', this.selectedArena);
        } catch (err3d) {
          console.warn('[SANDAI 2.5D] 3D initialization failed, falling back to 2D:', err3d);
          this.renderer3d = null;
        }
      }

      // Build Visual Arena
      this.createArenaBackground(W, H);

      // Create Full-Body Fighters
      this.fighter1 = new window.SANDAI.Fighter(this.p1CharId, 0, this);
      this.fighter2 = new window.SANDAI.Fighter(this.p2CharId, 1, this);

      this.fighter1.createSprite();
      this.fighter2.createSprite();

      // If 3D rendering is active, hide 2D sprites so 3D articulated models are displayed
      if (this.renderer3d) {
        if (this.fighter1.sprite) this.fighter1.sprite.setVisible(false);
        if (this.fighter2.sprite) this.fighter2.sprite.setVisible(false);
      }

      // AI Controller
      if (this.gameMode === 'ai') {
        this.ai = new window.SANDAI.AIController(this.fighter2, window.SANDAI.aiDifficulty || 'normal');
      } else {
        this.ai = null;
      }

      // Build HUD
      this.createHUD(W, H);

      window.SANDAI.activeFightScene = this;

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

    // ── Visual Arena Background System (5 Cinematic Environments) ──
    createArenaBackground(W, H) {
      if (this.renderer3d) {
        // Three.js 3D arena renders directly in real-time WebGL behind Phaser HUD
        return;
      }
      this.selectedArena = window.SANDAI.selectedArena || 'mountain';

      if (this.selectedArena === 'mountain') {
        this.renderMountainArena(W, H);
      } else if (this.selectedArena === 'forest') {
        this.renderForestArena(W, H);
      } else if (this.selectedArena === 'rainy') {
        this.renderRainyArena(W, H);
      } else if (this.selectedArena === 'volcanic') {
        this.renderVolcanicArena(W, H);
      } else {
        this.renderNightCityArena(W, H);
      }

      this.createArenaParticles(W, H);
    }

    // 1. Mountain Shrine Arena (Snowy mountains, moving clouds, fog, dusk lighting)
    renderMountainArena(W, H) {
      var bg = this.add.graphics().setDepth(0);

      // Dusk alpine sky gradient
      bg.fillGradientStyle(0x11162b, 0x11162b, 0x2b1e42, 0x44284d, 1);
      bg.fillRect(0, 0, W, H);

      // Distant Snowy Mountain Peaks (Layer 1 - Far)
      bg.fillStyle(0x1c2038, 0.85);
      bg.fillTriangle(0, 520, 260, 160, 520, 520);
      bg.fillTriangle(380, 520, 680, 120, 980, 520);
      bg.fillTriangle(760, 520, 1080, 180, 1280, 520);

      // Snow-capped peak tops
      bg.fillStyle(0xedf2ff, 0.95);
      bg.fillTriangle(210, 230, 260, 160, 310, 230);
      bg.fillTriangle(620, 200, 680, 120, 740, 200);
      bg.fillTriangle(1020, 250, 1080, 180, 1140, 250);

      // Midground Ridge (Layer 2)
      bg.fillStyle(0x131828, 0.95);
      bg.fillTriangle(-80, 520, 140, 280, 360, 520);
      bg.fillTriangle(260, 520, 480, 250, 700, 520);
      bg.fillTriangle(600, 520, 880, 270, 1160, 520);
      bg.fillTriangle(1040, 520, 1220, 310, 1380, 520);

      // Torii Shrine Pillars in background
      bg.fillStyle(0x8a1c22, 1);
      bg.fillRect(520, 280, 16, 240);
      bg.fillRect(740, 280, 16, 240);
      bg.fillRect(490, 290, 300, 16);
      bg.fillRect(505, 320, 270, 12);

      // Atmospheric Fog Bank
      bg.fillStyle(0xd5e2f5, 0.08);
      bg.fillRect(0, 360, W, 160);

      // Ground Stone Shrine Platform
      bg.fillGradientStyle(0x232738, 0x232738, 0x141622, 0x141622, 1);
      bg.fillRect(0, 520, W, H - 520);

      // Frost lines and snow edge
      bg.lineStyle(3, 0xaec9eb, 0.9);
      bg.lineBetween(0, 520, W, 520);

      bg.fillStyle(0xe8f0fa, 0.7);
      for (var sx = 0; sx < W; sx += 60) {
        bg.fillCircle(sx + 30, 522, 5);
      }

      // Stone Lanterns
      this.drawStoneLantern(bg, 140, 520, 0xffbb55);
      this.drawStoneLantern(bg, W - 140, 520, 0xffbb55);
    }

    // 2. Bamboo Forest Arena (Dense trees, sunlight rays, moving leaves, stone lanterns)
    renderForestArena(W, H) {
      var bg = this.add.graphics().setDepth(0);

      // Forest canopy sky gradient
      bg.fillGradientStyle(0x0a1c12, 0x0a1c12, 0x133822, 0x1f4a30, 1);
      bg.fillRect(0, 0, W, H);

      // Dense Bamboo Stalks in Background
      var bambooX = [40, 95, 160, 225, 290, 360, 420, 480, 550, 620, 690, 760, 830, 895, 960, 1030, 1100, 1170, 1230];
      for (var i = 0; i < bambooX.length; i++) {
        var bx = bambooX[i];
        var bw = (i % 2 === 0) ? 20 : 15;
        bg.fillStyle(0x0e2818, 0.85);
        bg.fillRect(bx, 0, bw, 520);
        // Bamboo nodes
        bg.fillStyle(0x071b0f, 1);
        for (var ny = 40; ny < 520; ny += 55) {
          bg.fillRect(bx - 2, ny, bw + 4, 4);
        }
      }

      // Golden God Rays / Sunlight Beams piercing misty canopy
      bg.fillStyle(0xfff3bb, 0.05);
      bg.fillTriangle(200, 0, 0, 520, 350, 520);
      bg.fillTriangle(600, 0, 420, 520, 780, 520);
      bg.fillTriangle(1050, 0, 880, 520, 1240, 520);

      // Ancient Bridge / Stone Slabs
      bg.fillGradientStyle(0x28201a, 0x28201a, 0x17120e, 0x17120e, 1);
      bg.fillRect(0, 520, W, H - 520);

      // Mossy edge
      bg.lineStyle(3, 0x48a855, 0.9);
      bg.lineBetween(0, 520, W, 520);

      bg.fillStyle(0x388243, 0.5);
      for (var mx = 10; mx < W; mx += 35) {
        bg.fillRect(mx, 520, 18, 4);
      }

      // Ancient Mossy Lanterns
      this.drawStoneLantern(bg, 160, 520, 0xffa033);
      this.drawStoneLantern(bg, W - 160, 520, 0xffa033);
    }

    // 3. Stormy Rainy Arena (Rain streaks, storm clouds, lightning, wet puddle reflections)
    renderRainyArena(W, H) {
      var bg = this.add.graphics().setDepth(0);

      // Brooding storm sky
      bg.fillGradientStyle(0x080c14, 0x080c14, 0x121b2b, 0x18263d, 1);
      bg.fillRect(0, 0, W, H);

      // Five-Story Pagoda Silhouette
      bg.fillStyle(0x0b121e, 0.92);
      // Main Pagoda Tower
      var px = 640;
      var py = 520;
      for (var f = 0; f < 5; f++) {
        var fw = 110 - f * 14;
        var rw = fw + 50;
        var fy = py - (f + 1) * 60;
        bg.fillRect(px - fw / 2, fy, fw, 60);
        // Roof flare
        bg.fillTriangle(px - rw / 2, fy, px, fy - 18, px + rw / 2, fy);
      }
      // Pagoda Spire
      bg.fillRect(px - 3, py - 350, 6, 60);

      // Rain Puddle Reflections & Wet Stone Tiles
      bg.fillGradientStyle(0x161e2b, 0x161e2b, 0x0a0e16, 0x0a0e16, 1);
      bg.fillRect(0, 520, W, H - 520);

      bg.lineStyle(2, 0x4876a8, 0.8);
      bg.lineBetween(0, 520, W, 520);

      // Wet reflections
      bg.fillStyle(0x4070a0, 0.25);
      bg.fillEllipse(320, 560, 160, 24);
      bg.fillEllipse(960, 560, 160, 24);
      bg.fillEllipse(640, 610, 220, 28);
    }

    // 4. Volcanic Molten Arena (Lava river, smoke, rising embers, burning rocks)
    renderVolcanicArena(W, H) {
      var bg = this.add.graphics().setDepth(0);

      // Dark volcanic cavern sky
      bg.fillGradientStyle(0x1f0606, 0x1f0606, 0x3d0d0d, 0x4a1208, 1);
      bg.fillRect(0, 0, W, H);

      // Jagged Volcanic Spire Mountains
      bg.fillStyle(0x160707, 1);
      bg.fillTriangle(0, 520, 180, 180, 360, 520);
      bg.fillTriangle(260, 520, 480, 220, 700, 520);
      bg.fillTriangle(580, 520, 780, 160, 980, 520);
      bg.fillTriangle(860, 520, 1100, 210, 1280, 520);

      // Flowing Molten Lava River in Background
      bg.fillStyle(0xff4500, 0.85);
      bg.fillRect(0, 440, W, 80);
      bg.fillStyle(0xffaa00, 0.9);
      for (var lx = 0; lx < W; lx += 80) {
        bg.fillEllipse(lx + 40, 480, 50, 18);
      }

      // Burning Volcanic Basalt Floor
      bg.fillGradientStyle(0x280e0a, 0x280e0a, 0x120604, 0x120604, 1);
      bg.fillRect(0, 520, W, H - 520);

      // Glowing Magma Fissures beneath fighters
      bg.lineStyle(3, 0xff3b00, 0.95);
      bg.lineBetween(0, 520, W, 520);

      bg.lineStyle(2, 0xff7700, 0.65);
      for (var fx = 0; fx < W; fx += 55) {
        bg.lineBetween(fx, 520, fx + (fx - W / 2) * 0.35, H);
      }

      // Cavern Stalactites from ceiling
      bg.fillStyle(0x1a0707, 1);
      for (var st = 40; st < W; st += 90) {
        var stH = (st % 3 === 0) ? 90 : 60;
        bg.fillTriangle(st - 25, 0, st, stH, st + 25, 0);
      }
    }

    // 5. Night City Cyberpunk Arena (Neon lights, skyscrapers, rooftop skyline)
    renderNightCityArena(W, H) {
      var bg = this.add.graphics().setDepth(0);

      // Deep arcade night sky gradient
      bg.fillGradientStyle(0x060610, 0x060610, 0x150b24, 0x200a26, 1);
      bg.fillRect(0, 0, W, H);

      // Cyberpunk Skyscraper Silhouettes with Neon Windows
      bg.fillStyle(0x0e0e1a, 0.95);
      var buildings = [
        { x: 30, w: 90, h: 280, neon: 0x00f0ff },
        { x: 130, w: 70, h: 350, neon: 0xff007f },
        { x: 210, w: 110, h: 240, neon: 0xffaa00 },
        { x: 330, w: 85, h: 370, neon: 0x00ff88 },
        { x: 425, w: 100, h: 290, neon: 0x00f0ff },
        { x: 535, w: 60, h: 390, neon: 0xff1744 },
        { x: 605, w: 120, h: 260, neon: 0xffd700 },
        { x: 735, w: 85, h: 380, neon: 0x00f0ff },
        { x: 830, w: 110, h: 310, neon: 0xff00aa },
        { x: 950, w: 95, h: 350, neon: 0x3d84ff },
        { x: 1055, w: 80, h: 270, neon: 0xffaa00 },
        { x: 1145, w: 110, h: 330, neon: 0x00f0ff }
      ];

      for (var i = 0; i < buildings.length; i++) {
        var b = buildings[i];
        bg.fillRect(b.x, 520 - b.h, b.w, b.h);
        bg.fillStyle(b.neon, 0.4);
        for (var wy = 520 - b.h + 20; wy < 500; wy += 32) {
          for (var wx = b.x + 12; wx < b.x + b.w - 15; wx += 20) {
            if ((wx + wy) % 2 === 0) {
              bg.fillRect(wx, wy, 8, 12);
            }
          }
        }
        bg.fillStyle(0x0e0e1a, 0.95);
      }

      // Neon Holographic Billboards
      bg.fillStyle(0x00f0ff, 0.2);
      bg.fillRoundedRect(220, 160, 90, 45, 6);
      bg.lineStyle(2, 0x00f0ff, 0.9);
      bg.strokeRoundedRect(220, 160, 90, 45, 6);

      bg.fillStyle(0xff007f, 0.2);
      bg.fillRoundedRect(960, 150, 85, 45, 6);
      bg.lineStyle(2, 0xff007f, 0.9);
      bg.strokeRoundedRect(960, 150, 85, 45, 6);

      // Rooftop Stage Floor
      bg.fillGradientStyle(0x1a1224, 0x1a1224, 0x0d0714, 0x0d0714, 1);
      bg.fillRect(0, 520, W, H - 520);

      // Neon Warning Edge
      bg.lineStyle(3, 0xff1744, 0.9);
      bg.lineBetween(0, 520, W, 520);

      bg.lineStyle(1, 0x00f0ff, 0.4);
      for (var lx = 0; lx <= W; lx += 40) {
        bg.lineBetween(lx, 520, lx + (lx - W / 2) * 0.4, H);
      }
    }

    // Helper: Draw Traditional Stone Lantern
    drawStoneLantern(bg, x, y, lightColor) {
      bg.fillStyle(0x2d323f, 1);
      // Base
      bg.fillRect(x - 18, y - 10, 36, 10);
      // Post
      bg.fillRect(x - 8, y - 65, 16, 55);
      // Light chamber
      bg.fillRect(x - 16, y - 95, 32, 30);
      // Light glow
      bg.fillStyle(lightColor, 0.85);
      bg.fillRect(x - 10, y - 90, 20, 20);
      // Roof cap
      bg.fillStyle(0x1e222d, 1);
      bg.fillTriangle(x - 24, y - 95, x, y - 115, x + 24, y - 95);
    }

    // ── Environmental Particle Engine (Arena-Specific) ───────────
    createArenaParticles(W, H) {
      this.arenaParticles = [];
      var count = 35;
      var arena = this.selectedArena;

      for (var i = 0; i < count; i++) {
        var p = {};
        if (arena === 'mountain') {
          // Drifting Snow Flakes
          p = this.add.circle(
            Phaser.Math.Between(0, W),
            Phaser.Math.Between(0, H),
            Phaser.Math.Between(1.5, 3.5),
            0xffffff,
            Phaser.Math.FloatBetween(0.4, 0.9)
          ).setDepth(25);
          p.speedY = Phaser.Math.FloatBetween(0.8, 2.2);
          p.speedX = Phaser.Math.FloatBetween(-1.5, -0.5);
        } else if (arena === 'forest') {
          // Floating Leaves
          p = this.add.circle(
            Phaser.Math.Between(0, W),
            Phaser.Math.Between(0, H),
            Phaser.Math.Between(2, 4.5),
            Phaser.Math.RND.pick([0x48a855, 0x85cc66, 0xff99bb]),
            Phaser.Math.FloatBetween(0.4, 0.85)
          ).setDepth(25);
          p.speedY = Phaser.Math.FloatBetween(0.6, 1.8);
          p.speedX = Phaser.Math.FloatBetween(-0.8, 0.8);
        } else if (arena === 'rainy') {
          // Rain Streaks
          p = this.add.rectangle(
            Phaser.Math.Between(0, W),
            Phaser.Math.Between(0, H),
            2,
            Phaser.Math.Between(14, 24),
            0x7eb3e6,
            Phaser.Math.FloatBetween(0.35, 0.75)
          ).setDepth(25);
          p.speedY = Phaser.Math.FloatBetween(12, 18);
          p.speedX = Phaser.Math.FloatBetween(-3, -2);
        } else if (arena === 'volcanic') {
          // Rising Volcanic Embers
          p = this.add.circle(
            Phaser.Math.Between(0, W),
            Phaser.Math.Between(200, 680),
            Phaser.Math.Between(2, 4),
            Phaser.Math.RND.pick([0xff3300, 0xff7700, 0xffd700]),
            Phaser.Math.FloatBetween(0.4, 0.9)
          ).setDepth(25);
          p.speedY = Phaser.Math.FloatBetween(-1.2, -2.8);
          p.speedX = Phaser.Math.FloatBetween(-0.6, 0.6);
        } else {
          // Cyber Neon Dust
          p = this.add.circle(
            Phaser.Math.Between(0, W),
            Phaser.Math.Between(100, 650),
            Phaser.Math.Between(1.5, 3),
            Phaser.Math.RND.pick([0x00f0ff, 0xff00aa, 0xffd700]),
            Phaser.Math.FloatBetween(0.3, 0.8)
          ).setDepth(25);
          p.speedY = Phaser.Math.FloatBetween(-0.4, -1.0);
          p.speedX = Phaser.Math.FloatBetween(-0.4, 0.4);
        }

        this.arenaParticles.push(p);
      }
    }

    updateArenaParticles(delta) {
      if (!this.arenaParticles) return;
      var W = 1280;
      var H = 720;
      var arena = this.selectedArena;

      for (var i = 0; i < this.arenaParticles.length; i++) {
        var p = this.arenaParticles[i];
        p.y += p.speedY;
        p.x += p.speedX;

        if (arena === 'volcanic' || arena === 'nightcity') {
          if (p.y < 40) {
            p.y = 660;
            p.x = Phaser.Math.Between(40, W - 40);
          }
        } else {
          if (p.y > H + 10) {
            p.y = -10;
            p.x = Phaser.Math.Between(0, W + 100);
          }
        }
      }

      // Rainy Arena: Trigger random lightning strikes
      if (arena === 'rainy' && this.roundActive) {
        this.lightningTimer += delta;
        if (this.lightningTimer > 4500 && Phaser.Math.Between(1, 100) > 96) {
          this.lightningTimer = 0;
          this.triggerLightningFlash();
        }
      }
    }

    triggerLightningFlash() {
      this.cameras.main.flash(180, 230, 240, 255);
      this.cameras.main.shake(120, 0.006);
    }

    // ── Combat Hit Sparks & Shockwaves ────────────────────────────
    onHitLanded(attacker, defender, attackType, impactX, impactY, isCounter) {
      // 1. Camera Shake & Hit-Stop Freeze Frame
      if (isCounter) {
        this.cameras.main.shake(260, 0.022);
        this.triggerHitStop(3); // Micro-pause on Counter Hit
      } else if (attackType === 'special') {
        this.cameras.main.shake(280, 0.024);
        this.triggerHitStop(4); // Dramatic freeze on Special
      } else if (attackType === 'kick') {
        this.cameras.main.shake(190, 0.015);
        this.triggerHitStop(2); // Punchy freeze on Heavy Kick
      } else {
        this.cameras.main.shake(120, 0.008);
        this.triggerHitStop(1);
      }

      // 2. Floating Combat Feedback Banners
      if (defender && defender.isGuardBroken) {
        this.showFloatingBanner('PUNISH!', impactX, impactY - 60, '#ffd700');
      }

      // 3. Dynamic Hit Sparks
      var sparkCount = attackType === 'special' ? 26 : (attackType === 'kick' ? 18 : 12);
      if (isCounter) sparkCount += 10;
      var charData = window.SANDAI.CHARACTERS[attacker.charId] || window.SANDAI.CHARACTERS[0];
      var sparkColors = [0xffffff, 0xffd700, 0xff6b35, 0xdc143c];
      if (charData && charData.color) {
        try {
          var pCol = parseInt(charData.color.replace('#', '0x'), 16);
          sparkColors.unshift(pCol);
        } catch (e) { }
      }

      for (var i = 0; i < sparkCount; i++) {
        var angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
        var speed = Phaser.Math.FloatBetween(3, attackType === 'special' ? 13 : 8);
        var spark = this.add.circle(
          impactX + Phaser.Math.Between(-6, 6),
          impactY + Phaser.Math.Between(-6, 6),
          Phaser.Math.Between(2, attackType === 'special' ? 5.5 : 4),
          Phaser.Math.RND.pick(sparkColors),
          1
        ).setDepth(30);

        this.tweens.add({
          targets: spark,
          x: spark.x + Math.cos(angle) * speed * 12,
          y: spark.y + Math.sin(angle) * speed * 12,
          scaleX: 0,
          scaleY: 0,
          alpha: 0,
          duration: Phaser.Math.Between(180, 320),
          ease: 'Cubic.easeOut',
          onComplete: function (tw, targets) {
            if (targets[0]) targets[0].destroy();
          }
        });
      }

      // 4. Expanding Shockwave Ring
      var shockwave = this.add.circle(impactX, impactY, 14)
        .setStrokeStyle(3.5, isCounter ? 0xff1744 : (attackType === 'special' ? 0xffd700 : 0xffffff), 1)
        .setDepth(31);
      this.tweens.add({
        targets: shockwave,
        radius: attackType === 'special' ? 70 : 45,
        alpha: 0,
        duration: 230,
        ease: 'Quad.easeOut',
        onComplete: function () {
          shockwave.destroy();
        }
      });

      // 5. Trigger 3D Hit Sparks & VFX in Three.js Scene
      if (this.renderer3d) {
        if (attackType === 'special') {
          this.renderer3d.triggerSpecialVFX(attacker.charId, impactX, impactY, attacker.facing);
        } else {
          this.renderer3d.triggerHitVFX(impactX, impactY, attackType === 'kick' || isCounter, false);
        }
      }

      // 6. Sound Effects via Web Audio Synthesizer
      if (window.SANDAI && window.SANDAI.Audio) {
        if (defender && defender.isBlocking && !defender.isGuardBroken) {
          window.SANDAI.Audio.playBlock();
        } else {
          if (attackType === 'special') {
            window.SANDAI.Audio.playSpecial(attacker.charId);
          } else if (attackType === 'kick') {
            window.SANDAI.Audio.playKick();
          } else {
            window.SANDAI.Audio.playPunch();
          }
          window.SANDAI.Audio.playHit();
        }
      }
    }

    // ── Floating Combat Announcement Banners ─────────────────────
    showFloatingBanner(text, x, y, color) {
      var self = this;
      var banner = this.add.text(x, y, text, {
        fontFamily: 'Rajdhani, sans-serif',
        fontSize: '28px',
        fontWeight: 'bold',
        color: color || '#ffd700',
        stroke: '#000000',
        strokeThickness: 5
      }).setOrigin(0.5).setDepth(210);

      this.tweens.add({
        targets: banner,
        y: y - 45,
        scale: 1.25,
        alpha: 0,
        duration: 750,
        ease: 'Cubic.easeOut',
        onComplete: function () {
          banner.destroy();
        }
      });
    }

    // ── Hit-Stop Freeze Frame (Micro-pause on heavy impact) ──────
    triggerHitStop(frames) {
      this.hitStopFrames = Math.max(this.hitStopFrames, frames || 2);
    }

    // ── Console-Grade Fighting HUD (Tekken 8 / MK11 Style) ────────
    createHUD(W, H) {
      this.hudGraphics = this.add.graphics().setDepth(100);

      var p1Data = window.SANDAI.CHARACTERS[this.p1CharId] || window.SANDAI.CHARACTERS[0];
      var p2Data = window.SANDAI.CHARACTERS[this.p2CharId] || window.SANDAI.CHARACTERS[1];
      var isMobile = (window.SANDAI && window.SANDAI.deviceType === 'mobile') || W < 950;

      var p1PortX = isMobile ? 36 : 55;
      var p1PortY = isMobile ? 44 : 52;
      var portSize = isMobile ? 50 : 64;
      var p1TextX = isMobile ? 68 : 95;

      var p2PortX = W - (isMobile ? 36 : 55);
      var p2PortY = isMobile ? 44 : 52;
      var p2TextX = W - (isMobile ? 68 : 95);

      // P1 Portrait & Angled Frame
      if (this.textures.exists('portrait_' + p1Data.name)) {
        this.add.image(p1PortX, p1PortY, 'portrait_' + p1Data.name).setDisplaySize(portSize, portSize).setDepth(101);
      }
      // Strict Name Purity: Plain original character name only!
      this.p1NameText = this.add.text(p1TextX, isMobile ? 18 : 24, p1Data.name.toUpperCase(), {
        fontFamily: 'Rajdhani, sans-serif',
        fontSize: isMobile ? '20px' : '26px',
        fontWeight: '700',
        color: '#ffffff'
      }).setDepth(101);
      this.p1StyleText = this.add.text(p1TextX, isMobile ? 42 : 52, p1Data.style, {
        fontFamily: 'Inter, sans-serif',
        fontSize: isMobile ? '10px' : '11px',
        color: '#00f0ff'
      }).setDepth(101);

      // P2 Portrait & Angled Frame
      if (this.textures.exists('portrait_' + p2Data.name)) {
        this.add.image(p2PortX, p2PortY, 'portrait_' + p2Data.name).setDisplaySize(portSize, portSize).setDepth(101);
      }
      this.p2NameText = this.add.text(p2TextX, isMobile ? 18 : 24, p2Data.name.toUpperCase(), {
        fontFamily: 'Rajdhani, sans-serif',
        fontSize: isMobile ? '20px' : '26px',
        fontWeight: '700',
        color: '#ffffff'
      }).setOrigin(1, 0).setDepth(101);
      this.p2StyleText = this.add.text(p2TextX, isMobile ? 42 : 52, p2Data.style, {
        fontFamily: 'Inter, sans-serif',
        fontSize: isMobile ? '10px' : '11px',
        color: '#ff1744'
      }).setOrigin(1, 0).setDepth(101);

      // Central Hexagonal Timer Display
      this.timerText = this.add.text(W / 2, isMobile ? 42 : 48, this.isTraining ? '∞' : '99', {
        fontFamily: 'Rajdhani, sans-serif',
        fontSize: isMobile ? '38px' : '48px',
        fontWeight: 'bold',
        color: '#ffffff'
      }).setOrigin(0.5).setDepth(102);

      // Round & Match Announcement Text (Centered)
      this.announcementText = this.add.text(W / 2, H / 2 - 60, '', {
        fontFamily: 'Rajdhani, sans-serif',
        fontSize: isMobile ? '52px' : '76px',
        fontWeight: 'bold',
        color: '#ffd700',
        stroke: '#000000',
        strokeThickness: isMobile ? 6 : 8
      }).setOrigin(0.5).setDepth(200);

      // Combo Texts with dynamic damage badge
      this.p1ComboText = this.add.text(isMobile ? 70 : 120, isMobile ? 140 : 175, '', {
        fontFamily: 'Rajdhani, sans-serif',
        fontSize: isMobile ? '26px' : '34px',
        fontWeight: 'bold',
        color: '#ff6b35'
      }).setDepth(101);

      this.p2ComboText = this.add.text(W - (isMobile ? 70 : 120), isMobile ? 140 : 175, '', {
        fontFamily: 'Rajdhani, sans-serif',
        fontSize: isMobile ? '26px' : '34px',
        fontWeight: 'bold',
        color: '#ff6b35'
      }).setOrigin(1, 0).setDepth(101);

      // Bottom Super Energy Meter Banner Texts
      this.p1SuperText = this.add.text(isMobile ? (W / 2 - 95) : 95, isMobile ? (H - 42) : (H - 54), 'ENERGY: 0%', {
        fontFamily: 'Rajdhani, sans-serif',
        fontSize: isMobile ? '11px' : '13px',
        fontWeight: '700',
        color: '#00f0ff'
      }).setOrigin(isMobile ? 0.5 : 0, 0).setDepth(101);

      this.p2SuperText = this.add.text(isMobile ? (W / 2 + 95) : (W - 95), isMobile ? (H - 42) : (H - 54), 'ENERGY: 0%', {
        fontFamily: 'Rajdhani, sans-serif',
        fontSize: isMobile ? '11px' : '13px',
        fontWeight: '700',
        color: '#ff1744'
      }).setOrigin(isMobile ? 0.5 : 1, 0).setDepth(101);

      // Training Mode Telemetry & Input History Overlays
      if (this.isTraining) {
        this.trainingStatsText = this.add.text(W / 2, 95, 'TRAINING MODE • DUMMY: STAND', {
          fontFamily: 'Rajdhani, sans-serif',
          fontSize: '15px',
          fontWeight: '700',
          color: '#00f0ff'
        }).setOrigin(0.5).setDepth(101);

        this.inputHistoryText = this.add.text(25, H - 85, 'INPUTS: [READY]', {
          fontFamily: 'Rajdhani, sans-serif',
          fontSize: '16px',
          fontWeight: '600',
          color: '#ffd700',
          backgroundColor: '#0a0a10cc',
          padding: { x: 8, y: 4 }
        }).setDepth(101);
      }
    }

    drawHUD(W, H) {
      if (!this.hudGraphics) return;
      var g = this.hudGraphics;
      g.clear();

      // Smooth Recoil Health Bar Draining
      if (this.p1RecoilHealth > this.fighter1.health) {
        this.p1RecoilHealth = Math.max(this.fighter1.health, this.p1RecoilHealth - 0.45);
      } else {
        this.p1RecoilHealth = this.fighter1.health;
      }
      if (this.p2RecoilHealth > this.fighter2.health) {
        this.p2RecoilHealth = Math.max(this.fighter2.health, this.p2RecoilHealth - 0.45);
      } else {
        this.p2RecoilHealth = this.fighter2.health;
      }

      // Health Bar Dimensions (Tekken 8 / MK11 angled look)
      var isMobile = (window.SANDAI && window.SANDAI.deviceType === 'mobile') || W < 950;
      var p1BarX = isMobile ? 68 : 95;
      var timerGap = isMobile ? 80 : 120;
      var maxHalf = (W / 2) - p1BarX - (timerGap / 2);
      var barW = Math.min(450, Math.max(160, maxHalf));
      var barH = isMobile ? 22 : 26;
      var barY = isMobile ? 60 : 72;
      var p2BarX = W - p1BarX - barW;

      // ── P1 HEALTH BAR ──
      // Background bar with metallic border
      g.fillStyle(0x10121a, 0.95);
      g.fillRoundedRect(p1BarX, barY, barW, barH, 4);
      g.lineStyle(2.5, 0x00f0ff, 0.85);
      g.strokeRoundedRect(p1BarX, barY, barW, barH, 4);

      // P1 Recoil Bar (Golden damage trail)
      var p1RecoilW = barW * Math.max(0, this.p1RecoilHealth / 100);
      if (p1RecoilW > 0) {
        g.fillStyle(0xff9900, 0.95);
        g.fillRoundedRect(p1BarX, barY, p1RecoilW, barH, 4);
      }

      // P1 Health Fill
      var p1Ratio = Math.max(0, this.fighter1.health / 100);
      var p1FillW = barW * p1Ratio;
      if (p1FillW > 0) {
        var p1Color = p1Ratio > 0.5 ? 0x00e676 : (p1Ratio > 0.25 ? 0xffb300 : 0xff1744);
        g.fillStyle(p1Color, 1);
        g.fillRoundedRect(p1BarX, barY, p1FillW, barH, 4);
      }

      // P1 Guard Stamina Meter (Underneath health bar)
      var guardW = 320;
      var guardH = 5;
      var guardY = barY + barH + 4;
      g.fillStyle(0x161824, 0.9);
      g.fillRect(p1BarX, guardY, guardW, guardH);
      var p1GuardRatio = Math.max(0, (this.fighter1.guardStamina || 100) / 100);
      var p1GuardCol = this.fighter1.isGuardBroken ? 0xe040fb : (p1GuardRatio > 0.4 ? 0x00e5ff : 0xff1744);
      g.fillStyle(p1GuardCol, 1);
      g.fillRect(p1BarX, guardY, guardW * p1GuardRatio, guardH);

      // P1 Round Win Diamonds (Dragon gem pips)
      for (var r1 = 0; r1 < 2; r1++) {
        var dotX = p1BarX + barW - 35 + r1 * 24;
        var r1Won = r1 < this.p1RoundWins;
        g.fillStyle(r1Won ? 0xffd700 : 0x242838, 1);
        g.fillTriangle(dotX, guardY - 2, dotX + 7, guardY + 5, dotX - 7, guardY + 5);
        g.fillTriangle(dotX, guardY + 12, dotX + 7, guardY + 5, dotX - 7, guardY + 5);
        if (r1Won) {
          g.lineStyle(1.5, 0xffffff, 0.9);
          g.strokeCircle(dotX, guardY + 5, 8);
        }
      }

      // ── P2 HEALTH BAR ──
      g.fillStyle(0x10121a, 0.95);
      g.fillRoundedRect(p2BarX, barY, barW, barH, 4);
      g.lineStyle(2.5, 0xff1744, 0.85);
      g.strokeRoundedRect(p2BarX, barY, barW, barH, 4);

      // P2 Recoil Bar (Golden damage trail)
      var p2RecoilW = barW * Math.max(0, this.p2RecoilHealth / 100);
      if (p2RecoilW > 0) {
        g.fillStyle(0xff9900, 0.95);
        g.fillRoundedRect(p2BarX + (barW - p2RecoilW), barY, p2RecoilW, barH, 4);
      }

      // P2 Health Fill
      var p2Ratio = Math.max(0, this.fighter2.health / 100);
      var p2FillW = barW * p2Ratio;
      if (p2FillW > 0) {
        var p2Color = p2Ratio > 0.5 ? 0x00e676 : (p2Ratio > 0.25 ? 0xffb300 : 0xff1744);
        g.fillStyle(p2Color, 1);
        g.fillRoundedRect(p2BarX + (barW - p2FillW), barY, p2FillW, barH, 4);
      }

      // P2 Guard Stamina Meter
      g.fillStyle(0x161824, 0.9);
      g.fillRect(p2BarX + barW - guardW, guardY, guardW, guardH);
      var p2GuardRatio = Math.max(0, (this.fighter2.guardStamina || 100) / 100);
      var p2GuardCol = this.fighter2.isGuardBroken ? 0xe040fb : (p2GuardRatio > 0.4 ? 0x00e5ff : 0xff1744);
      g.fillStyle(p2GuardCol, 1);
      g.fillRect(p2BarX + barW - (guardW * p2GuardRatio), guardY, guardW * p2GuardRatio, guardH);

      // P2 Round Win Diamonds (Dragon gem pips)
      for (var r2 = 0; r2 < 2; r2++) {
        var dotX2 = p2BarX + 15 + r2 * 24;
        var r2Won = r2 < this.p2RoundWins;
        g.fillStyle(r2Won ? 0xffd700 : 0x242838, 1);
        g.fillTriangle(dotX2, guardY - 2, dotX2 + 7, guardY + 5, dotX2 - 7, guardY + 5);
        g.fillTriangle(dotX2, guardY + 12, dotX2 + 7, guardY + 5, dotX2 - 7, guardY + 5);
        if (r2Won) {
          g.lineStyle(1.5, 0xffffff, 0.9);
          g.strokeCircle(dotX2, guardY + 5, 8);
        }
      }

      // ── BOTTOM SUPER ENERGY GAUGES (0-100% with Special Ready Glow) ──
      var gaugeW = isMobile ? Math.min(180, (W / 2) - 45) : Math.min(320, barW);
      var gaugeH = isMobile ? 12 : 16;
      var gaugeY = isMobile ? (H - 26) : (H - 36);

      var p1GaugeX = isMobile ? ((W / 2) - gaugeW - 12) : p1BarX;
      var p2GaugeX = isMobile ? ((W / 2) + 12) : (p2BarX + barW - gaugeW);

      // P1 Super Gauge (Left)
      var p1Energy = Math.max(0, Math.min(100, this.fighter1.energy || 0));
      g.fillStyle(0x0e1018, 0.9);
      g.fillRoundedRect(p1GaugeX, gaugeY, gaugeW, gaugeH, 3);
      g.lineStyle(2, p1Energy >= 50 ? 0xffd700 : 0x00f0ff, 0.85);
      g.strokeRoundedRect(p1GaugeX, gaugeY, gaugeW, gaugeH, 3);

      var p1EnergyFillW = gaugeW * (p1Energy / 100);
      if (p1EnergyFillW > 0) {
        g.fillStyle(p1Energy >= 50 ? 0xffd700 : 0x00e5ff, 1);
        g.fillRoundedRect(p1GaugeX, gaugeY, p1EnergyFillW, gaugeH, 3);
      }
      // 50% Threshold Segment Divider
      g.fillStyle(0xffffff, 0.9);
      g.fillRect(p1GaugeX + gaugeW * 0.5 - 1, gaugeY, 2, gaugeH);

      if (this.p1SuperText) {
        if (isMobile) {
          this.p1SuperText.setPosition(p1GaugeX + gaugeW / 2, gaugeY - 14).setOrigin(0.5, 0);
        } else {
          this.p1SuperText.setPosition(p1BarX, H - 54).setOrigin(0, 0);
        }
        if (p1Energy >= 100) {
          this.p1SuperText.setText('★ MAX SPECIAL READY ★').setColor('#ffd700');
        } else if (p1Energy >= 50) {
          this.p1SuperText.setText('⚡ SPECIAL READY (' + Math.round(p1Energy) + '%)').setColor('#00ff88');
        } else {
          this.p1SuperText.setText('ENERGY: ' + Math.round(p1Energy) + '%').setColor('#00f0ff');
        }
      }

      // P2 Super Gauge (Right)
      var p2Energy = Math.max(0, Math.min(100, this.fighter2.energy || 0));
      g.fillStyle(0x0e1018, 0.9);
      g.fillRoundedRect(p2GaugeX, gaugeY, gaugeW, gaugeH, 3);
      g.lineStyle(2, p2Energy >= 50 ? 0xffd700 : 0xff1744, 0.85);
      g.strokeRoundedRect(p2GaugeX, gaugeY, gaugeW, gaugeH, 3);

      var p2EnergyFillW = gaugeW * (p2Energy / 100);
      if (p2EnergyFillW > 0) {
        g.fillStyle(p2Energy >= 50 ? 0xffd700 : 0xff1744, 1);
        g.fillRoundedRect(p2GaugeX + barW - p2EnergyFillW, gaugeY, p2EnergyFillW, gaugeH, 3);
      }
      g.fillStyle(0xffffff, 0.9);
      g.fillRect(p2GaugeX + gaugeW * 0.5 - 1, gaugeY, 2, gaugeH);

      if (this.p2SuperText) {
        if (isMobile) {
          this.p2SuperText.setPosition(p2GaugeX + gaugeW / 2, gaugeY - 14).setOrigin(0.5, 0);
        } else {
          this.p2SuperText.setPosition(p2BarX + barW, H - 54).setOrigin(1, 0);
        }
        if (p2Energy >= 100) {
          this.p2SuperText.setText('★ MAX SPECIAL READY ★').setColor('#ffd700');
        } else if (p2Energy >= 50) {
          this.p2SuperText.setText('⚡ SPECIAL READY (' + Math.round(p2Energy) + '%)').setColor('#00ff88');
        } else {
          this.p2SuperText.setText('ENERGY: ' + Math.round(p2Energy) + '%').setColor('#ff1744');
        }
      }
    }

    // ── Round Management ──────────────────────────────────────
    startRound(num) {
      this.roundNumber = num;
      this.roundActive = false;
      this.roundTimer = this.isTraining ? 999 : 99;
      this.timerAccumulator = 0;
      this.timerText.setText(this.isTraining ? '∞' : '99');
      this.timerText.setColor('#ffffff');

      // Reset Fighters
      this.fighter1.reset();
      this.fighter2.reset();

      // Trigger Arena Ambience & Gong via Procedural Audio Engine
      if (window.SANDAI && window.SANDAI.Audio) {
        window.SANDAI.Audio.playRoundStart();
        window.SANDAI.Audio.startAmbience(this.selectedArena);
      }

      var roundLabel = this.isTraining ? 'TRAINING MODE' : (num === 3 ? 'FINAL ROUND' : ('ROUND ' + num));
      this.showAnnouncement(roundLabel, 1100, () => {
        this.cameras.main.shake(140, 0.01);
        this.showAnnouncement(this.isTraining ? 'PRACTICE!' : 'FIGHT!', 800, () => {
          this.roundActive = true;
        });
      });
    }

    showAnnouncement(text, duration, onComplete) {
      this.announcementText.setText(text);
      this.announcementText.setScale(0.3);
      this.announcementText.setAlpha(0);

      if (text === 'K.O.!') {
        this.announcementText.setColor('#ff1744');
      } else if (text === 'FIGHT!' || text === 'PRACTICE!') {
        this.announcementText.setColor('#ffd700');
      } else {
        this.announcementText.setColor('#ffffff');
      }

      this.tweens.add({
        targets: this.announcementText,
        scale: 1.15,
        alpha: 1,
        duration: 220,
        ease: 'Back.easeOut',
        onComplete: () => {
          this.tweens.add({
            targets: this.announcementText,
            scale: 1.0,
            duration: 120,
            onComplete: () => {
              this.time.delayedCall(duration, () => {
                this.tweens.add({
                  targets: this.announcementText,
                  alpha: 0,
                  scale: 0.8,
                  duration: 180,
                  onComplete: () => {
                    if (onComplete) onComplete();
                  }
                });
              });
            }
          });
        }
      });
    }

    handleRoundEnd(victorIndex, reason) {
      if (!this.roundActive) return;
      this.roundActive = false;

      // Cinematic K.O. Finish with Slow-Motion
      var label = reason === 'ko' ? 'K.O.!' : 'TIME UP!';
      if (reason === 'ko') {
        if (window.SANDAI && window.SANDAI.Audio) window.SANDAI.Audio.playKO();
        this.cameras.main.flash(260, 255, 30, 30);
        this.cameras.main.shake(320, 0.024);
        this.isSlowMo = true;
        if (this.renderer3d && this.renderer3d.triggerKOSlowMo) {
          this.renderer3d.triggerKOSlowMo();
        }
        this.time.delayedCall(1200, () => { this.isSlowMo = false; });
      } else {
        this.cameras.main.shake(150, 0.01);
      }

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
        if (this.isTraining) {
          // Infinite round in training mode
          this.fighter1.reset();
          this.fighter2.reset();
          this.roundActive = true;
        } else if (this.p1RoundWins >= 2 || this.p2RoundWins >= 2 || this.roundNumber >= 3) {
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

      if (window.SANDAI && window.SANDAI.Audio) {
        window.SANDAI.Audio.playVictory();
      }

      this.showAnnouncement(winnerChar.name.toUpperCase() + ' WINS!', 2000, () => {
        if (typeof window.SANDAI.onMatchComplete === 'function') {
          window.SANDAI.onMatchComplete({
            winner: winnerPlayerNum,
            winnerCharacter: winnerChar,
            p1RoundWins: this.p1RoundWins,
            p2RoundWins: this.p2RoundWins,
            p1Health: Math.round(this.fighter1.health),
            p2Health: Math.round(this.fighter2.health),
            p1Damage: Math.round(this.fighter1.totalDamageDealt || 0),
            p2Damage: Math.round(this.fighter2.totalDamageDealt || 0),
            maxCombo: Math.max(this.fighter1.maxCombo || 0, this.fighter2.maxCombo || 0)
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
        else if (act === 'crouch') remoteFighter.crouch();
        else if (act === 'stopCrouch') remoteFighter.stopCrouch();
        else if (act === 'dodge') remoteFighter.dodge();
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
      // 1. Hit-Stop Freeze Frame (Visceral tactile impact micro-pause)
      if (this.hitStopFrames > 0) {
        this.hitStopFrames--;
        return;
      }

      // 2. Cinematic K.O. Slow-Motion Timescale
      var effectiveDelta = this.isSlowMo ? (delta * 0.28) : delta;

      this.updateArenaParticles(effectiveDelta);
      this.drawHUD(1280, 720);

      // Synchronize 3D articulated fighters and skeletal animations with 2.5D game physics
      if (this.renderer3d) {
        var dt = effectiveDelta / 1000;
        if (this.fighter1 && this.renderer3d.fighter1Mesh) {
          this.renderer3d.updateFighterAnimation(this.renderer3d.fighter1Mesh, this.fighter1, dt);
        }
        if (this.fighter2 && this.renderer3d.fighter2Mesh) {
          this.renderer3d.updateFighterAnimation(this.renderer3d.fighter2Mesh, this.fighter2, dt);
        }
      }

      if (!this.roundActive || this.matchOver) {
        if (this.fighter1) this.fighter1.update(effectiveDelta);
        if (this.fighter2) this.fighter2.update(effectiveDelta);
        return;
      }

      // Round Timer Countdown (Infinite in Training Mode)
      if (!this.isTraining) {
        this.timerAccumulator += effectiveDelta;
        if (this.timerAccumulator >= 1000) {
          this.timerAccumulator -= 1000;
          this.roundTimer--;
          this.timerText.setText(this.roundTimer.toString());
          if (this.roundTimer <= 10) {
            this.timerText.setColor('#ff1744');
          }
          if (this.roundTimer <= 0) {
            var victor = this.fighter1.health > this.fighter2.health ? 0 : (this.fighter2.health > this.fighter1.health ? 1 : -1);
            this.handleRoundEnd(victor, 'time');
            return;
          }
        }
      }

      // Read Inputs
      var ctrl = window.SANDAI.Controls;
      var p1Input = ctrl ? ctrl.getP1Input() : {};
      var p2Input = ctrl ? ctrl.getP2Input() : {};

      // Record On-Screen Input History Stream (Training Mode)
      if (this.isTraining && ctrl) {
        var pressed = ctrl.getP1Pressed ? ctrl.getP1Pressed() : {};
        var tokens = [];
        if (pressed.punch) tokens.push('[J-PUNCH]');
        if (pressed.kick) tokens.push('[K-KICK]');
        if (pressed.special) tokens.push('[L-SPECIAL]');
        if (pressed.jump) tokens.push('[W-JUMP]');
        if (p1Input.left && !this.lastP1Left) tokens.push('[A-LEFT]');
        if (p1Input.right && !this.lastP1Right) tokens.push('[D-RIGHT]');
        if (p1Input.block && !this.lastP1Block) tokens.push('[S-BLOCK]');
        this.lastP1Left = p1Input.left;
        this.lastP1Right = p1Input.right;
        this.lastP1Block = p1Input.block;

        if (tokens.length > 0) {
          for (var tk = 0; tk < tokens.length; tk++) {
            this.inputHistory.push(tokens[tk]);
            if (this.inputHistory.length > 8) this.inputHistory.shift();
          }
          if (this.inputHistoryText) {
            this.inputHistoryText.setText('INPUT STREAM: ' + this.inputHistory.join(' '));
          }
        }

        // Update Training Telemetry Box
        if (this.trainingStatsText) {
          this.trainingStatsText.setText(
            'DUMMY: ' + (this.dummyMode || 'STAND').toUpperCase() +
            ' | COMBO DMG: ' + Math.round(this.fighter1.comboDamage || 0) +
            ' | MAX COMBO: ' + (this.fighter1.maxCombo || 0) + ' HITS'
          );
        }

        // Auto-recover dummy health & guard 50 frames after combo ends
        if (this.fighter1.comboCount === 0 && this.fighter2.health < 100) {
          this.dummyRecoverTimer += effectiveDelta;
          if (this.dummyRecoverTimer > 800) {
            this.fighter2.health = Math.min(100, this.fighter2.health + 2.5);
            this.fighter2.guardStamina = 100;
            this.fighter2.isGuardBroken = false;
          }
        } else {
          this.dummyRecoverTimer = 0;
        }
      }

      // Handle Player 1
      if (!this.isOnline || this.localPlayerIndex === 0) {
        if (p1Input.left) { this.fighter1.moveLeft(); this.sendLocalAction('moveLeft'); }
        if (p1Input.right) { this.fighter1.moveRight(); this.sendLocalAction('moveRight'); }
        if (p1Input.jump) { this.fighter1.jump(); this.sendLocalAction('jump'); }
        if (p1Input.crouch) { this.fighter1.crouch(); this.sendLocalAction('crouch'); }
        else if (this.fighter1.isCrouching && !p1Input.crouch) { this.fighter1.stopCrouch(); this.sendLocalAction('stopCrouch'); }
        if (p1Input.dodge) { this.fighter1.dodge(); this.sendLocalAction('dodge'); }
        if (p1Input.punch) { this.fighter1.punch(); this.sendLocalAction('punch'); }
        if (p1Input.kick) { this.fighter1.kick(); this.sendLocalAction('kick'); }
        if (p1Input.special) { this.fighter1.special(); this.sendLocalAction('special'); }
        if (p1Input.block) { this.fighter1.block(); this.sendLocalAction('block'); }
        else if (this.fighter1.isBlocking && !p1Input.block) { this.fighter1.stopBlocking(); this.sendLocalAction('stopBlock'); }
      }

      // Handle Player 2 / AI / Training Dummy
      if (this.isTraining) {
        // Training Dummy AI behavior modes
        if (this.dummyMode === 'guard') {
          this.fighter2.block();
        } else if (this.dummyMode === 'crouch') {
          this.fighter2.block();
        } else if (this.dummyMode === 'jump') {
          if (!this.fighter2.isJumping && Math.random() < 0.03) this.fighter2.jump();
        } else if (this.dummyMode === 'attack') {
          var dummyDist = Math.abs(this.fighter1.x - this.fighter2.x);
          if (dummyDist < 110 && Math.random() < 0.04) {
            this.fighter2.punch();
          } else if (dummyDist > 140) {
            this.fighter2.moveLeft();
          }
        } else {
          // 'stand' mode: stays idle
          if (this.fighter2.isBlocking) this.fighter2.stopBlocking();
        }
      } else if (this.gameMode === 'ai' && this.ai) {
        this.ai.update(this.fighter1);
      } else if (this.gameMode === 'local') {
        if (p2Input.left) this.fighter2.moveLeft();
        if (p2Input.right) this.fighter2.moveRight();
        if (p2Input.jump) this.fighter2.jump();
        if (p2Input.crouch) this.fighter2.crouch();
        else if (this.fighter2.isCrouching && !p2Input.crouch) this.fighter2.stopCrouch();
        if (p2Input.dodge) this.fighter2.dodge();
        if (p2Input.punch) this.fighter2.punch();
        if (p2Input.kick) this.fighter2.kick();
        if (p2Input.special) this.fighter2.special();
        if (p2Input.block) this.fighter2.block();
        else if (this.fighter2.isBlocking && !p2Input.block) this.fighter2.stopBlocking();
      } else if (this.isOnline && this.localPlayerIndex === 1) {
        if (p1Input.left) { this.fighter2.moveLeft(); this.sendLocalAction('moveLeft'); }
        if (p1Input.right) { this.fighter2.moveRight(); this.sendLocalAction('moveRight'); }
        if (p1Input.jump) { this.fighter2.jump(); this.sendLocalAction('jump'); }
        if (p1Input.crouch) { this.fighter2.crouch(); this.sendLocalAction('crouch'); }
        else if (this.fighter2.isCrouching && !p1Input.crouch) { this.fighter2.stopCrouch(); this.sendLocalAction('stopCrouch'); }
        if (p1Input.dodge) { this.fighter2.dodge(); this.sendLocalAction('dodge'); }
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
      this.fighter1.update(effectiveDelta);
      this.fighter2.update(effectiveDelta);

      // Character body separation: prevent passing through each other on ground
      var minDist = 48;
      var dist = this.fighter2.x - this.fighter1.x;
      if (Math.abs(dist) < minDist && !this.fighter1.isJumping && !this.fighter2.isJumping) {
        var overlap = (minDist - Math.abs(dist)) * 0.5;
        if (dist >= 0) {
          this.fighter1.x = Math.max(70, this.fighter1.x - overlap);
          this.fighter2.x = Math.min(1210, this.fighter2.x + overlap);
        } else {
          this.fighter1.x = Math.min(1210, this.fighter1.x + overlap);
          this.fighter2.x = Math.max(70, this.fighter2.x - overlap);
        }
      }

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

      // Health Check for KO (bypassed during training mode)
      if (!this.isTraining) {
        if (this.fighter1.health <= 0) {
          this.handleRoundEnd(1, 'ko');
        } else if (this.fighter2.health <= 0) {
          this.handleRoundEnd(0, 'ko');
        }
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

    resetTrainingPositions() {
      if (this.fighter1) {
        this.fighter1.x = 420;
        this.fighter1.y = 520;
        this.fighter1.health = 100;
        this.fighter1.guardStamina = 100;
        this.fighter1.energy = 50;
        this.fighter1.comboCount = 0;
        this.fighter1.comboDamage = 0;
        this.fighter1.isGuardBroken = false;
        this.fighter1.state = 'idle';
      }

      if (this.fighter2) {
        this.fighter2.x = 860;
        this.fighter2.y = 520;
        this.fighter2.health = 100;
        this.fighter2.guardStamina = 100;
        this.fighter2.energy = 50;
        this.fighter2.comboCount = 0;
        this.fighter2.comboDamage = 0;
        this.fighter2.isGuardBroken = false;
        this.fighter2.state = 'idle';
      }

      this.p1RecoilHealth = 100;
      this.p2RecoilHealth = 100;
      this.inputHistory = [];
      if (this.inputHistoryText) this.inputHistoryText.setText('INPUT STREAM: RESET');
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
      transparent: true,
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
      },
      scene: [FightScene]
    };

    gameInstance = new Phaser.Game(config);
  }

  function stopGame() {
    if (window.SANDAI && window.SANDAI.Audio) {
      window.SANDAI.Audio.stopAmbience();
    }
    if (currentScene && currentScene.renderer3d) {
      try {
        currentScene.renderer3d.destroy();
      } catch (e) { }
      currentScene.renderer3d = null;
    }
    if (gameInstance) {
      gameInstance.destroy(true);
      gameInstance = null;
      currentScene = null;
      window.SANDAI.activeFightScene = null;
    }
    if (window.SANDAI.Controls) {
      window.SANDAI.Controls.destroyKeyboard();
      window.SANDAI.Controls.destroyTouchControls();
    }
  }

  window.SANDAI.startGame = startGame;
  window.SANDAI.stopGame = stopGame;

})();
