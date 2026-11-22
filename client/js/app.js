// ============================================================
// SANDAI — app.js
// Frontend UI, Screen Navigation, Character Selection & Socket.IO
// ============================================================

(function () {
  'use strict';

  window.SANDAI = window.SANDAI || {};

  // Global State
  window.SANDAI.deviceType = null;        // 'pc' or 'mobile'
  window.SANDAI.gameMode = null;          // 'ai', 'local', 'online'
  window.SANDAI.aiDifficulty = 'normal';  // 'easy', 'normal', 'hard'
  window.SANDAI.player1Character = 0;     // ID 0-7
  window.SANDAI.player2Character = 1;     // ID 0-7
  window.SANDAI.selectedArena = 'mountain'; // 'mountain', 'forest', 'rainy', 'volcanic', 'nightcity'
  window.SANDAI.socket = null;            // Socket.IO client instance
  window.SANDAI.roomCode = null;          // Active multiplayer room code
  window.SANDAI.playerNumber = 1;         // 1 (host) or 2 (guest)
  window.SANDAI.currentScreen = 'home';
  window.SANDAI.isPaused = false;
  window.SANDAI.p1Ready = false;
  window.SANDAI.p2Ready = false;

  // Auto-detect mobile device & touch capabilities
  var isMobileAuto = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    (window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches) ||
    (window.innerWidth <= 900);
  var savedDev = localStorage.getItem('sandai_device') || (isMobileAuto ? 'mobile' : 'pc');
  window.SANDAI.deviceType = savedDev;

  function applyDeviceClass(type) {
    if (type === 'mobile') {
      document.body.classList.add('is-mobile');
      document.body.classList.remove('is-desktop');
    } else {
      document.body.classList.add('is-desktop');
      document.body.classList.remove('is-mobile');
    }
  }
  applyDeviceClass(savedDev);

  // Audio unlocking on mobile touch / pointer interaction
  function unlockAudioOnTouch() {
    if (window.SANDAI.Audio && window.SANDAI.Audio.unlock) {
      window.SANDAI.Audio.unlock();
    }
    window.removeEventListener('touchstart', unlockAudioOnTouch);
    window.removeEventListener('pointerdown', unlockAudioOnTouch);
  }
  window.addEventListener('touchstart', unlockAudioOnTouch, { passive: true });
  window.addEventListener('pointerdown', unlockAudioOnTouch, { passive: true });

  var currentSelectionStep = 1; // 1: P1 selecting, 2: P2 selecting
  var active3DPreview = null;   // Active Three.js 3D character showcase instance

  function updateVSScreen() {
    var chars = window.SANDAI.CHARACTERS || [];
    var p1Id = (window.SANDAI.player1Character !== undefined && window.SANDAI.player1Character !== null) ? window.SANDAI.player1Character : 0;
    var p2Id = (window.SANDAI.player2Character !== undefined && window.SANDAI.player2Character !== null) ? window.SANDAI.player2Character : 1;
    var c1 = chars[p1Id] || chars[0];
    var c2 = chars[p2Id] || chars[1];

    var arenaNames = {
      mountain: 'MOUNTAIN SHRINE',
      forest: 'BAMBOO SANCTUARY',
      rainy: 'STORM PAGODA',
      volcanic: 'MOLTEN CORE',
      nightcity: 'NIGHT CITY ROOFTOP'
    };
    var activeArenaName = arenaNames[window.SANDAI.selectedArena] || 'MOUNTAIN SHRINE';

    var vsP1Img = document.getElementById('vs-p1-img');
    var vsP1Name = document.getElementById('vs-p1-name');
    var vsP1Style = document.getElementById('vs-p1-style');

    var vsP2Img = document.getElementById('vs-p2-img');
    var vsP2Name = document.getElementById('vs-p2-name');
    var vsP2Style = document.getElementById('vs-p2-style');
    var vsP2Role = document.getElementById('vs-p2-role');
    var vsArenaName = document.getElementById('vs-arena-name');

    if (vsP1Img && c1) vsP1Img.src = 'assets/characters/' + c1.portraitFile;
    if (vsP1Name && c1) vsP1Name.textContent = c1.name.toUpperCase();
    if (vsP1Style && c1) vsP1Style.textContent = c1.style;

    if (vsP2Img && c2) vsP2Img.src = 'assets/characters/' + c2.portraitFile;
    if (vsP2Name && c2) vsP2Name.textContent = c2.name.toUpperCase();
    if (vsP2Style && c2) vsP2Style.textContent = c2.style;
    if (vsP2Role) {
      vsP2Role.textContent = (window.SANDAI.gameMode === 'ai') ? 'AI OPPONENT' : (window.SANDAI.gameMode === 'training' ? 'TRAINING DUMMY' : 'PLAYER 2');
    }

    if (vsArenaName) {
      vsArenaName.textContent = activeArenaName;
    }
  }
  window.SANDAI.updateVSScreen = updateVSScreen;

  // ── Screen Management ────────────────────────────────────────
  function showScreen(screenId) {
    var screens = document.querySelectorAll('.screen');
    screens.forEach(function (s) {
      s.classList.remove('active');
    });

    var target = document.getElementById(screenId);
    if (target) {
      target.classList.add('active');
      window.SANDAI.currentScreen = screenId.replace('screen-', '');
    }

    if (screenId === 'screen-character-select') {
      if (typeof updateSelectionStepUI === 'function') updateSelectionStepUI();
      if (typeof renderCharacterGrid === 'function') renderCharacterGrid();
      if (typeof updateDetailPanel === 'function') updateDetailPanel(window.SANDAI.player1Character || 0, 1);
      if (typeof updateStatusChips === 'function') updateStatusChips();
    }

    if (screenId === 'screen-vs') {
      if (typeof updateVSScreen === 'function') updateVSScreen();
    }

    if (screenId === 'screen-lobby') {
      window.SANDAI.gameMode = 'online';
      initSocketMultiplayer();
      if (typeof updateLobbyUI === 'function') updateLobbyUI();
    }

    // Toggle Training Mode in-game HUD overlay
    var trainingOverlay = document.getElementById('training-overlay');
    if (trainingOverlay) {
      if (screenId === 'screen-game' && window.SANDAI.gameMode === 'training') {
        trainingOverlay.classList.remove('hidden');
      } else {
        trainingOverlay.classList.add('hidden');
      }
    }

    // Toggle in-fight state & orientation check for landscape prompt
    if (screenId === 'screen-game') {
      document.body.classList.add('in-fight');
      if (window.SANDAI.deviceType === 'mobile' || (window.SANDAI.deviceType !== 'pc' && (window.innerWidth <= 900 || ('ontouchstart' in window)))) {
        if (window.SANDAI.Controls && typeof window.SANDAI.Controls.createTouchControls === 'function') {
          window.SANDAI.Controls.createTouchControls();
        }
      }
      if (window.SANDAI.Controls && typeof window.SANDAI.Controls.checkOrientation === 'function') {
        window.SANDAI.Controls.checkOrientation();
      }
    } else {
      document.body.classList.remove('in-fight');
      var promptEl = document.getElementById('landscape-prompt');
      if (promptEl) promptEl.classList.add('hidden');
    }

    // If leaving game screen, destroy active game instance
    if (screenId !== 'screen-game' && window.SANDAI.stopGame) {
      window.SANDAI.stopGame();
    }
  }

  window.SANDAI.showScreen = showScreen;

  // ── Init & Event Listeners ───────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    setupHomeScreen();
    setupDeviceScreen();
    setupModeScreen();
    setupCharacterSelectScreen();
    setupArenaSelectScreen();
    setupControlsGuideScreen();
    setupLobbyScreen();
    setupWinnerScreen();
    setupGameControls();
    createBackgroundEmbers();
    if (window.SANDAI.Controls && window.SANDAI.Controls.initMobileOptimizations) {
      window.SANDAI.Controls.initMobileOptimizations();
    }

    // Maintain responsive UI across mobile orientation changes without page refresh or state loss
    window.addEventListener('orientationchange', function () {
      setTimeout(function () {
        window.dispatchEvent(new Event('resize'));
        if (window.SANDAI.Controls && typeof window.SANDAI.Controls.checkOrientation === 'function') {
          window.SANDAI.Controls.checkOrientation();
        }
      }, 150);
    });

    // Check for shareable room invitation link (e.g. ?room=ABCDEF or #room=ABCDEF)
    try {
      var urlParams = new URLSearchParams(window.location.search);
      var inviteCode = urlParams.get('room') || (window.location.hash.startsWith('#room=') ? window.location.hash.replace('#room=', '') : '');
      if (inviteCode && inviteCode.length === 6) {
        window.SANDAI.gameMode = 'online';
        showScreen('screen-lobby');
        var inputCode = document.getElementById('input-room-code');
        if (inputCode) inputCode.value = inviteCode.toUpperCase();
        var tabJoin = document.querySelector('.lobby-tab[data-tab="join"]');
        if (tabJoin) tabJoin.click();
        initSocketMultiplayer();
        setTimeout(function () {
          if (window.SANDAI.socket) {
            window.SANDAI.socket.emit('join-room', {
              code: inviteCode.toUpperCase(),
              characterId: (window.SANDAI.player2Character !== undefined) ? window.SANDAI.player2Character : 1
            });
          }
        }, 600);
      }
    } catch (e) {}
  });

  // ── Home Screen & Settings Modal ─────────────────────────────
  function setupHomeScreen() {
    var btnEnter = document.getElementById('btn-enter');
    if (btnEnter) {
      btnEnter.addEventListener('click', function () {
        showScreen('screen-device');
      });
    }

    // Quick Mode Buttons
    var btnQuickAi = document.getElementById('btn-quick-ai');
    if (btnQuickAi) {
      btnQuickAi.addEventListener('click', function () {
        window.SANDAI.gameMode = 'ai';
        showScreen('screen-character-select');
      });
    }

    var btnQuickLocal = document.getElementById('btn-quick-local');
    if (btnQuickLocal) {
      btnQuickLocal.addEventListener('click', function () {
        window.SANDAI.gameMode = 'local';
        showScreen('screen-character-select');
      });
    }

    var btnQuickOnline = document.getElementById('btn-quick-online');
    if (btnQuickOnline) {
      btnQuickOnline.addEventListener('click', function () {
        window.SANDAI.gameMode = 'online';
        showScreen('screen-lobby');
      });
    }

    var btnQuickTraining = document.getElementById('btn-quick-training');
    if (btnQuickTraining) {
      btnQuickTraining.addEventListener('click', function () {
        window.SANDAI.gameMode = 'training';
        startCharacterSelection();
      });
    }

    // Roster Chips Hover & Selection
    var chips = document.querySelectorAll('.roster-chip');
    chips.forEach(function (chip) {
      chip.addEventListener('mouseenter', function () {
        var id = parseInt(chip.getAttribute('data-id'), 10);
        var chars = window.SANDAI.CHARACTERS || [];
        var c = chars[id] || chars[0];
        var heroArt = document.getElementById('home-hero-art');
        var heroName = document.getElementById('home-hero-name');
        var heroStyle = document.getElementById('home-hero-style');
        if (heroArt) heroArt.src = 'assets/characters/' + c.portraitFile;
        if (heroName) heroName.textContent = c.name.toUpperCase();
        if (heroStyle) heroStyle.textContent = c.style.toUpperCase() + ' • ' + (c.archetype || 'COMBATANT').toUpperCase();
        chips.forEach(function (ch) { ch.classList.remove('active'); });
        chip.classList.add('active');
      });

      chip.addEventListener('click', function () {
        var id = parseInt(chip.getAttribute('data-id'), 10);
        window.SANDAI.player1Character = id;
        showScreen('screen-character-select');
      });
    });

    // Settings Modal Setup (Stage 4)
    setupSettingsModal();
  }

  // ── Game Settings Modal Controller (Stage 4) ─────────────────
  function setupSettingsModal() {
    var modalSettings = document.getElementById('modal-settings');
    var btnHomeSettings = document.getElementById('btn-home-settings');
    var btnCloseSettings = document.getElementById('btn-close-settings');
    var btnSaveSettings = document.getElementById('btn-save-settings');
    var btnResetSettings = document.getElementById('btn-reset-settings');
    var btnSettingsFullscreen = document.getElementById('btn-settings-fullscreen');
    var btnSettingsGuide = document.getElementById('btn-settings-guide');
    var btnPause = document.getElementById('btn-pause');

    function openSettings() {
      if (window.SANDAI && window.SANDAI.Audio) window.SANDAI.Audio.playMenuClick();
      syncSettingsUI();
      if (modalSettings) modalSettings.classList.remove('hidden');
    }
    function closeSettings() {
      if (window.SANDAI && window.SANDAI.Audio) window.SANDAI.Audio.playMenuClick();
      if (modalSettings) modalSettings.classList.add('hidden');
    }

    if (btnHomeSettings) btnHomeSettings.addEventListener('click', openSettings);
    if (btnCloseSettings) btnCloseSettings.addEventListener('click', closeSettings);
    if (btnSaveSettings) btnSaveSettings.addEventListener('click', closeSettings);
    if (btnPause) btnPause.addEventListener('click', openSettings);

    // 1. Graphics Quality Preset Toggle
    var qualityButtons = document.querySelectorAll('#group-graphics-quality .btn-toggle-option');
    qualityButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var q = btn.getAttribute('data-quality');
        qualityButtons.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        localStorage.setItem('sandai_graphics_quality', q);
        if (window.SANDAI && window.SANDAI.Audio) window.SANDAI.Audio.playMenuClick();
      });
    });

    // 2. Camera Shake Toggle
    var toggleShake = document.getElementById('toggle-camera-shake');
    if (toggleShake) {
      toggleShake.addEventListener('change', function () {
        localStorage.setItem('sandai_camera_shake', toggleShake.checked ? 'true' : 'false');
      });
    }

    // 3. Reduced Visual Effects Toggle
    var toggleReducedVFX = document.getElementById('toggle-reduced-vfx');
    if (toggleReducedVFX) {
      toggleReducedVFX.addEventListener('change', function () {
        localStorage.setItem('sandai_reduced_vfx', toggleReducedVFX.checked ? 'true' : 'false');
      });
    }

    // 4. Audio Sliders & Mute Toggle
    var sliderMaster = document.getElementById('slider-master-volume');
    var labelMaster = document.getElementById('master-volume-val');
    if (sliderMaster) {
      sliderMaster.addEventListener('input', function () {
        var val = Number(sliderMaster.value);
        if (labelMaster) labelMaster.textContent = val + '%';
        if (window.SANDAI && window.SANDAI.Audio) window.SANDAI.Audio.setMasterVolume(val / 100);
      });
    }

    var sliderMusic = document.getElementById('slider-music-volume');
    var labelMusic = document.getElementById('music-volume-val');
    if (sliderMusic) {
      sliderMusic.addEventListener('input', function () {
        var val = Number(sliderMusic.value);
        if (labelMusic) labelMusic.textContent = val + '%';
        if (window.SANDAI && window.SANDAI.Audio) window.SANDAI.Audio.setMusicVolume(val / 100);
      });
    }

    var sliderSfx = document.getElementById('slider-sfx-volume');
    var labelSfx = document.getElementById('sfx-volume-val');
    if (sliderSfx) {
      sliderSfx.addEventListener('input', function () {
        var val = Number(sliderSfx.value);
        if (labelSfx) labelSfx.textContent = val + '%';
        if (window.SANDAI && window.SANDAI.Audio) window.SANDAI.Audio.setSfxVolume(val / 100);
      });
    }

    var toggleAudioMute = document.getElementById('toggle-audio-mute');
    if (toggleAudioMute) {
      toggleAudioMute.addEventListener('change', function () {
        if (window.SANDAI && window.SANDAI.Audio) window.SANDAI.Audio.setMuted(toggleAudioMute.checked);
      });
    }

    // 5. Active Device Controls
    var deviceButtons = document.querySelectorAll('#group-device-mode .btn-toggle-option');
    deviceButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var dev = btn.getAttribute('data-device');
        deviceButtons.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        localStorage.setItem('sandai_device', dev);
        if (dev === 'auto') {
          var isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768;
          window.SANDAI.deviceType = isMobile ? 'mobile' : 'pc';
        } else {
          window.SANDAI.deviceType = dev;
        }
        if (window.SANDAI && window.SANDAI.Audio) window.SANDAI.Audio.playMenuClick();
      });
    });

    // 6. Fullscreen & Guide Buttons
    if (btnSettingsFullscreen) {
      btnSettingsFullscreen.addEventListener('click', function () {
        if (window.SANDAI && window.SANDAI.Controls) window.SANDAI.Controls.toggleFullscreen();
      });
    }
    if (btnSettingsGuide) {
      btnSettingsGuide.addEventListener('click', function () {
        closeSettings();
        showScreen('screen-controls-guide');
      });
    }

    // 7. Reset Defaults
    if (btnResetSettings) {
      btnResetSettings.addEventListener('click', function () {
        localStorage.setItem('sandai_graphics_quality', 'auto');
        localStorage.setItem('sandai_camera_shake', 'true');
        localStorage.setItem('sandai_reduced_vfx', 'false');
        localStorage.setItem('sandai_device', 'auto');
        if (window.SANDAI && window.SANDAI.Audio) {
          window.SANDAI.Audio.setMasterVolume(0.8);
          window.SANDAI.Audio.setMusicVolume(0.7);
          window.SANDAI.Audio.setSfxVolume(0.9);
          window.SANDAI.Audio.setMuted(false);
          window.SANDAI.Audio.playMenuClick();
        }
        syncSettingsUI();
      });
    }

    // Sync UI elements with current saved state
    function syncSettingsUI() {
      var currentQuality = localStorage.getItem('sandai_graphics_quality') || 'auto';
      qualityButtons.forEach(function (btn) {
        btn.classList.toggle('active', btn.getAttribute('data-quality') === currentQuality);
      });

      if (toggleShake) {
        toggleShake.checked = localStorage.getItem('sandai_camera_shake') !== 'false';
      }
      if (toggleReducedVFX) {
        toggleReducedVFX.checked = localStorage.getItem('sandai_reduced_vfx') === 'true';
      }

      var currentDev = localStorage.getItem('sandai_device') || 'auto';
      deviceButtons.forEach(function (btn) {
        btn.classList.toggle('active', btn.getAttribute('data-device') === currentDev);
      });

      if (window.SANDAI && window.SANDAI.Audio) {
        var audioSettings = window.SANDAI.Audio.getSettings();
        if (sliderMaster) sliderMaster.value = Math.round(audioSettings.masterVolume * 100);
        if (labelMaster) labelMaster.textContent = Math.round(audioSettings.masterVolume * 100) + '%';
        if (sliderMusic) sliderMusic.value = Math.round(audioSettings.musicVolume * 100);
        if (labelMusic) labelMusic.textContent = Math.round(audioSettings.musicVolume * 100) + '%';
        if (sliderSfx) sliderSfx.value = Math.round(audioSettings.sfxVolume * 100);
        if (labelSfx) labelSfx.textContent = Math.round(audioSettings.sfxVolume * 100) + '%';
        if (toggleAudioMute) toggleAudioMute.checked = !!audioSettings.muted;
      }
    }

    // Initialize UI on startup
    syncSettingsUI();
  }

  // ── Background Embers Animation ──────────────────────────────
  function createBackgroundEmbers() {
    var container = document.getElementById('ember-container');
    if (!container) return;

    for (var i = 0; i < 25; i++) {
      var ember = document.createElement('div');
      ember.className = 'ember';
      ember.style.left = Math.random() * 100 + '%';
      ember.style.animationDuration = (3 + Math.random() * 4) + 's';
      ember.style.animationDelay = (Math.random() * 3) + 's';
      ember.style.width = (3 + Math.random() * 5) + 'px';
      ember.style.height = ember.style.width;
      container.appendChild(ember);
    }
  }

  // ── Device Selection Screen ──────────────────────────────────
  function setupDeviceScreen() {
    var pcCard = document.getElementById('device-pc');
    var mobileCard = document.getElementById('device-mobile');
    var mobileNote = document.getElementById('mobile-local-note');

    function selectDevice(type) {
      window.SANDAI.deviceType = type;
      localStorage.setItem('sandai_device', type);
      applyDeviceClass(type);

      if (type === 'mobile') {
        if (mobileNote) mobileNote.classList.remove('hidden');
      } else {
        if (mobileNote) mobileNote.classList.add('hidden');
      }

      showScreen('screen-mode');
    }

    if (pcCard) {
      pcCard.addEventListener('click', function () {
        selectDevice('pc');
      });
    }

    if (mobileCard) {
      mobileCard.addEventListener('click', function () {
        selectDevice('mobile');
      });
    }

    // Auto-detect or restore saved device
    var savedDevice = localStorage.getItem('sandai_device');
    if (!savedDevice) {
      var isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
        (window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches) ||
        (window.innerWidth <= 900);
      savedDevice = isMobileDevice ? 'mobile' : 'pc';
    }
    window.SANDAI.deviceType = savedDevice;
  }

  // ── Game Mode Selection Screen ───────────────────────────────
  function setupModeScreen() {
    var backBtn = document.getElementById('mode-back');
    if (backBtn) {
      backBtn.addEventListener('click', function () {
        showScreen('screen-device');
      });
    }

    // Settings Dropdown
    var btnSettings = document.getElementById('btn-settings');
    var dropdown = document.getElementById('settings-dropdown');
    var btnChangeDevice = document.getElementById('btn-change-device');

    if (btnSettings && dropdown) {
      btnSettings.addEventListener('click', function (e) {
        e.stopPropagation();
        dropdown.classList.toggle('hidden');
      });

      document.addEventListener('click', function () {
        dropdown.classList.add('hidden');
      });
    }

    if (btnChangeDevice) {
      btnChangeDevice.addEventListener('click', function () {
        showScreen('screen-device');
      });
    }

    // Mode Cards
    var modeCards = document.querySelectorAll('.mode-card');
    modeCards.forEach(function (card) {
      card.addEventListener('click', function () {
        var mode = card.dataset.mode;
        window.SANDAI.gameMode = mode;

        if (mode === 'online') {
          initSocketMultiplayer();
          showScreen('screen-lobby');
        } else {
          startCharacterSelection();
        }
      });
    });
  }

  // ── Character Selection Screen (Separate P1 & Opponent Flow) ─
  function setupCharacterSelectScreen() {
    var backBtn = document.getElementById('charselect-back');
    if (backBtn) {
      backBtn.addEventListener('click', function () {
        if (currentSelectionStep === 2 && (window.SANDAI.gameMode === 'ai' || window.SANDAI.gameMode === 'local' || window.SANDAI.gameMode === 'training')) {
          // Go back from step 2 to step 1
          currentSelectionStep = 1;
          updateSelectionStepUI();
          renderCharacterGrid();
          updateDetailPanel(window.SANDAI.player1Character, 1);
        } else {
          if (window.SANDAI.gameMode === 'online') {
            showScreen('screen-lobby');
          } else {
            showScreen('screen-mode');
          }
        }
      });
    }

    // 2D / 3D Preview Mode Toggle
    var btnToggle3D = document.getElementById('btn-toggle-3d');
    var btnToggle2D = document.getElementById('btn-toggle-2d');
    var portraitFrame = document.getElementById('preview-portrait-frame');
    var preview3DFrame = document.getElementById('char-3d-preview-container');

    if (btnToggle3D && btnToggle2D) {
      btnToggle3D.addEventListener('click', function () {
        btnToggle3D.classList.add('active');
        btnToggle2D.classList.remove('active');
        if (preview3DFrame) preview3DFrame.style.display = 'block';
        if (portraitFrame) portraitFrame.style.display = 'none';
      });
      btnToggle2D.addEventListener('click', function () {
        btnToggle2D.classList.add('active');
        btnToggle3D.classList.remove('active');
        if (preview3DFrame) preview3DFrame.style.display = 'none';
        if (portraitFrame) portraitFrame.style.display = 'flex';
      });
    }

    // Random Character Picker Button
    var btnRandom = document.getElementById('btn-random-char');
    if (btnRandom) {
      btnRandom.addEventListener('click', function () {
        var randomId = Math.floor(Math.random() * 8);
        handleCharacterPick(randomId);
      });
    }

    // Confirm Fighter Button
    var btnFight = document.getElementById('btn-fight');
    if (btnFight) {
      btnFight.addEventListener('click', function () {
        handleConfirmStep();
      });
    }

    // AI Difficulty Selector Buttons
    var diffButtons = document.querySelectorAll('#ai-difficulty-selector .btn-diff-opt');
    diffButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        diffButtons.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        var d = btn.getAttribute('data-diff') || 'normal';
        window.SANDAI.aiDifficulty = d;
      });
    });
  }

  function startCharacterSelection(step) {
    if (typeof step === 'number') {
      currentSelectionStep = step;
    } else if (window.SANDAI.gameMode === 'online') {
      currentSelectionStep = (window.SANDAI.playerNumber === 2) ? 2 : 1;
    } else {
      currentSelectionStep = 1;
    }
    updateSelectionStepUI();

    // Default selections
    if (window.SANDAI.player1Character === undefined || window.SANDAI.player1Character === null) {
      window.SANDAI.player1Character = 0;
    }
    if (window.SANDAI.player2Character === undefined || window.SANDAI.player2Character === null) {
      window.SANDAI.player2Character = 1;
    }

    renderCharacterGrid();
    var activeChar = (currentSelectionStep === 1) ? window.SANDAI.player1Character : window.SANDAI.player2Character;
    updateDetailPanel(activeChar, currentSelectionStep);
    updateStatusChips();
    if (window.SANDAI.currentScreen !== 'character-select') {
      showScreen('screen-character-select');
    }
  }
  window.SANDAI.startCharacterSelection = startCharacterSelection;

  function updateSelectionStepUI() {
    var mode = window.SANDAI.gameMode;
    var titleEl = document.getElementById('charselect-title');
    var promptEl = document.getElementById('select-prompt');
    var pill1 = document.getElementById('step-pill-1');
    var pill2 = document.getElementById('step-pill-2');
    var btnFight = document.getElementById('btn-fight');
    var btnRandom = document.getElementById('btn-random-char');
    var diffSelector = document.getElementById('ai-difficulty-selector');

    if (diffSelector) {
      if (mode === 'ai' && currentSelectionStep === 2) {
        diffSelector.classList.remove('hidden');
      } else {
        diffSelector.classList.add('hidden');
      }
    }

    if (mode === 'ai') {
      if (currentSelectionStep === 1) {
        if (titleEl) titleEl.textContent = 'CHOOSE YOUR FIGHTER';
        if (promptEl) promptEl.textContent = 'STEP 1: SELECT YOUR COMBATANT';
        if (pill1) { pill1.className = 'step-pill active'; pill1.textContent = '1. YOUR FIGHTER'; }
        if (pill2) { pill2.className = 'step-pill'; pill2.textContent = '2. AI OPPONENT'; }
        if (btnFight) btnFight.textContent = 'CONFIRM FIGHTER ➔';
        if (btnRandom) btnRandom.querySelector('span:last-child').textContent = 'RANDOM';
      } else {
        if (titleEl) titleEl.textContent = 'CHOOSE YOUR OPPONENT';
        if (promptEl) promptEl.textContent = 'STEP 2: SELECT AI ENEMY (MIRROR MATCHES ALLOWED)';
        if (pill1) { pill1.className = 'step-pill done'; pill1.textContent = '✓ YOUR FIGHTER'; }
        if (pill2) { pill2.className = 'step-pill active'; pill2.textContent = '2. AI OPPONENT'; }
        if (btnFight) btnFight.textContent = 'CONFIRM OPPONENT ➔';
        if (btnRandom) btnRandom.querySelector('span:last-child').textContent = 'RANDOM OPPONENT';
      }
    } else if (mode === 'local') {
      if (currentSelectionStep === 1) {
        if (titleEl) titleEl.textContent = 'PLAYER 1 — CHOOSE FIGHTER';
        if (promptEl) promptEl.textContent = 'STEP 1: PLAYER 1 SELECTION';
        if (pill1) { pill1.className = 'step-pill active'; pill1.textContent = '1. PLAYER 1'; }
        if (pill2) { pill2.className = 'step-pill'; pill2.textContent = '2. PLAYER 2'; }
        if (btnFight) btnFight.textContent = 'CONFIRM P1 ➔';
      } else {
        if (titleEl) titleEl.textContent = 'PLAYER 2 — CHOOSE FIGHTER';
        if (promptEl) promptEl.textContent = 'STEP 2: PLAYER 2 SELECTION (MIRROR MATCHES ALLOWED)';
        if (pill1) { pill1.className = 'step-pill done'; pill1.textContent = '✓ PLAYER 1'; }
        if (pill2) { pill2.className = 'step-pill active'; pill2.textContent = '2. PLAYER 2'; }
        if (btnFight) btnFight.textContent = 'CONFIRM P2 ➔';
      }
    } else if (mode === 'training') {
      if (currentSelectionStep === 1) {
        if (titleEl) titleEl.textContent = 'TRAINING DOJO — SELECT FIGHTER';
        if (promptEl) promptEl.textContent = 'STEP 1: SELECT YOUR COMBATANT';
        if (pill1) { pill1.className = 'step-pill active'; pill1.textContent = '1. YOUR FIGHTER'; }
        if (pill2) { pill2.className = 'step-pill'; pill2.textContent = '2. TRAINING DUMMY'; }
        if (btnFight) btnFight.textContent = 'CONFIRM FIGHTER ➔';
      } else {
        if (titleEl) titleEl.textContent = 'TRAINING DOJO — SELECT DUMMY';
        if (promptEl) promptEl.textContent = 'STEP 2: SELECT TRAINING DUMMY (MIRROR ALLOWED)';
        if (pill1) { pill1.className = 'step-pill done'; pill1.textContent = '✓ YOUR FIGHTER'; }
        if (pill2) { pill2.className = 'step-pill active'; pill2.textContent = '2. TRAINING DUMMY'; }
        if (btnFight) btnFight.textContent = 'START TRAINING ➔';
      }
    } else { // online
      var pNum = (window.SANDAI.playerNumber === 2 || currentSelectionStep === 2) ? 2 : 1;
      if (titleEl) titleEl.textContent = (pNum === 1) ? 'HOST — SELECT FIGHTER' : 'GUEST — SELECT FIGHTER';
      if (promptEl) promptEl.textContent = 'SELECT YOUR COMBATANT FOR MULTIPLAYER';
      if (pill1) { pill1.className = 'step-pill active'; pill1.textContent = 'PLAYER ' + pNum + ' FIGHTER'; }
      if (pill2) pill2.className = 'step-pill hidden';
      if (btnFight) btnFight.textContent = 'CONFIRM FIGHTER ➔';
    }
  }

  function handleConfirmStep() {
    var mode = window.SANDAI.gameMode;
    if (mode === 'ai') {
      if (currentSelectionStep === 1) {
        // P1 confirmed, now advance to select opponent
        currentSelectionStep = 2;
        updateSelectionStepUI();
        renderCharacterGrid();
        updateDetailPanel(window.SANDAI.player2Character, 2);
        updateStatusChips();
      } else {
        // Opponent confirmed, proceed to arena selection
        onFightTriggered();
      }
    } else if (mode === 'local') {
      if (currentSelectionStep === 1) {
        currentSelectionStep = 2;
        updateSelectionStepUI();
        renderCharacterGrid();
        updateDetailPanel(window.SANDAI.player2Character, 2);
        updateStatusChips();
      } else {
        onFightTriggered();
      }
    } else if (mode === 'training') {
      if (currentSelectionStep === 1) {
        currentSelectionStep = 2;
        updateSelectionStepUI();
        renderCharacterGrid();
        updateDetailPanel(window.SANDAI.player2Character, 2);
        updateStatusChips();
      } else {
        onFightTriggered();
      }
    } else if (mode === 'online') {
      var pNum = (window.SANDAI.playerNumber === 2 || currentSelectionStep === 2) ? 2 : 1;
      var charId = (pNum === 1) ? window.SANDAI.player1Character : window.SANDAI.player2Character;
      if (window.SANDAI.socket && window.SANDAI.roomCode) {
        window.SANDAI.socket.emit('select-character', {
          roomCode: window.SANDAI.roomCode,
          characterId: charId
        });
      }
      showScreen('screen-lobby');
    }
  }

  function renderCharacterGrid() {
    var grid = document.getElementById('char-grid');
    if (!grid) return;
    grid.innerHTML = '';

    var chars = window.SANDAI.CHARACTERS || [];
    var mode = window.SANDAI.gameMode;
    var activeId = (currentSelectionStep === 1) ? window.SANDAI.player1Character : window.SANDAI.player2Character;

    chars.forEach(function (c) {
      var card = document.createElement('div');
      card.className = 'char-card-v2';
      card.dataset.id = c.id;

      if (window.SANDAI.player1Character === c.id) {
        card.classList.add('selected-p1');
      }
      if (window.SANDAI.player2Character === c.id) {
        card.classList.add('selected-p2');
      }
      if (activeId === c.id) {
        card.classList.add('active-step-select');
      }

      card.innerHTML =
        '<div class="card-portrait-wrap">' +
          '<img class="char-portrait-img" src="assets/characters/' + c.portraitFile + '" alt="' + c.name + '">' +
          '<div class="card-border-glow"></div>' +
        '</div>' +
        '<div class="card-info">' +
          '<span class="card-name">' + c.name.toUpperCase() + '</span>' +
          '<span class="card-style">' + c.style + '</span>' +
        '</div>';

      card.addEventListener('click', function () {
        handleCharacterPick(c.id);
      });

      grid.appendChild(card);
    });
  }

  function handleCharacterPick(charId) {
    if (currentSelectionStep === 1) {
      window.SANDAI.player1Character = charId;
      updateDetailPanel(charId, 1);
    } else {
      window.SANDAI.player2Character = charId;
      updateDetailPanel(charId, 2);
    }
    renderCharacterGrid();
    updateStatusChips();

    // On mobile, auto-center selected card in horizontal carousel
    var activeCard = document.querySelector('.char-card-v2[data-id="' + charId + '"]');
    if (activeCard && activeCard.scrollIntoView) {
      activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }

  function updateDetailPanel(charId, playerNum) {
    var chars = window.SANDAI.CHARACTERS || [];
    var c = chars[charId] || chars[0];

    var portrait = document.getElementById('detail-portrait');
    var name = document.getElementById('detail-name');
    var style = document.getElementById('detail-style');
    var archetype = document.getElementById('detail-archetype');
    var badge = document.getElementById('detail-player-badge');

    if (portrait) portrait.src = 'assets/characters/' + c.portraitFile;
    if (name) name.textContent = c.name.toUpperCase();
    if (style) style.textContent = c.style;
    if (archetype) archetype.textContent = c.archetype || 'Martial Combatant';

    if (badge) {
      if (window.SANDAI.gameMode === 'ai') {
        badge.textContent = playerNum === 1 ? 'PLAYER 1' : 'AI OPPONENT';
        badge.className = playerNum === 1 ? 'portrait-player-badge p1-badge' : 'portrait-player-badge p2-badge';
      } else if (window.SANDAI.gameMode === 'local') {
        badge.textContent = 'PLAYER ' + playerNum;
        badge.className = playerNum === 1 ? 'portrait-player-badge p1-badge' : 'portrait-player-badge p2-badge';
      } else if (window.SANDAI.gameMode === 'training') {
        badge.textContent = playerNum === 1 ? 'YOUR FIGHTER' : 'TRAINING DUMMY';
        badge.className = playerNum === 1 ? 'portrait-player-badge p1-badge' : 'portrait-player-badge p2-badge';
      } else {
        badge.textContent = 'YOUR SELECTION';
        badge.className = 'portrait-player-badge p1-badge';
      }
    }

    // Dynamic Fighter Atmosphere Tinting
    var atmosphere = document.getElementById('charselect-atmosphere-overlay');
    if (atmosphere) {
      var charColors = [
        'rgba(255, 60, 0, 0.4)',   // Abilash (Inferno Flame)
        'rgba(0, 229, 255, 0.4)',  // Anas (Titanium Cyan)
        'rgba(0, 230, 118, 0.4)',  // Dhinesh (Emerald Shadow)
        'rgba(124, 77, 255, 0.4)', // Farook (High-Voltage Violet)
        'rgba(100, 255, 218, 0.4)',// Kiran (Tempest Silver)
        'rgba(118, 255, 3, 0.4)',  // Nawin (Toxic Acid Green)
        'rgba(255, 145, 0, 0.4)',  // Rafeek (Titan Bronze)
        'rgba(255, 215, 0, 0.4)'   // Tharun (Solar Radiant Gold)
      ];
      var chosenColor = charColors[charId] || 'rgba(0, 102, 255, 0.35)';
      atmosphere.style.background = 'radial-gradient(circle at 35% 50%, ' + chosenColor + ' 0%, transparent 70%)';
    }

    // Mount 3D Character Preview Canvas in Character Select
    if (active3DPreview && active3DPreview.destroy) {
      active3DPreview.destroy();
      active3DPreview = null;
    }
    var previewContainer = document.getElementById('char-3d-preview-container');
    if (previewContainer && window.SANDAI.Renderer3D && window.SANDAI.Renderer3D.createPreviewScene) {
      try {
        active3DPreview = window.SANDAI.Renderer3D.createPreviewScene('char-3d-preview-container', c);
      } catch (e) {
        console.warn('3D preview init error:', e);
      }
    }

    // Update Stats Bars & Numbers
    var pwrFill = document.getElementById('stat-power-fill');
    var spdFill = document.getElementById('stat-speed-fill');
    var defFill = document.getElementById('stat-defense-fill');
    var spcFill = document.getElementById('stat-special-fill');

    var pwrVal = document.getElementById('stat-power-val');
    var spdVal = document.getElementById('stat-speed-val');
    var defVal = document.getElementById('stat-defense-val');
    var spcVal = document.getElementById('stat-special-val');

    if (pwrFill) pwrFill.style.width = (c.power * 10) + '%';
    if (spdFill) spdFill.style.width = (c.speed * 10) + '%';
    if (defFill) defFill.style.width = (c.defense * 10) + '%';
    if (spcFill) spcFill.style.width = (c.special * 10) + '%';

    if (pwrVal) pwrVal.textContent = c.power;
    if (spdVal) spdVal.textContent = c.speed;
    if (defVal) defVal.textContent = c.defense;
    if (spcVal) spcVal.textContent = c.special;

    // Special Ability Card
    var abName = document.getElementById('detail-ability-name');
    var abDesc = document.getElementById('detail-ability-desc');
    if (abName) abName.textContent = c.abilityName || 'Elemental Blast';
    if (abDesc) abDesc.textContent = c.abilityDesc || 'Channels martial combat power into a devastating strike.';
  }

  function updateStatusChips() {
    var chars = window.SANDAI.CHARACTERS || [];
    var c1 = chars[window.SANDAI.player1Character] || chars[0];
    var c2 = chars[window.SANDAI.player2Character] || chars[1];

    var chip1Text = document.getElementById('status-chip-p1-text');
    var chip2Text = document.getElementById('status-chip-p2-text');

    if (chip1Text) chip1Text.textContent = 'P1: ' + c1.name;
    if (chip2Text) {
      var label = window.SANDAI.gameMode === 'ai' ? 'OPPONENT: ' : (window.SANDAI.gameMode === 'training' ? 'DUMMY: ' : 'P2: ');
      chip2Text.textContent = label + c2.name;
    }
  }

  // ── Arena Selection Screen Handlers ─────────────────────────
  function setupArenaSelectScreen() {
    var backBtn = document.getElementById('arenaselect-back');
    if (backBtn) {
      backBtn.addEventListener('click', function () {
        if (window.SANDAI.gameMode === 'online') {
          showScreen('screen-lobby');
        } else {
          showScreen('screen-character-select');
        }
      });
    }

    var arenaCards = document.querySelectorAll('.arena-card, .arena-card-v2');
    arenaCards.forEach(function (card) {
      card.addEventListener('click', function () {
        arenaCards.forEach(function (c) { c.classList.remove('active'); });
        card.classList.add('active');
        window.SANDAI.selectedArena = card.dataset.arena || 'mountain';
      });
    });

    var btnConfirm = document.getElementById('btn-confirm-arena');
    if (btnConfirm) {
      btnConfirm.addEventListener('click', function () {
        onArenaSelected();
      });
    }
  }

  function onArenaSelected() {
    // If online, broadcast arena selection to the room
    if (window.SANDAI.socket && window.SANDAI.roomCode) {
      window.SANDAI.socket.emit('select-arena', {
        roomCode: window.SANDAI.roomCode,
        arena: window.SANDAI.selectedArena
      });
    }

    if (window.SANDAI.deviceType === 'pc') {
      showScreen('screen-controls-guide');
    } else {
      startMatchSequence();
    }
  }

  // ── PC Controls Guide Screen Handlers ────────────────────────
  function setupControlsGuideScreen() {
    var btnStart = document.getElementById('btn-start-fight-guide');
    var btnBack = document.getElementById('guide-back');

    if (btnStart) {
      btnStart.addEventListener('click', function () {
        startMatchSequence();
      });
    }

    if (btnBack) {
      btnBack.addEventListener('click', function () {
        if (window.SANDAI.gameMode === 'online') {
          showScreen('screen-lobby');
        } else {
          showScreen('screen-arena-select');
        }
      });
    }
  }

  // Entry point before fight: Proceed to Arena Selection
  function onFightTriggered() {
    showScreen('screen-arena-select');
  }

  // ── Cinematic Loading Screen & Match Launch Sequence ────────
  function startMatchSequence() {
    var chars = window.SANDAI.CHARACTERS || [];
    var c1 = chars[window.SANDAI.player1Character] || chars[0];
    var c2 = chars[window.SANDAI.player2Character] || chars[1];

    var arenaNames = {
      mountain: 'MOUNTAIN SHRINE',
      forest: 'BAMBOO SANCTUARY',
      rainy: 'STORM PAGODA',
      volcanic: 'MOLTEN CORE',
      nightcity: 'NIGHT CITY ROOFTOP'
    };
    var activeArenaName = arenaNames[window.SANDAI.selectedArena] || 'MOUNTAIN SHRINE';

    // 1. Show Cinematic Loading Screen
    showScreen('screen-loading');

    var subTitleEl = document.getElementById('loading-arena-subtitle');
    var barEl = document.getElementById('loading-progress-bar');
    var percentEl = document.getElementById('loading-percent-val');
    var statusEl = document.getElementById('loading-status-text');
    var errorEl = document.getElementById('loading-error');
    var retryBtn = document.getElementById('btn-loading-retry');

    if (errorEl) errorEl.classList.add('hidden');
    if (subTitleEl) subTitleEl.textContent = activeArenaName + ' • ' + c1.name.toUpperCase() + ' VS ' + c2.name.toUpperCase();
    if (barEl) barEl.style.width = '0%';
    if (percentEl) percentEl.textContent = '0%';
    if (statusEl) statusEl.textContent = 'INITIALIZING 3D ENVIRONMENT...';

    var progress = 0;
    var loadInterval = setInterval(function () {
      progress += Math.floor(Math.random() * 18) + 12;
      if (progress >= 100) {
        progress = 100;
        clearInterval(loadInterval);
        if (barEl) barEl.style.width = '100%';
        if (percentEl) percentEl.textContent = '100%';
        if (statusEl) statusEl.textContent = 'BATTLE READY!';

        setTimeout(proceedToVS, 320);
      } else {
        if (barEl) barEl.style.width = progress + '%';
        if (percentEl) percentEl.textContent = progress + '%';
        if (progress > 30 && progress < 70) {
          if (statusEl) statusEl.textContent = 'LOADING FIGHTER SHADERS & RIGGING...';
        } else if (progress >= 70) {
          if (statusEl) statusEl.textContent = 'SYNCHRONIZING COMBAT TICK (60 FPS)...';
        }
      }
    }, 90);

    if (retryBtn) {
      retryBtn.onclick = function () {
        if (errorEl) errorEl.classList.add('hidden');
        startMatchSequence();
      };
    }

    function proceedToVS() {
      var vsP1Img = document.getElementById('vs-p1-img');
      var vsP1Name = document.getElementById('vs-p1-name');
      var vsP1Style = document.getElementById('vs-p1-style');

      var vsP2Img = document.getElementById('vs-p2-img');
      var vsP2Name = document.getElementById('vs-p2-name');
      var vsP2Style = document.getElementById('vs-p2-style');
      var vsP2Role = document.getElementById('vs-p2-role');
      var vsArenaName = document.getElementById('vs-arena-name');

      if (vsP1Img) vsP1Img.src = 'assets/characters/' + c1.portraitFile;
      if (vsP1Name) vsP1Name.textContent = c1.name.toUpperCase();
      if (vsP1Style) vsP1Style.textContent = c1.style;

      if (vsP2Img) vsP2Img.src = 'assets/characters/' + c2.portraitFile;
      if (vsP2Name) vsP2Name.textContent = c2.name.toUpperCase();
      if (vsP2Style) vsP2Style.textContent = c2.style;
      if (vsP2Role) {
        vsP2Role.textContent = (window.SANDAI.gameMode === 'ai') ? 'AI OPPONENT' : (window.SANDAI.gameMode === 'training' ? 'TRAINING DUMMY' : 'PLAYER 2');
      }

      if (vsArenaName) {
        vsArenaName.textContent = activeArenaName;
      }

      showScreen('screen-vs');

      // 2.2 Second Dramatic VS Screen Reveal -> Enter Fight
      setTimeout(function () {
        showScreen('screen-game');
        if (window.SANDAI.startGame) {
          window.SANDAI.startGame();
        }
      }, 2200);
    }
  }

  // ── Online Multiplayer Lobby & Real-Time Sync ───────────────
  var pingInterval = null;

  function resolveServerUrl() {
    // 1. URL parameter override: ?server=https://...
    try {
      var urlParams = new URLSearchParams(window.location.search);
      var paramServer = urlParams.get('server');
      if (paramServer && paramServer.trim()) {
        var s = paramServer.trim().replace(/\/$/, '');
        localStorage.setItem('sandai_server_url', s);
        window.SANDAI_SERVER_URL = s;
        return s;
      }
    } catch (e) {}

    var hostname = window.location.hostname || '';
    var protocol = window.location.protocol || '';

    // 2. Render Web Service Deployment: ALWAYS prioritize same-origin connection!
    if (hostname.includes('onrender.com')) {
      return window.location.origin.replace(/\/$/, '');
    }

    // 3. Global runtime override (ignore insecure localhost if on HTTPS)
    if (window.SANDAI_SERVER_URL && window.SANDAI_SERVER_URL.trim()) {
      var sUrl = window.SANDAI_SERVER_URL.trim().replace(/\/$/, '');
      if (!(protocol === 'https:' && sUrl.startsWith('http://localhost'))) {
        return sUrl;
      }
    }

    // 4. User saved endpoint in localStorage (ignore insecure localhost if on HTTPS)
    var savedUrl = localStorage.getItem('sandai_server_url');
    if (savedUrl && savedUrl.trim()) {
      var sUrl = savedUrl.trim().replace(/\/$/, '');
      if (!(protocol === 'https:' && sUrl.startsWith('http://localhost'))) {
        return sUrl;
      }
    }

    // 5. Localhost or file execution
    if (protocol === 'file:' || hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') {
      return 'http://localhost:3000';
    }

    // 6. Vercel deployment: connect to persistent Render backend
    if (hostname.includes('vercel.app')) {
      return 'https://sandai-backend.onrender.com';
    }

    // 7. Default to current web origin
    return window.location.origin ? window.location.origin.replace(/\/$/, '') : 'http://localhost:3000';
  }

  function initSocketMultiplayer() {
    var statusDot = document.querySelector('#connection-status .status-dot');
    var statusText = document.querySelector('#connection-status .status-text');

    if (window.SANDAI.socket && window.SANDAI.socket.connected) {
      if (statusDot) statusDot.className = 'status-dot connected';
      if (statusText) statusText.textContent = 'Connected';
      return;
    }

    if (statusDot) statusDot.className = 'status-dot connecting';
    if (statusText) statusText.textContent = 'Connecting...';

    var serverUrl = resolveServerUrl();

    // If socket already exists, ensure it is connecting
    if (window.SANDAI.socket) {
      if (!window.SANDAI.socket.connected) {
        window.SANDAI.socket.connect();
      }
      return;
    }

    try {
      window.SANDAI.socket = io(serverUrl, {
        transports: ['polling', 'websocket'],
        reconnection: true,
        reconnectionAttempts: 25,
        reconnectionDelay: 1200,
        reconnectionDelayMax: 4000,
        timeout: 15000
      });
    } catch (e) {
      console.warn('Socket.IO init error:', e);
      if (statusDot) statusDot.className = 'status-dot disconnected';
      if (statusText) statusText.textContent = 'Socket Error';
      return;
    }

    var socket = window.SANDAI.socket;

    socket.on('connect', function () {
      console.log('[Multiplayer] Connected to server:', serverUrl);
      var dot = document.querySelector('#connection-status .status-dot');
      var txt = document.querySelector('#connection-status .status-text');
      if (dot) dot.className = 'status-dot connected';
      if (txt) txt.textContent = 'Connected';

      // Start Latency / Ping Monitor
      if (pingInterval) clearInterval(pingInterval);
      pingInterval = setInterval(function () {
        if (socket && socket.connected) {
          socket.emit('ping-check', { clientTs: Date.now() });
        }
      }, 2500);
      socket.emit('ping-check', { clientTs: Date.now() });
    });

    socket.on('pong-check', function (data) {
      var rtt = Math.max(1, Date.now() - (data.clientTs || Date.now()));
      var pingText = document.getElementById('ping-text');
      var pingPill = document.getElementById('lobby-ping');
      if (pingText) pingText.textContent = rtt + ' ms';
      if (pingPill) {
        if (rtt < 80) pingPill.className = 'ping-pill ping-good';
        else if (rtt < 170) pingPill.className = 'ping-pill ping-med';
        else pingPill.className = 'ping-pill ping-bad';
      }
    });

    socket.on('connect_error', function (err) {
      console.warn('[Multiplayer] Socket connect_error:', err);
      var dot = document.querySelector('#connection-status .status-dot');
      var txt = document.querySelector('#connection-status .status-text');
      if (dot) dot.className = 'status-dot disconnected';
      if (txt) {
        if (window.location.hostname.includes('onrender.com') || window.location.hostname.includes('vercel.app')) {
          txt.textContent = 'Waking up server (~30s)...';
        } else {
          txt.textContent = 'Server Offline';
        }
      }
    });

    socket.on('disconnect', function (reason) {
      console.log('[Multiplayer] Socket disconnected:', reason);
      var dot = document.querySelector('#connection-status .status-dot');
      var txt = document.querySelector('#connection-status .status-text');
      if (dot) dot.className = 'status-dot disconnected';
      if (txt) txt.textContent = 'Disconnected';
      if (pingInterval) clearInterval(pingInterval);
    });

    // Room created (Host)
    socket.on('room-created', function (data) {
      window.SANDAI.roomCode = data.code;
      window.SANDAI.playerNumber = 1;
      window.SANDAI.guestConnected = false;
      window.SANDAI.selectedArena = data.arena || 'mountain';
      if (data.characterId !== undefined) {
        window.SANDAI.player1Character = data.characterId;
      }
      window.SANDAI.p1Ready = false;
      window.SANDAI.p2Ready = false;
      updateLobbyUI();
    });

    // Room joined (Guest)
    socket.on('room-joined', function (data) {
      window.SANDAI.roomCode = data.code;
      window.SANDAI.playerNumber = 2;
      window.SANDAI.guestConnected = true;
      window.SANDAI.selectedArena = data.arena || 'mountain';

      if (data.players) {
        if (data.players[0] && data.players[0].characterId !== null) {
          window.SANDAI.player1Character = data.players[0].characterId;
          window.SANDAI.p1Ready = !!data.players[0].ready;
        }
        if (data.players[1] && data.players[1].characterId !== null) {
          window.SANDAI.player2Character = data.players[1].characterId;
          window.SANDAI.p2Ready = !!data.players[1].ready;
        }
      }
      updateLobbyUI();
    });

    // Opponent joined (Host view)
    socket.on('player-joined', function (data) {
      window.SANDAI.guestConnected = true;
      if (data && data.arena) {
        window.SANDAI.selectedArena = data.arena;
      }
      if (data && data.characterId !== undefined) {
        window.SANDAI.player2Character = data.characterId;
      }
      window.SANDAI.p2Ready = false;
      updateLobbyUI();
    });

    // Opponent left
    socket.on('player-left', function (data) {
      if (window.SANDAI.playerNumber === 1) {
        window.SANDAI.guestConnected = false;
        window.SANDAI.p2Ready = false;
        var readyStatus = document.getElementById('ready-status');
        if (readyStatus) {
          readyStatus.textContent = 'Opponent left the room. Waiting for new player...';
          readyStatus.style.color = '#ffaa33';
        }
        updateLobbyUI();
      } else {
        alert('The room host has left the room.');
        window.SANDAI.roomCode = null;
        window.SANDAI.guestConnected = false;
        window.SANDAI.p1Ready = false;
        window.SANDAI.p2Ready = false;
        updateLobbyUI();
        showScreen('screen-mode');
      }
    });

    // Character selected sync
    socket.on('character-selected', function (data) {
      if (data.playerIndex === 0) {
        window.SANDAI.player1Character = data.characterId;
        window.SANDAI.p1Ready = false;
      } else {
        window.SANDAI.player2Character = data.characterId;
        window.SANDAI.p2Ready = false;
      }
      updateLobbyUI();
    });

    // Arena selected sync
    socket.on('arena-selected', function (data) {
      if (data && data.arena) {
        window.SANDAI.selectedArena = data.arena;
      }
      if (data && data.resetReady) {
        window.SANDAI.p1Ready = false;
        window.SANDAI.p2Ready = false;
      }
      updateLobbyUI();
    });

    // Ready status sync
    socket.on('player-ready-ack', function (data) {
      if (data.playerIndex === 0) {
        window.SANDAI.p1Ready = !!data.ready;
      } else {
        window.SANDAI.p2Ready = !!data.ready;
      }
      updateLobbyUI();
    });

    // Both players ready sync
    socket.on('both-players-ready', function (data) {
      if (data.players) {
        if (data.players[0]) window.SANDAI.p1Ready = !!data.players[0].ready;
        if (data.players[1]) window.SANDAI.p2Ready = !!data.players[1].ready;
      } else if (data.canStart) {
        window.SANDAI.p1Ready = true;
        window.SANDAI.p2Ready = true;
      }
      updateLobbyUI();
    });

    // Synchronized Match Start
    socket.on('match-start', function (data) {
      if (data && data.players) {
        window.SANDAI.player1Character = data.players[0].characterId !== null ? data.players[0].characterId : 0;
        window.SANDAI.player2Character = data.players[1].characterId !== null ? data.players[1].characterId : 1;
      }
      if (data && data.arena) {
        window.SANDAI.selectedArena = data.arena;
      }
      // Hide any disconnect overlays
      var discOverlay = document.getElementById('disconnect-overlay');
      if (discOverlay) discOverlay.classList.add('hidden');

      startMatchSequence();
    });

    // Disconnection & Grace Period
    socket.on('player-disconnected', function (data) {
      var overlay = document.getElementById('disconnect-overlay');
      var countdownEl = document.getElementById('disconnect-countdown');
      if (overlay && window.SANDAI.currentScreen === 'game') {
        overlay.classList.remove('hidden');
        var remaining = Math.round((data.graceMs || 30000) / 1000);
        if (countdownEl) countdownEl.textContent = remaining;
        var interval = setInterval(function () {
          remaining--;
          if (countdownEl) countdownEl.textContent = Math.max(0, remaining);
          if (remaining <= 0 || overlay.classList.contains('hidden')) {
            clearInterval(interval);
          }
        }, 1000);
      }
    });

    socket.on('player-reconnected', function () {
      var overlay = document.getElementById('disconnect-overlay');
      if (overlay) overlay.classList.add('hidden');
      updateLobbyUI();
    });

    socket.on('player-abandoned', function () {
      var overlay = document.getElementById('disconnect-overlay');
      if (overlay) overlay.classList.add('hidden');
      alert('Opponent abandoned the room. Victory declared by forfeit!');
      showScreen('screen-home');
    });

    // Rematch Handlers
    socket.on('rematch-requested', function (data) {
      var statusEl = document.getElementById('rematch-status');
      var btnRematch = document.getElementById('btn-rematch');
      if (statusEl) {
        statusEl.textContent = 'Opponent requested a rematch!';
        statusEl.classList.remove('hidden');
      }
      if (btnRematch) {
        btnRematch.textContent = 'ACCEPT REMATCH';
        btnRematch.classList.add('pulse-glow');
      }
    });

    socket.on('rematch-start', function (data) {
      if (data && data.players) {
        window.SANDAI.player1Character = data.players[0].characterId;
        window.SANDAI.player2Character = data.players[1].characterId;
      }
      if (data && data.arena) {
        window.SANDAI.selectedArena = data.arena;
      }
      var statusEl = document.getElementById('rematch-status');
      if (statusEl) statusEl.classList.add('hidden');
      startMatchSequence();
    });

    // Error Feedback
    socket.on('error-message', function (data) {
      var feedback = document.getElementById('join-feedback');
      var readyStatus = document.getElementById('ready-status');
      var msg = data.error || 'Server error';

      if (feedback && !feedback.classList.contains('hidden-tab')) {
        feedback.textContent = msg;
        feedback.className = 'join-feedback error';
        feedback.classList.remove('hidden');
      }
      if (readyStatus) {
        readyStatus.textContent = msg;
        readyStatus.style.color = '#ff3344';
        setTimeout(function () {
          readyStatus.style.color = '';
        }, 3500);
      }
    });
  }

  // ── Clipboard Helper with Robust Fallbacks ───────────────────
  function copyToClipboard(text, successMsg) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        showCopyToast(successMsg);
      }).catch(function () {
        execFallbackCopy(text, successMsg);
      });
    } else {
      execFallbackCopy(text, successMsg);
    }
  }

  function execFallbackCopy(text, successMsg) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    ta.style.left = '-9999px';
    ta.setAttribute('readonly', '');
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      var ok = document.execCommand('copy');
      if (ok) {
        showCopyToast(successMsg);
      } else {
        prompt('Copy room code:', text);
      }
    } catch (e) {
      prompt('Copy room code:', text);
    }
    if (ta.parentNode) ta.parentNode.removeChild(ta);
  }

  // ── Real-Time Lobby UI Synchronization ────────────────────────
  function updateLobbyUI() {
    var initialView = document.getElementById('lobby-initial-view');
    var roomView = document.getElementById('lobby-room-view');
    if (!window.SANDAI.roomCode) {
      if (initialView) initialView.classList.remove('hidden');
      if (roomView) roomView.classList.add('hidden');
      return;
    }

    if (initialView) initialView.classList.add('hidden');
    if (roomView) roomView.classList.remove('hidden');

    var codeDisplay = document.getElementById('room-code-display');
    if (codeDisplay) codeDisplay.textContent = window.SANDAI.roomCode;

    var chars = window.SANDAI.CHARACTERS || [];
    var c1 = chars[window.SANDAI.player1Character] || chars[0];
    var c2 = chars[window.SANDAI.player2Character] || chars[1];

    // Host Slot (P1)
    var p1Img = document.getElementById('lobby-p1-img');
    var p1Name = document.getElementById('lobby-p1-name');
    var p1Style = document.getElementById('lobby-p1-style');
    var p1Ready = document.getElementById('lobby-p1-ready');
    var btnChangeP1 = document.getElementById('btn-change-char-p1');

    if (p1Img) p1Img.src = 'assets/characters/' + c1.portraitFile;
    if (p1Name) p1Name.textContent = c1.name.toUpperCase();
    if (p1Style) p1Style.textContent = c1.style;
    if (p1Ready) {
      p1Ready.textContent = window.SANDAI.p1Ready ? 'READY ✓' : 'NOT READY';
      p1Ready.className = window.SANDAI.p1Ready ? 'slot-ready-status is-ready' : 'slot-ready-status not-ready';
    }
    if (btnChangeP1) {
      btnChangeP1.style.display = (window.SANDAI.playerNumber === 1) ? 'block' : 'none';
    }

    // Guest Slot (P2)
    var p2Img = document.getElementById('lobby-p2-img');
    var p2Name = document.getElementById('lobby-p2-name');
    var p2Style = document.getElementById('lobby-p2-style');
    var p2Ready = document.getElementById('lobby-p2-ready');
    var p2Waiting = document.getElementById('slot-p2-waiting');
    var btnChangeP2 = document.getElementById('btn-change-char-p2');

    var isGuestConnected = !!window.SANDAI.guestConnected;

    if (p2Img) p2Img.src = 'assets/characters/' + c2.portraitFile;
    if (p2Name) p2Name.textContent = isGuestConnected ? c2.name.toUpperCase() : 'WAITING...';
    if (p2Style) p2Style.textContent = isGuestConnected ? c2.style : 'Awaiting Challenger';

    if (p2Waiting) {
      if (!isGuestConnected && window.SANDAI.playerNumber === 1) {
        p2Waiting.classList.remove('hidden');
      } else {
        p2Waiting.classList.add('hidden');
      }
    }

    if (p2Ready) {
      if (!isGuestConnected) {
        p2Ready.textContent = 'WAITING';
        p2Ready.className = 'slot-ready-status not-ready';
      } else {
        p2Ready.textContent = window.SANDAI.p2Ready ? 'READY ✓' : 'NOT READY';
        p2Ready.className = window.SANDAI.p2Ready ? 'slot-ready-status is-ready' : 'slot-ready-status not-ready';
      }
    }

    if (btnChangeP2) {
      btnChangeP2.style.display = (window.SANDAI.playerNumber === 2) ? 'block' : 'none';
    }

    // Arena Selection Row
    var arenaCards = document.querySelectorAll('.lobby-arena-card');
    arenaCards.forEach(function (card) {
      if (card.dataset.arena === window.SANDAI.selectedArena) {
        card.classList.add('active');
      } else {
        card.classList.remove('active');
      }
    });

    var hostTag = document.getElementById('arena-host-tag');
    if (hostTag) {
      if (window.SANDAI.playerNumber === 1) {
        hostTag.textContent = 'CLICK TO CHOOSE ARENA (HOST)';
        hostTag.style.color = '#00ddff';
      } else {
        hostTag.textContent = 'HOST IS CHOOSING ARENA';
        hostTag.style.color = '#ffaa33';
      }
    }

    // Ready Button state for local player
    var btnReady = document.getElementById('btn-ready');
    var btnStartMatch = document.getElementById('btn-start-match');
    var readyStatus = document.getElementById('ready-status');
    var amIReady = (window.SANDAI.playerNumber === 1) ? window.SANDAI.p1Ready : window.SANDAI.p2Ready;

    if (btnReady) {
      if (amIReady) {
        btnReady.classList.add('active-ready');
        btnReady.textContent = 'CANCEL READY ✕';
      } else {
        btnReady.classList.remove('active-ready');
        btnReady.textContent = 'READY FOR BATTLE ✓';
      }
    }

    // Host-Controlled Start Match Button
    if (btnStartMatch) {
      if (window.SANDAI.playerNumber === 1) {
        btnStartMatch.style.display = 'inline-flex';
        var canHostLaunch = isGuestConnected && window.SANDAI.p1Ready && window.SANDAI.p2Ready;
        if (canHostLaunch) {
          btnStartMatch.disabled = false;
          btnStartMatch.classList.remove('disabled');
          btnStartMatch.classList.add('btn-start-pulse');
          btnStartMatch.textContent = 'START MATCH ⚔';
        } else {
          btnStartMatch.disabled = true;
          btnStartMatch.classList.add('disabled');
          btnStartMatch.classList.remove('btn-start-pulse');
          if (!isGuestConnected) {
            btnStartMatch.textContent = 'WAITING FOR OPPONENT';
          } else if (!window.SANDAI.p1Ready || !window.SANDAI.p2Ready) {
            btnStartMatch.textContent = 'WAITING FOR READY';
          }
        }
      } else {
        // Guest view
        btnStartMatch.style.display = 'inline-flex';
        btnStartMatch.disabled = true;
        btnStartMatch.classList.add('disabled');
        btnStartMatch.classList.remove('btn-start-pulse');
        btnStartMatch.textContent = (window.SANDAI.p1Ready && window.SANDAI.p2Ready) ? 'WAITING FOR HOST TO START...' : 'HOST LAUNCHES MATCH';
      }
    }

    if (readyStatus) {
      if (!isGuestConnected) {
        readyStatus.textContent = 'Share the 6-character room code with your opponent.';
        readyStatus.style.color = '#00ddff';
      } else if (window.SANDAI.p1Ready && window.SANDAI.p2Ready) {
        if (window.SANDAI.playerNumber === 1) {
          readyStatus.textContent = 'Both combatants ready! Click START MATCH to enter battle.';
          readyStatus.style.color = '#00ff88';
        } else {
          readyStatus.textContent = 'Both combatants ready! Waiting for Host to launch match...';
          readyStatus.style.color = '#00e5ff';
        }
      } else {
        readyStatus.textContent = 'Both players must select a fighter and confirm ready.';
        readyStatus.style.color = '';
      }
    }
  }
  window.SANDAI.updateLobbyUI = updateLobbyUI;

  // ── Setup Lobby Screen Events ────────────────────────────────
  function setupLobbyScreen() {
    var lobbyBack = document.getElementById('lobby-back');
    if (lobbyBack) {
      lobbyBack.addEventListener('click', function () {
        if (window.SANDAI.socket && window.SANDAI.roomCode) {
          window.SANDAI.socket.emit('leave-room', { roomCode: window.SANDAI.roomCode });
        }
        window.SANDAI.roomCode = null;
        window.SANDAI.guestConnected = false;
        window.SANDAI.p1Ready = false;
        window.SANDAI.p2Ready = false;
        updateLobbyUI();
        showScreen('screen-mode');
      });
    }

    // ── Tab Switching: Create Room vs Join Room ──
    var lobbyTabs = document.querySelectorAll('.lobby-tab');
    var panelCreate = document.getElementById('panel-create');
    var panelJoin = document.getElementById('panel-join');
    lobbyTabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        lobbyTabs.forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        var target = tab.getAttribute('data-tab');
        if (target === 'join') {
          if (panelCreate) panelCreate.classList.remove('active');
          if (panelJoin) {
            panelJoin.classList.add('active');
            var input = document.getElementById('input-room-code');
            if (input) setTimeout(function () { input.focus(); }, 120);
          }
        } else {
          if (panelJoin) panelJoin.classList.remove('active');
          if (panelCreate) panelCreate.classList.add('active');
        }
      });
    });

    // ── Create Room Button ──
    var btnCreate = document.getElementById('btn-create-room');
    if (btnCreate) {
      btnCreate.addEventListener('click', function () {
        if (!window.SANDAI.socket || !window.SANDAI.socket.connected) {
          initSocketMultiplayer();
          var statusText = document.querySelector('#connection-status .status-text');
          if (statusText) statusText.textContent = 'Connecting to server...';
          btnCreate.disabled = true;
          btnCreate.textContent = 'CONNECTING... ⏳';
          var waited = 0;
          var checkConn = setInterval(function () {
            waited += 250;
            if (window.SANDAI.socket && window.SANDAI.socket.connected) {
              clearInterval(checkConn);
              btnCreate.disabled = false;
              btnCreate.textContent = 'CREATE NEW ROOM';
              btnCreate.click();
            } else if (waited >= 5000) {
              clearInterval(checkConn);
              btnCreate.disabled = false;
              btnCreate.textContent = 'CREATE NEW ROOM';
              alert('Could not establish connection to the multiplayer server. Please verify your connection or use the ⚙ Server settings.');
            }
          }, 250);
          return;
        }

        btnCreate.disabled = true;
        btnCreate.textContent = 'CREATING ROOM... ⏳';

        var initialChar = (window.SANDAI.player1Character !== undefined && window.SANDAI.player1Character !== null)
          ? window.SANDAI.player1Character : 0;

        window.SANDAI.socket.emit('create-room', {
          characterId: initialChar
        }, function (res) {
          btnCreate.disabled = false;
          btnCreate.textContent = 'CREATE NEW ROOM';
          if (res && res.error) {
            alert('Error creating room: ' + res.error);
          } else if (res && res.code) {
            window.SANDAI.roomCode = res.code;
            window.SANDAI.playerNumber = 1;
            window.SANDAI.guestConnected = false;
            window.SANDAI.selectedArena = res.arena || 'mountain';
            window.SANDAI.p1Ready = false;
            window.SANDAI.p2Ready = false;
            updateLobbyUI();
          }
        });
      });
    }

    // ── Join Room Button & Enter Key ──
    var btnJoin = document.getElementById('btn-join-room');
    var inputCode = document.getElementById('input-room-code');
    var feedbackEl = document.getElementById('join-feedback');

    function doJoinRoom() {
      if (!inputCode) return;
      var code = (inputCode.value || '').trim().toUpperCase();
      if (!code || code.length !== 6) {
        if (feedbackEl) {
          feedbackEl.textContent = 'Please enter a valid 6-character room code (e.g. ABC123).';
          feedbackEl.className = 'join-feedback error';
          feedbackEl.classList.remove('hidden');
        }
        return;
      }

      if (!window.SANDAI.socket || !window.SANDAI.socket.connected) {
        initSocketMultiplayer();
        if (feedbackEl) {
          feedbackEl.textContent = 'Connecting to server, please wait a moment...';
          feedbackEl.className = 'join-feedback';
          feedbackEl.classList.remove('hidden');
        }
        return;
      }

      if (btnJoin) {
        btnJoin.disabled = true;
        btnJoin.textContent = 'JOINING... ⏳';
      }
      if (feedbackEl) feedbackEl.classList.add('hidden');

      var initialChar = (window.SANDAI.player2Character !== undefined && window.SANDAI.player2Character !== null)
        ? window.SANDAI.player2Character : 1;

      window.SANDAI.socket.emit('join-room', {
        code: code,
        characterId: initialChar
      }, function (res) {
        if (btnJoin) {
          btnJoin.disabled = false;
          btnJoin.textContent = 'JOIN ROOM';
        }
        if (res && res.error) {
          if (feedbackEl) {
            feedbackEl.textContent = res.error;
            feedbackEl.className = 'join-feedback error';
            feedbackEl.classList.remove('hidden');
          }
        } else if (res && res.code) {
          window.SANDAI.roomCode = res.code;
          window.SANDAI.playerNumber = 2;
          window.SANDAI.guestConnected = true;
          window.SANDAI.selectedArena = res.arena || 'mountain';
          updateLobbyUI();
        }
      });
    }

    if (btnJoin) {
      btnJoin.addEventListener('click', doJoinRoom);
    }
    if (inputCode) {
      inputCode.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          doJoinRoom();
        }
      });
    }

    // ── Copy Room Code & Share Invite Link ──
    var btnCopyCode = document.getElementById('btn-copy-code');
    if (btnCopyCode) {
      btnCopyCode.addEventListener('click', function () {
        if (window.SANDAI.roomCode) {
          copyToClipboard(window.SANDAI.roomCode, 'Room code copied to clipboard: ' + window.SANDAI.roomCode);
        }
      });
    }

    var btnCopyLink = document.getElementById('btn-copy-link');
    if (btnCopyLink) {
      btnCopyLink.addEventListener('click', function () {
        if (window.SANDAI.roomCode) {
          var inviteUrl = window.location.origin + window.location.pathname + '?room=' + window.SANDAI.roomCode;
          if (navigator.share && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)) {
            navigator.share({
              title: 'Join SANDAI Online Fight',
              text: 'Fight me in SANDAI! Room code: ' + window.SANDAI.roomCode,
              url: inviteUrl
            }).catch(function () {
              copyToClipboard(inviteUrl, 'Invite link copied to clipboard!');
            });
          } else {
            copyToClipboard(inviteUrl, 'Invite link copied to clipboard!');
          }
        }
      });
    }

    // ── Leave Room Button ──
    var btnLeave = document.getElementById('btn-leave-room');
    if (btnLeave) {
      btnLeave.addEventListener('click', function () {
        if (window.SANDAI.socket && window.SANDAI.roomCode) {
          window.SANDAI.socket.emit('leave-room', { roomCode: window.SANDAI.roomCode });
        }
        window.SANDAI.roomCode = null;
        window.SANDAI.guestConnected = false;
        window.SANDAI.p1Ready = false;
        window.SANDAI.p2Ready = false;
        updateLobbyUI();
      });
    }

    // ── Fighter Change Buttons in Lobby ──
    var btnChangeP1 = document.getElementById('btn-change-char-p1');
    if (btnChangeP1) {
      btnChangeP1.addEventListener('click', function () {
        if (window.SANDAI.playerNumber === 1) {
          startCharacterSelection(1);
        }
      });
    }

    var btnChangeP2 = document.getElementById('btn-change-char-p2');
    if (btnChangeP2) {
      btnChangeP2.addEventListener('click', function () {
        if (window.SANDAI.playerNumber === 2) {
          startCharacterSelection(2);
        }
      });
    }

    // ── Arena Selection Cards in Lobby (Host Only) ──
    var lobbyArenaCards = document.querySelectorAll('.lobby-arena-card');
    lobbyArenaCards.forEach(function (card) {
      card.addEventListener('click', function () {
        if (window.SANDAI.playerNumber !== 1) return; // Only host chooses arena
        var arena = card.getAttribute('data-arena');
        if (arena && window.SANDAI.socket && window.SANDAI.roomCode) {
          window.SANDAI.selectedArena = arena;
          window.SANDAI.p1Ready = false;
          window.SANDAI.p2Ready = false;
          window.SANDAI.socket.emit('select-arena', {
            roomCode: window.SANDAI.roomCode,
            arena: arena
          });
          updateLobbyUI();
        }
      });
    });

    // ── Ready Button ──
    var btnReady = document.getElementById('btn-ready');
    if (btnReady) {
      btnReady.addEventListener('click', function () {
        if (!window.SANDAI.socket || !window.SANDAI.roomCode) return;
        var isHost = (window.SANDAI.playerNumber === 1);
        var currentReady = isHost ? window.SANDAI.p1Ready : window.SANDAI.p2Ready;
        var nextReady = !currentReady;
        if (isHost) window.SANDAI.p1Ready = nextReady;
        else window.SANDAI.p2Ready = nextReady;
        updateLobbyUI();
        window.SANDAI.socket.emit('player-ready', {
          roomCode: window.SANDAI.roomCode,
          ready: nextReady,
          autoStart: false
        });
      });
    }

    // ── Start Match Button (Host Only) ──
    var btnStartMatch = document.getElementById('btn-start-match');
    if (btnStartMatch) {
      btnStartMatch.addEventListener('click', function () {
        if (window.SANDAI.playerNumber !== 1) return; // Host only
        if (!window.SANDAI.guestConnected || !window.SANDAI.p1Ready || !window.SANDAI.p2Ready) {
          return;
        }
        if (window.SANDAI.socket && window.SANDAI.roomCode) {
          btnStartMatch.disabled = true;
          btnStartMatch.textContent = 'LAUNCHING... ⚔';
          window.SANDAI.socket.emit('start-match', {
            roomCode: window.SANDAI.roomCode
          }, function (ack) {
            if (ack && ack.error) {
              btnStartMatch.disabled = false;
              updateLobbyUI();
              var readyStatus = document.getElementById('ready-status');
              if (readyStatus) {
                readyStatus.textContent = ack.error;
                readyStatus.style.color = '#ff3344';
              }
            }
          });
        }
      });
    }

    // Server Configuration Modal Wiring
    var btnConfigServer = document.getElementById('btn-config-server');
    var modalServer = document.getElementById('modal-server-config');
    var btnCloseServer = document.getElementById('btn-close-server-modal');
    var inputServerUrl = document.getElementById('input-server-url');
    var btnTestServer = document.getElementById('btn-test-server');
    var serverTestResult = document.getElementById('server-test-result');
    var serverTestText = document.getElementById('server-test-text');
    var btnSaveServer = document.getElementById('btn-save-server');
    var btnResetServer = document.getElementById('btn-reset-server');

    var presetRender = document.getElementById('preset-render');
    var presetLocal = document.getElementById('preset-localhost');
    var presetCurrent = document.getElementById('preset-current');

    if (btnConfigServer && modalServer) {
      btnConfigServer.addEventListener('click', function () {
        if (inputServerUrl) {
          inputServerUrl.value = resolveServerUrl();
        }
        if (serverTestResult) {
          serverTestResult.className = 'server-test-result';
          if (serverTestText) serverTestText.textContent = 'Ready to test';
        }
        modalServer.classList.remove('hidden');
      });
    }

    if (btnCloseServer && modalServer) {
      btnCloseServer.addEventListener('click', function () {
        modalServer.classList.add('hidden');
      });
    }

    if (presetRender && inputServerUrl) {
      presetRender.addEventListener('click', function () {
        inputServerUrl.value = 'https://sandai-backend.onrender.com';
      });
    }

    if (presetLocal && inputServerUrl) {
      presetLocal.addEventListener('click', function () {
        inputServerUrl.value = 'http://localhost:3000';
      });
    }

    if (presetCurrent && inputServerUrl) {
      presetCurrent.addEventListener('click', function () {
        inputServerUrl.value = window.location.origin.replace(/\/$/, '');
      });
    }

    if (btnTestServer && inputServerUrl) {
      btnTestServer.addEventListener('click', function () {
        var targetUrl = inputServerUrl.value.trim().replace(/\/$/, '');
        if (!targetUrl) return;

        if (serverTestResult) serverTestResult.className = 'server-test-result testing';
        if (serverTestText) serverTestText.textContent = 'Testing connection...';

        var startT = Date.now();
        var controller = new AbortController();
        var timeoutId = setTimeout(function () { controller.abort(); }, 6000);

        fetch(targetUrl + '/health', { signal: controller.signal, mode: 'cors' })
          .then(function (res) {
            clearTimeout(timeoutId);
            if (res.ok) {
              var rtt = Date.now() - startT;
              if (serverTestResult) serverTestResult.className = 'server-test-result ok';
              if (serverTestText) serverTestText.textContent = 'Connected (' + rtt + 'ms) ✓';
            } else {
              if (serverTestResult) serverTestResult.className = 'server-test-result fail';
              if (serverTestText) serverTestText.textContent = 'HTTP ' + res.status + ' Error';
            }
          })
          .catch(function (err) {
            clearTimeout(timeoutId);
            if (serverTestResult) serverTestResult.className = 'server-test-result fail';
            if (serverTestText) {
              serverTestText.textContent = 'Connection failed (server sleeping or unreachable)';
            }
          });
      });
    }

    if (btnSaveServer && inputServerUrl && modalServer) {
      btnSaveServer.addEventListener('click', function () {
        var newUrl = inputServerUrl.value.trim().replace(/\/$/, '');
        if (newUrl) {
          localStorage.setItem('sandai_server_url', newUrl);
          window.SANDAI_SERVER_URL = newUrl;
        }
        modalServer.classList.add('hidden');
        if (window.SANDAI.socket) {
          window.SANDAI.socket.disconnect();
          window.SANDAI.socket = null;
        }
        initSocketMultiplayer();
      });
    }

    if (btnResetServer && inputServerUrl) {
      btnResetServer.addEventListener('click', function () {
        localStorage.removeItem('sandai_server_url');
        window.SANDAI_SERVER_URL = null;
        inputServerUrl.value = resolveServerUrl();
        if (serverTestText) serverTestText.textContent = 'Reset to default';
      });
    }

    // In-Game Disconnect Leave Button
    var btnDiscLeave = document.getElementById('btn-disconnect-leave');
    if (btnDiscLeave) {
      btnDiscLeave.addEventListener('click', function () {
        var overlay = document.getElementById('disconnect-overlay');
        if (overlay) overlay.classList.add('hidden');
        if (window.SANDAI.socket && window.SANDAI.roomCode) {
          window.SANDAI.socket.emit('leave-room', { roomCode: window.SANDAI.roomCode });
        }
        window.SANDAI.roomCode = null;
        showScreen('screen-home');
      });
    }
  }

  function showCopyToast(msg) {
    var toast = document.getElementById('copy-toast');
    if (toast) {
      toast.textContent = msg;
      toast.classList.remove('hidden');
      setTimeout(function () {
        toast.classList.add('hidden');
      }, 2500);
    }
  }

  // ── Winner Screen ────────────────────────────────────────────
  function setupWinnerScreen() {
    var btnRematch = document.getElementById('btn-rematch');
    var btnCharSelect = document.getElementById('btn-charselect');
    var btnMainMenu = document.getElementById('btn-mainmenu');

    if (btnRematch) {
      btnRematch.addEventListener('click', function () {
        if (window.SANDAI.gameMode === 'online') {
          if (window.SANDAI.socket && window.SANDAI.roomCode) {
            btnRematch.textContent = 'REMATCH REQUESTED...';
            var statusEl = document.getElementById('rematch-status');
            if (statusEl) {
              statusEl.textContent = 'Waiting for opponent to accept rematch...';
              statusEl.classList.remove('hidden');
            }
            window.SANDAI.socket.emit('request-rematch', { roomCode: window.SANDAI.roomCode });
          }
        } else {
          onFightTriggered();
        }
      });
    }

    if (btnCharSelect) {
      btnCharSelect.addEventListener('click', function () {
        if (window.SANDAI.gameMode === 'online') {
          showScreen('screen-lobby');
        } else {
          startCharacterSelection();
        }
      });
    }

    if (btnMainMenu) {
      btnMainMenu.addEventListener('click', function () {
        if (window.SANDAI.socket && window.SANDAI.roomCode) {
          window.SANDAI.socket.emit('leave-room', { roomCode: window.SANDAI.roomCode });
          window.SANDAI.roomCode = null;
        }
        showScreen('screen-home');
      });
    }

    // Connect Match Complete Callback from game engine
    window.SANDAI.onMatchComplete = function (data) {
      var winnerChar = data.winnerCharacter || window.SANDAI.CHARACTERS[0];
      var portrait = document.getElementById('winner-portrait');
      var name = document.getElementById('winner-name');
      var stats = document.getElementById('match-stats');
      var statusEl = document.getElementById('rematch-status');
      var btnRem = document.getElementById('btn-rematch');

      if (btnRem) {
        btnRem.textContent = 'REMATCH';
        btnRem.classList.remove('pulse-glow');
      }
      if (statusEl) {
        statusEl.classList.add('hidden');
        statusEl.textContent = '';
      }

      if (portrait) portrait.src = 'assets/characters/' + winnerChar.portraitFile;
      if (name) name.textContent = winnerChar.name.toUpperCase();

      if (stats) {
        stats.innerHTML =
          '<div class="stat-item"><span class="stat-value">' + data.p1RoundWins + '</span><span class="stat-label-text">P1 Rounds</span></div>' +
          '<div class="stat-item"><span class="stat-value">' + data.p2RoundWins + '</span><span class="stat-label-text">P2 Rounds</span></div>' +
          '<div class="stat-item"><span class="stat-value">' + (data.winner === 1 ? data.p1Health : data.p2Health) + '%</span><span class="stat-label-text">Winner HP</span></div>';
      }

      showScreen('screen-winner');
    };
  }

  // ── In-Game Controls (Pause, Training Overlay, Move List) ───
  function setupGameControls() {
    var btnPause = document.getElementById('btn-pause');
    if (btnPause) {
      btnPause.addEventListener('click', function () {
        window.SANDAI.isPaused = !window.SANDAI.isPaused;
        btnPause.textContent = window.SANDAI.isPaused ? '▶' : '❚❚';
      });
    }

    // Training Mode Overlay: Dummy AI Behavior Selector
    var dummyButtons = document.querySelectorAll('#training-dummy-group .btn-training-opt');
    dummyButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        dummyButtons.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        var dMode = btn.getAttribute('data-dummy') || 'stand';
        window.SANDAI.trainingDummyMode = dMode;
        if (window.SANDAI.activeFightScene) {
          window.SANDAI.activeFightScene.dummyMode = dMode;
        }
      });
    });

    // Training Mode Overlay: Reset Position Button
    var btnResetTraining = document.getElementById('btn-reset-training');
    if (btnResetTraining) {
      btnResetTraining.addEventListener('click', function () {
        if (window.SANDAI.activeFightScene && window.SANDAI.activeFightScene.resetTrainingPositions) {
          window.SANDAI.activeFightScene.resetTrainingPositions();
        }
      });
    }

    // Move List Modal
    var modalMovelist = document.getElementById('modal-movelist');
    var btnOpenMovelist = document.getElementById('btn-open-movelist');
    var btnCloseMovelist = document.getElementById('btn-close-movelist');

    if (btnOpenMovelist) {
      btnOpenMovelist.addEventListener('click', function () {
        populateMoveList();
        if (modalMovelist) modalMovelist.classList.remove('hidden');
      });
    }

    if (btnCloseMovelist) {
      btnCloseMovelist.addEventListener('click', function () {
        if (modalMovelist) modalMovelist.classList.add('hidden');
      });
    }
  }

  function populateMoveList() {
    var chars = window.SANDAI.CHARACTERS || [];
    var p1Id = window.SANDAI.player1Character !== undefined ? window.SANDAI.player1Character : 0;
    var c = chars[p1Id] || chars[0];

    var titleEl = document.getElementById('movelist-char-name');
    var styleEl = document.getElementById('movelist-char-style');
    var normalsTable = document.getElementById('movelist-normals');
    var specialsTable = document.getElementById('movelist-specials');

    if (titleEl) titleEl.textContent = c.name.toUpperCase();
    if (styleEl) styleEl.textContent = c.style + ' • ' + (c.archetype || 'Fighter');

    var normals = [
      { name: 'Light Punch (Fast Jab)', inputP1: 'J', inputP2: '1', damage: '8 DMG', frames: '3f Startup • Active 3-8f', desc: 'Quick jab to interrupt incoming enemy startups and start combo chains.' },
      { name: 'Martial Arts Kick (Front/Side)', inputP1: 'K', inputP2: '2', damage: '14 DMG', frames: '5f Startup • Active 6-15f', desc: 'Thrusting martial arts kick. High guard damage, pushes back on block.' },
      { name: 'Aerial Downward Strike', inputP1: 'W + J', inputP2: '▲ + 1', damage: '10 DMG', frames: 'Mid-Air Fist Attack', desc: 'Descending mid-air strike that spikes airborne opponents downwards.' },
      { name: 'Aerial Dive Kick', inputP1: 'W + K', inputP2: '▲ + 2', damage: '13 DMG', frames: 'Mid-Air Heavy Kick', desc: 'Downward diving flying kick covering swift horizontal ground distance.' },
      { name: 'Tactical Guard (Block)', inputP1: 'S', inputP2: '▼', damage: '70% Guard', frames: 'Instant Activation', desc: 'Reduces incoming attack damage by 70%. Gradually drains blue guard stamina.' }
    ];

    if (normalsTable) {
      normalsTable.innerHTML = normals.map(function (m) {
        return '<div class="movelist-row">' +
          '<div class="move-name-col"><strong>' + m.name + '</strong><span>' + m.desc + '</span></div>' +
          '<div class="move-input-col"><span class="key-cap sm">' + m.inputP1 + '</span><span class="key-sub">P1</span> / <span class="key-cap sm">' + m.inputP2 + '</span><span class="key-sub">P2</span></div>' +
          '<div class="move-stat-col"><span class="badge-dmg">' + m.damage + '</span><span class="badge-frame">' + m.frames + '</span></div>' +
        '</div>';
      }).join('');
    }

    var specials = [
      {
        name: c.abilityName || 'Elemental Blast',
        inputP1: 'L',
        inputP2: '3',
        cost: '50% SUPER METER',
        damage: '24 DMG',
        frames: '12f Startup • Volumetric Hitbox',
        desc: c.abilityDesc || 'Channels martial combat power into a devastating elemental blast.'
      }
    ];

    if (specialsTable) {
      specialsTable.innerHTML = specials.map(function (s) {
        return '<div class="movelist-row special-row">' +
          '<div class="move-name-col"><strong>' + s.name + '</strong><span>' + s.desc + '</span></div>' +
          '<div class="move-input-col"><span class="key-cap sm special">' + s.inputP1 + '</span> / <span class="key-cap sm special">' + s.inputP2 + '</span></div>' +
          '<div class="move-stat-col"><span class="badge-meter">' + s.cost + '</span><span class="badge-dmg highlight">' + s.damage + '</span><span class="badge-frame">' + s.frames + '</span></div>' +
        '</div>';
      }).join('');
    }
  }

})();
