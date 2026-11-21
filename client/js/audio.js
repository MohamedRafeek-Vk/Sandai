// ============================================================
// SANDAI — audio.js
// Procedural Web Audio API Sound & Ambience Engine — Stage 4
// 100% Original, zero-copyright, zero-asset dependencies.
// Provides punches, kicks, blocks, jumps, character specials,
// hits, K.O., victory fanfare, and arena-specific procedural ambience.
// ============================================================

(function () {
  'use strict';

  window.SANDAI = window.SANDAI || {};

  var AudioContextClass = window.AudioContext || window.webkitAudioContext;
  var ctx = null;
  var masterGain = null;
  var musicGain = null;
  var sfxGain = null;

  // Audio State & Saved Preferences
  var savedSettings = {
    masterVolume: 0.8,
    musicVolume: 0.7,
    sfxVolume: 0.9,
    muted: false
  };

  try {
    var stored = localStorage.getItem('sandai_audio_settings');
    if (stored) {
      var parsed = JSON.parse(stored);
      if (typeof parsed.masterVolume === 'number') savedSettings.masterVolume = parsed.masterVolume;
      if (typeof parsed.musicVolume === 'number') savedSettings.musicVolume = parsed.musicVolume;
      if (typeof parsed.sfxVolume === 'number') savedSettings.sfxVolume = parsed.sfxVolume;
      if (typeof parsed.muted === 'boolean') savedSettings.muted = parsed.muted;
    }
  } catch (e) {}

  // Active Ambience Nodes
  var activeAmbience = null;
  var currentAmbienceArena = null;

  function initAudioContext() {
    if (ctx) return;
    if (!AudioContextClass) {
      console.warn('[SANDAI Audio] Web Audio API not supported in this browser.');
      return;
    }

    try {
      ctx = new AudioContextClass();

      // Master Gain
      masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(savedSettings.muted ? 0 : savedSettings.masterVolume, ctx.currentTime);
      masterGain.connect(ctx.destination);

      // Music Gain (Connected to Master)
      musicGain = ctx.createGain();
      musicGain.gain.setValueAtTime(savedSettings.musicVolume, ctx.currentTime);
      musicGain.connect(masterGain);

      // SFX Gain (Connected to Master)
      sfxGain = ctx.createGain();
      sfxGain.gain.setValueAtTime(savedSettings.sfxVolume, ctx.currentTime);
      sfxGain.connect(masterGain);

      console.log('[SANDAI Audio] Procedural Web Audio Engine Initialized.');
    } catch (err) {
      console.warn('[SANDAI Audio] AudioContext init error:', err);
    }
  }

  function ensureContext() {
    if (!ctx) initAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(function () {});
    }
  }

  // Auto-resume AudioContext on first user interaction (Browser Autoplay compliance)
  function unlockAudio() {
    ensureContext();
    window.removeEventListener('pointerdown', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
    window.removeEventListener('touchstart', unlockAudio);
  }
  window.addEventListener('pointerdown', unlockAudio, { passive: true });
  window.addEventListener('keydown', unlockAudio, { passive: true });
  window.addEventListener('touchstart', unlockAudio, { passive: true });

  // ------------------------------------------------------------
  // Helper Noise Buffer Generator
  // ------------------------------------------------------------
  function createNoiseBuffer(durationSec, isPink) {
    if (!ctx) return null;
    var sampleRate = ctx.sampleRate;
    var frameCount = sampleRate * durationSec;
    var buffer = ctx.createBuffer(1, frameCount, sampleRate);
    var output = buffer.getChannelData(0);

    var b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (var i = 0; i < frameCount; i++) {
      var white = Math.random() * 2 - 1;
      if (isPink) {
        // Paul Kellet's filtered pink noise algorithm
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      } else {
        output[i] = white;
      }
    }
    return buffer;
  }

  // ------------------------------------------------------------
  // Sound Effects Synthesis
  // ------------------------------------------------------------

  // 1. Punch Impact (Low punch thump + fast transient)
  function playPunch() {
    ensureContext();
    if (!ctx || savedSettings.muted || savedSettings.sfxVolume <= 0) return;

    var t = ctx.currentTime;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(175, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.11);

    gain.gain.setValueAtTime(0.7, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    osc.connect(gain);
    gain.connect(sfxGain);

    osc.start(t);
    osc.stop(t + 0.13);

    // Punch snap noise
    var snapBuffer = createNoiseBuffer(0.06, false);
    if (snapBuffer) {
      var snapSource = ctx.createBufferSource();
      var snapFilter = ctx.createBiquadFilter();
      var snapGain = ctx.createGain();

      snapSource.buffer = snapBuffer;
      snapFilter.type = 'bandpass';
      snapFilter.frequency.setValueAtTime(800, t);
      snapFilter.Q.setValueAtTime(1.5, t);

      snapGain.gain.setValueAtTime(0.5, t);
      snapGain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

      snapSource.connect(snapFilter);
      snapFilter.connect(snapGain);
      snapGain.connect(sfxGain);

      snapSource.start(t);
      snapSource.stop(t + 0.07);
    }
  }

  // 2. Kick Impact (Heavy sub-bass hit + deeper crunch)
  function playKick() {
    ensureContext();
    if (!ctx || savedSettings.muted || savedSettings.sfxVolume <= 0) return;

    var t = ctx.currentTime;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(230, t);
    osc.frequency.exponentialRampToValueAtTime(32, t + 0.18);

    gain.gain.setValueAtTime(0.85, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.19);

    osc.connect(gain);
    gain.connect(sfxGain);

    osc.start(t);
    osc.stop(t + 0.2);

    // Crunch noise
    var crunchBuffer = createNoiseBuffer(0.09, true);
    if (crunchBuffer) {
      var crunchSource = ctx.createBufferSource();
      var crunchFilter = ctx.createBiquadFilter();
      var crunchGain = ctx.createGain();

      crunchSource.buffer = crunchBuffer;
      crunchFilter.type = 'lowpass';
      crunchFilter.frequency.setValueAtTime(650, t);

      crunchGain.gain.setValueAtTime(0.6, t);
      crunchGain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

      crunchSource.connect(crunchFilter);
      crunchFilter.connect(crunchGain);
      crunchGain.connect(sfxGain);

      crunchSource.start(t);
      crunchSource.stop(t + 0.1);
    }
  }

  // 3. Block Clink (High metallic clink / shield guard)
  function playBlock() {
    ensureContext();
    if (!ctx || savedSettings.muted || savedSettings.sfxVolume <= 0) return;

    var t = ctx.currentTime;
    var osc1 = ctx.createOscillator();
    var osc2 = ctx.createOscillator();
    var gain = ctx.createGain();

    osc1.type = 'square';
    osc2.type = 'square';
    osc1.frequency.setValueAtTime(940, t);
    osc2.frequency.setValueAtTime(1420, t);

    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(sfxGain);

    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + 0.09);
    osc2.stop(t + 0.09);
  }

  // 4. Jump Whoosh (Rising pitch sweep)
  function playJump() {
    ensureContext();
    if (!ctx || savedSettings.muted || savedSettings.sfxVolume <= 0) return;

    var t = ctx.currentTime;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(320, t + 0.14);

    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

    osc.connect(gain);
    gain.connect(sfxGain);

    osc.start(t);
    osc.stop(t + 0.16);
  }

  // 5. Special Attack (Character-specific elemental sound)
  function playSpecial(charId) {
    ensureContext();
    if (!ctx || savedSettings.muted || savedSettings.sfxVolume <= 0) return;

    var t = ctx.currentTime;
    var id = charId !== undefined ? Number(charId) : 0;

    // Base energy surge
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    var filter = ctx.createBiquadFilter();

    switch (id) {
      case 0: // Abilash: Inferno Fire Blast (roaring flames + sweep)
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(160, t);
        osc.frequency.exponentialRampToValueAtTime(650, t + 0.25);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(400, t);
        filter.frequency.exponentialRampToValueAtTime(2400, t + 0.22);
        gain.gain.setValueAtTime(0.65, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
        break;

      case 1: // Anas: Steel Shockwave (heavy metallic thud + ring)
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(110, t);
        osc.frequency.exponentialRampToValueAtTime(45, t + 0.3);
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(800, t);
        gain.gain.setValueAtTime(0.8, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        break;

      case 2: // Dhinesh: Shadow Void (deep ethereal pitch drop)
        osc.type = 'sine';
        osc.frequency.setValueAtTime(480, t);
        osc.frequency.exponentialRampToValueAtTime(70, t + 0.32);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1200, t);
        gain.gain.setValueAtTime(0.7, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        break;

      case 3: // Farook: Thunder Surge (high-voltage electricity crackle)
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(880, t);
        osc.frequency.exponentialRampToValueAtTime(140, t + 0.28);
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(500, t);
        gain.gain.setValueAtTime(0.65, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
        break;

      case 4: // Kiran: Gale Blade (sharp wind vortex whistle)
        osc.type = 'sine';
        osc.frequency.setValueAtTime(280, t);
        osc.frequency.exponentialRampToValueAtTime(920, t + 0.22);
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1400, t);
        gain.gain.setValueAtTime(0.6, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        break;

      case 5: // Nawin: Toxic Viper (bubbling chemical hiss)
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, t);
        osc.frequency.linearRampToValueAtTime(340, t + 0.15);
        osc.frequency.exponentialRampToValueAtTime(90, t + 0.32);
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(900, t);
        gain.gain.setValueAtTime(0.6, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
        break;

      case 6: // Rafeek: Seismic Quake (earth-shaking sub rumble)
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(95, t);
        osc.frequency.exponentialRampToValueAtTime(28, t + 0.38);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(350, t);
        gain.gain.setValueAtTime(0.85, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
        break;

      case 7: // Tharun: Solar Judgement (celestial radiant chord)
      default:
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, t); // C5
        osc.frequency.exponentialRampToValueAtTime(1046.5, t + 0.28); // C6
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(3000, t);
        gain.gain.setValueAtTime(0.7, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.36);
        break;
    }

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(sfxGain);

    osc.start(t);
    osc.stop(t + 0.45);
  }

  // 6. Character Hit Reaction (Pain grunt / body impact)
  function playHit() {
    ensureContext();
    if (!ctx || savedSettings.muted || savedSettings.sfxVolume <= 0) return;

    var t = ctx.currentTime;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + 0.09);

    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

    osc.connect(gain);
    gain.connect(sfxGain);

    osc.start(t);
    osc.stop(t + 0.11);
  }

  // 7. Menu UI Click
  function playMenuClick() {
    ensureContext();
    if (!ctx || savedSettings.muted || savedSettings.sfxVolume <= 0) return;

    var t = ctx.currentTime;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, t);
    osc.frequency.exponentialRampToValueAtTime(600, t + 0.035);

    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);

    osc.connect(gain);
    gain.connect(sfxGain);

    osc.start(t);
    osc.stop(t + 0.045);
  }

  // 8. Round / Fight Start Gong
  function playRoundStart() {
    ensureContext();
    if (!ctx || savedSettings.muted || savedSettings.sfxVolume <= 0) return;

    var t = ctx.currentTime;
    // Low gong
    var gongOsc = ctx.createOscillator();
    var gongGain = ctx.createGain();

    gongOsc.type = 'triangle';
    gongOsc.frequency.setValueAtTime(110, t);
    gongOsc.frequency.exponentialRampToValueAtTime(75, t + 0.8);

    gongGain.gain.setValueAtTime(0.7, t);
    gongGain.gain.exponentialRampToValueAtTime(0.001, t + 0.9);

    gongOsc.connect(gongGain);
    gongGain.connect(sfxGain);

    gongOsc.start(t);
    gongOsc.stop(t + 0.95);
  }

  // 9. K.O. Impact
  function playKO() {
    ensureContext();
    if (!ctx || savedSettings.muted || savedSettings.sfxVolume <= 0) return;

    var t = ctx.currentTime;
    var subOsc = ctx.createOscillator();
    var subGain = ctx.createGain();

    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(85, t);
    subOsc.frequency.exponentialRampToValueAtTime(20, t + 0.9);

    subGain.gain.setValueAtTime(0.9, t);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 1.1);

    subOsc.connect(subGain);
    subGain.connect(sfxGain);

    subOsc.start(t);
    subOsc.stop(t + 1.15);
  }

  // 10. Victory Fanfare (Celebratory harmonized chords)
  function playVictory() {
    ensureContext();
    if (!ctx || savedSettings.muted || savedSettings.sfxVolume <= 0) return;

    var t = ctx.currentTime;
    var notes = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5 (Major Chord)

    notes.forEach(function (freq, idx) {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      var noteStart = t + idx * 0.12;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, noteStart);

      gain.gain.setValueAtTime(0.4, noteStart);
      gain.gain.exponentialRampToValueAtTime(0.001, noteStart + 0.8);

      osc.connect(gain);
      gain.connect(sfxGain);

      osc.start(noteStart);
      osc.stop(noteStart + 0.85);
    });
  }

  // ------------------------------------------------------------
  // Procedural Background Ambience & Music Generation
  // ------------------------------------------------------------
  function stopAmbience() {
    if (activeAmbience) {
      try {
        if (activeAmbience.gainNode && ctx) {
          activeAmbience.gainNode.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.5);
        }
        setTimeout(function () {
          if (activeAmbience && activeAmbience.stopAll) {
            activeAmbience.stopAll();
          }
          activeAmbience = null;
          currentAmbienceArena = null;
        }, 550);
      } catch (e) {
        activeAmbience = null;
        currentAmbienceArena = null;
      }
    }
  }

  function startAmbience(arenaName) {
    arenaName = arenaName || 'mountain';
    if (currentAmbienceArena === arenaName && activeAmbience) return;
    stopAmbience();

    ensureContext();
    if (!ctx) return;

    var arenaGain = ctx.createGain();
    arenaGain.gain.setValueAtTime(0.001, ctx.currentTime);
    arenaGain.gain.linearRampToValueAtTime(0.45, ctx.currentTime + 1.0);
    arenaGain.connect(musicGain);

    var stopFns = [];

    // Arena 1: Frozen Mountain Shrine — Howling Wind + Distant Bell
    if (arenaName === 'mountain') {
      var windBuf = createNoiseBuffer(4.0, true);
      if (windBuf) {
        var windSrc = ctx.createBufferSource();
        windSrc.buffer = windBuf;
        windSrc.loop = true;

        var windFilter = ctx.createBiquadFilter();
        windFilter.type = 'bandpass';
        windFilter.frequency.setValueAtTime(280, ctx.currentTime);
        windFilter.Q.setValueAtTime(3.0, ctx.currentTime);

        windSrc.connect(windFilter);
        windFilter.connect(arenaGain);
        windSrc.start();
        stopFns.push(function () { try { windSrc.stop(); } catch (e) {} });
      }
    }

    // Arena 2: Ancient Bamboo Sanctuary — Serene Forest Breeze & Pentatonic Wind Chimes
    else if (arenaName === 'forest') {
      var forestBuf = createNoiseBuffer(4.0, true);
      if (forestBuf) {
        var forestSrc = ctx.createBufferSource();
        forestSrc.buffer = forestBuf;
        forestSrc.loop = true;

        var forestFilter = ctx.createBiquadFilter();
        forestFilter.type = 'lowpass';
        forestFilter.frequency.setValueAtTime(450, ctx.currentTime);

        forestSrc.connect(forestFilter);
        forestFilter.connect(arenaGain);
        forestSrc.start();
        stopFns.push(function () { try { forestSrc.stop(); } catch (e) {} });
      }

      // Gentle Pentatonic Chime Interval
      var chimeTimer = setInterval(function () {
        if (!ctx || !activeAmbience) { clearInterval(chimeTimer); return; }
        var freqs = [440, 493.88, 554.37, 659.25, 739.99]; // Pentatonic
        var f = freqs[Math.floor(Math.random() * freqs.length)];
        var cOsc = ctx.createOscillator();
        var cGain = ctx.createGain();
        cOsc.type = 'sine';
        cOsc.frequency.setValueAtTime(f, ctx.currentTime);
        cGain.gain.setValueAtTime(0.08, ctx.currentTime);
        cGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
        cOsc.connect(cGain);
        cGain.connect(arenaGain);
        cOsc.start();
        cOsc.stop(ctx.currentTime + 1.25);
      }, 2600);
      stopFns.push(function () { clearInterval(chimeTimer); });
    }

    // Arena 3: Storm Pagoda — Rain Hiss & Thunder Rumbles
    else if (arenaName === 'rainy') {
      var rainBuf = createNoiseBuffer(3.0, false);
      if (rainBuf) {
        var rainSrc = ctx.createBufferSource();
        rainSrc.buffer = rainBuf;
        rainSrc.loop = true;

        var rainFilter = ctx.createBiquadFilter();
        rainFilter.type = 'bandpass';
        rainFilter.frequency.setValueAtTime(1600, ctx.currentTime);
        rainFilter.Q.setValueAtTime(0.8, ctx.currentTime);

        rainSrc.connect(rainFilter);
        rainFilter.connect(arenaGain);
        rainSrc.start();
        stopFns.push(function () { try { rainSrc.stop(); } catch (e) {} });
      }

      // Thunder rumble generator
      var thunderTimer = setInterval(function () {
        if (!ctx || !activeAmbience) { clearInterval(thunderTimer); return; }
        var tOsc = ctx.createOscillator();
        var tGain = ctx.createGain();
        var tFilt = ctx.createBiquadFilter();
        tOsc.type = 'sawtooth';
        tOsc.frequency.setValueAtTime(65, ctx.currentTime);
        tOsc.frequency.exponentialRampToValueAtTime(25, ctx.currentTime + 1.8);
        tFilt.type = 'lowpass';
        tFilt.frequency.setValueAtTime(140, ctx.currentTime);
        tGain.gain.setValueAtTime(0.3, ctx.currentTime);
        tGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.9);
        tOsc.connect(tFilt);
        tFilt.connect(tGain);
        tGain.connect(arenaGain);
        tOsc.start();
        tOsc.stop(ctx.currentTime + 2.0);
      }, 4500);
      stopFns.push(function () { clearInterval(thunderTimer); });
    }

    // Arena 4: Molten Core — Thermal Lava Bubble & Sub-bass Drone
    else if (arenaName === 'volcanic') {
      var lavaOsc = ctx.createOscillator();
      var lavaFilter = ctx.createBiquadFilter();
      lavaOsc.type = 'sawtooth';
      lavaOsc.frequency.setValueAtTime(55, ctx.currentTime);
      lavaFilter.type = 'lowpass';
      lavaFilter.frequency.setValueAtTime(120, ctx.currentTime);
      lavaOsc.connect(lavaFilter);
      lavaFilter.connect(arenaGain);
      lavaOsc.start();
      stopFns.push(function () { try { lavaOsc.stop(); } catch (e) {} });
    }

    // Arena 5: Night City & Menu — Cyberpunk Bass Drone
    else {
      var bassOsc = ctx.createOscillator();
      var bassGain = ctx.createGain();
      bassOsc.type = 'triangle';
      bassOsc.frequency.setValueAtTime(65.41, ctx.currentTime); // C2
      bassGain.gain.setValueAtTime(0.35, ctx.currentTime);
      bassOsc.connect(bassGain);
      bassGain.connect(arenaGain);
      bassOsc.start();
      stopFns.push(function () { try { bassOsc.stop(); } catch (e) {} });
    }

    currentAmbienceArena = arenaName;
    activeAmbience = {
      gainNode: arenaGain,
      stopAll: function () {
        stopFns.forEach(function (fn) { fn(); });
      }
    };
  }

  // ------------------------------------------------------------
  // Volume and Audio Control Settings
  // ------------------------------------------------------------
  function setMasterVolume(val) {
    savedSettings.masterVolume = Math.max(0, Math.min(1, Number(val)));
    if (masterGain && ctx && !savedSettings.muted) {
      masterGain.gain.setValueAtTime(savedSettings.masterVolume, ctx.currentTime);
    }
    saveSettings();
  }

  function setMusicVolume(val) {
    savedSettings.musicVolume = Math.max(0, Math.min(1, Number(val)));
    if (musicGain && ctx) {
      musicGain.gain.setValueAtTime(savedSettings.musicVolume, ctx.currentTime);
    }
    saveSettings();
  }

  function setSfxVolume(val) {
    savedSettings.sfxVolume = Math.max(0, Math.min(1, Number(val)));
    if (sfxGain && ctx) {
      sfxGain.gain.setValueAtTime(savedSettings.sfxVolume, ctx.currentTime);
    }
    saveSettings();
  }

  function setMuted(isMuted) {
    savedSettings.muted = !!isMuted;
    if (masterGain && ctx) {
      masterGain.gain.setValueAtTime(savedSettings.muted ? 0 : savedSettings.masterVolume, ctx.currentTime);
    }
    saveSettings();
  }

  function saveSettings() {
    try {
      localStorage.setItem('sandai_audio_settings', JSON.stringify(savedSettings));
    } catch (e) {}
  }

  function getSettings() {
    return {
      masterVolume: savedSettings.masterVolume,
      musicVolume: savedSettings.musicVolume,
      sfxVolume: savedSettings.sfxVolume,
      muted: savedSettings.muted
    };
  }

  // Public Export
  window.SANDAI.Audio = {
    init: initAudioContext,
    unlock: unlockAudio,
    playPunch: playPunch,
    playKick: playKick,
    playBlock: playBlock,
    playJump: playJump,
    playSpecial: playSpecial,
    playHit: playHit,
    playMenuClick: playMenuClick,
    playRoundStart: playRoundStart,
    playKO: playKO,
    playVictory: playVictory,
    startAmbience: startAmbience,
    stopAmbience: stopAmbience,
    setMasterVolume: setMasterVolume,
    setMusicVolume: setMusicVolume,
    setSfxVolume: setSfxVolume,
    setMuted: setMuted,
    getSettings: getSettings
  };

})();
