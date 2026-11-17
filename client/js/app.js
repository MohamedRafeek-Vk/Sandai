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
  window.SANDAI.player1Character = 0;     // ID 0-7
  window.SANDAI.player2Character = 1;     // ID 0-7
  window.SANDAI.socket = null;            // Socket.IO client instance
  window.SANDAI.roomCode = null;          // Active multiplayer room code
  window.SANDAI.playerNumber = 1;         // 1 (host) or 2 (guest)
  window.SANDAI.currentScreen = 'home';
  window.SANDAI.isPaused = false;

  var currentSelectionStep = 1; // 1: P1 selecting, 2: P2 selecting

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
    setupControlsGuideScreen();
    setupLobbyScreen();
    setupWinnerScreen();
    setupGameControls();
    createBackgroundEmbers();
  });

  // ── Home Screen ──────────────────────────────────────────────
  function setupHomeScreen() {
    var btnEnter = document.getElementById('btn-enter');
    if (btnEnter) {
      btnEnter.addEventListener('click', function () {
        showScreen('screen-device');
      });
    }
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
      var isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
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

  // ── Character Selection Screen ───────────────────────────────
  function setupCharacterSelectScreen() {
    var backBtn = document.getElementById('charselect-back');
    if (backBtn) {
      backBtn.addEventListener('click', function () {
        if (window.SANDAI.gameMode === 'online') {
          showScreen('screen-lobby');
        } else {
          showScreen('screen-mode');
        }
      });
    }

    var btnFight = document.getElementById('btn-fight');
    if (btnFight) {
      btnFight.addEventListener('click', function () {
        onFightTriggered();
      });
    }
  }

  function startCharacterSelection() {
    currentSelectionStep = 1;
    var mode = window.SANDAI.gameMode;
    var promptEl = document.getElementById('select-prompt');
    var btnFight = document.getElementById('btn-fight');

    if (btnFight) btnFight.classList.add('hidden');

    if (mode === 'local') {
      if (promptEl) promptEl.textContent = 'PLAYER 1 — CHOOSE YOUR FIGHTER';
    } else if (mode === 'ai') {
      if (promptEl) promptEl.textContent = 'CHOOSE YOUR FIGHTER';
    } else {
      if (promptEl) promptEl.textContent = 'SELECT YOUR FIGHTER';
    }

    renderCharacterGrid();
    updatePreview(1, window.SANDAI.player1Character);
    updatePreview(2, window.SANDAI.player2Character);
    showScreen('screen-character-select');
  }

  function renderCharacterGrid() {
    var grid = document.getElementById('char-grid');
    if (!grid) return;
    grid.innerHTML = '';

    var chars = window.SANDAI.CHARACTERS || [];
    chars.forEach(function (c) {
      var card = document.createElement('div');
      card.className = 'char-card';
      card.dataset.id = c.id;

      if (window.SANDAI.player1Character === c.id) {
        card.classList.add('selected-p1');
      }
      if (window.SANDAI.player2Character === c.id) {
        card.classList.add('selected-p2');
      }

      card.innerHTML =
        '<img class="char-portrait" src="assets/characters/' + c.portraitFile + '" alt="' + c.name + '">' +
        '<div class="char-name">' + c.name.toUpperCase() + '</div>' +
        '<div class="char-style">' + c.style + '</div>' +
        '<div class="stat-bars">' +
          '<div class="stat-row"><span class="stat-label">PWR</span><div class="stat-bar-bg"><div class="stat-bar-fill power" style="width:' + (c.power * 10) + '%;"></div></div></div>' +
          '<div class="stat-row"><span class="stat-label">SPD</span><div class="stat-bar-bg"><div class="stat-bar-fill speed" style="width:' + (c.speed * 10) + '%;"></div></div></div>' +
          '<div class="stat-row"><span class="stat-label">DEF</span><div class="stat-bar-bg"><div class="stat-bar-fill defense" style="width:' + (c.defense * 10) + '%;"></div></div></div>' +
        '</div>';

      card.addEventListener('click', function () {
        handleCharacterPick(c.id);
      });

      grid.appendChild(card);
    });
  }

  function handleCharacterPick(charId) {
    var mode = window.SANDAI.gameMode;
    var promptEl = document.getElementById('select-prompt');
    var btnFight = document.getElementById('btn-fight');

    if (mode === 'ai') {
      window.SANDAI.player1Character = charId;
      var available = [0, 1, 2, 3, 4, 5, 6, 7].filter(function (id) { return id !== charId; });
      var aiCharId = available[Math.floor(Math.random() * available.length)];
      window.SANDAI.player2Character = aiCharId;

      updatePreview(1, charId);
      updatePreview(2, aiCharId);
      renderCharacterGrid();

      if (btnFight) btnFight.classList.remove('hidden');
    } else if (mode === 'local') {
      if (currentSelectionStep === 1) {
        window.SANDAI.player1Character = charId;
        updatePreview(1, charId);
        currentSelectionStep = 2;
        if (promptEl) promptEl.textContent = 'PLAYER 2 — CHOOSE YOUR FIGHTER';
        renderCharacterGrid();
      } else {
        window.SANDAI.player2Character = charId;
        updatePreview(2, charId);
        renderCharacterGrid();
        if (promptEl) promptEl.textContent = 'READY TO FIGHT!';
        if (btnFight) btnFight.classList.remove('hidden');
      }
    } else if (mode === 'online') {
      if (window.SANDAI.playerNumber === 1) {
        window.SANDAI.player1Character = charId;
        updatePreview(1, charId);
      } else {
        window.SANDAI.player2Character = charId;
        updatePreview(2, charId);
      }
      renderCharacterGrid();

      if (window.SANDAI.socket && window.SANDAI.roomCode) {
        window.SANDAI.socket.emit('select-character', {
          roomCode: window.SANDAI.roomCode,
          characterId: charId
        });
      }
      showScreen('screen-lobby');
    }
  }

  function updatePreview(playerNum, charId) {
    var chars = window.SANDAI.CHARACTERS || [];
    var c = chars[charId] || chars[0];
    var prefix = playerNum === 1 ? 'preview-p1' : 'preview-p2';

    var container = document.getElementById(prefix);
    var img = document.getElementById(prefix + '-img');
    var name = document.getElementById(prefix + '-name');
    var style = document.getElementById(prefix + '-style');

    if (container) container.classList.add('visible');
    if (img) img.src = 'assets/characters/' + c.portraitFile;
    if (name) name.textContent = c.name.toUpperCase();
    if (style) style.textContent = c.style;
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
          showScreen('screen-character-select');
        }
      });
    }
  }

  // Entry point before fight: Check device type for controls guide
  function onFightTriggered() {
    if (window.SANDAI.deviceType === 'pc') {
      // Show PC Controls Guide before fight starts
      showScreen('screen-controls-guide');
    } else {
      // Mobile players skip the keyboard guide completely
      startMatchSequence();
    }
  }

  // ── VS Screen & Match Sequence ───────────────────────────────
  function startMatchSequence() {
    var chars = window.SANDAI.CHARACTERS || [];
    var c1 = chars[window.SANDAI.player1Character] || chars[0];
    var c2 = chars[window.SANDAI.player2Character] || chars[1];

    var vsP1Img = document.getElementById('vs-p1-img');
    var vsP1Name = document.getElementById('vs-p1-name');
    var vsP1Style = document.getElementById('vs-p1-style');

    var vsP2Img = document.getElementById('vs-p2-img');
    var vsP2Name = document.getElementById('vs-p2-name');
    var vsP2Style = document.getElementById('vs-p2-style');

    if (vsP1Img) vsP1Img.src = 'assets/characters/' + c1.portraitFile;
    if (vsP1Name) vsP1Name.textContent = c1.name.toUpperCase();
    if (vsP1Style) vsP1Style.textContent = c1.style;

    if (vsP2Img) vsP2Img.src = 'assets/characters/' + c2.portraitFile;
    if (vsP2Name) vsP2Name.textContent = c2.name.toUpperCase();
    if (vsP2Style) vsP2Style.textContent = c2.style;

    showScreen('screen-vs');

    // 2.8 Second Dramatic VS Screen Reveal
    setTimeout(function () {
      showScreen('screen-game');
      if (window.SANDAI.startGame) {
        window.SANDAI.startGame();
      }
    }, 2800);
  }

  // ── Online Multiplayer Lobby ─────────────────────────────────
  function initSocketMultiplayer() {
    var statusDot = document.querySelector('#connection-status .status-dot');
    var statusText = document.querySelector('#connection-status .status-text');

    if (window.SANDAI.socket && window.SANDAI.socket.connected) {
      return;
    }

    var serverUrl = window.SANDAI_SERVER_URL || localStorage.getItem('sandai_server_url') || window.location.origin;
    if (serverUrl.startsWith('file:') || serverUrl.includes('localhost:')) {
      serverUrl = 'http://localhost:3000';
    }

    try {
      window.SANDAI.socket = io(serverUrl, {
        transports: ['polling', 'websocket'],
        reconnectionAttempts: 5,
        timeout: 10000
      });
    } catch (e) {
      console.warn('Socket.IO init error:', e);
      return;
    }

    var socket = window.SANDAI.socket;

    socket.on('connect', function () {
      if (statusDot) statusDot.className = 'status-dot connected';
      if (statusText) statusText.textContent = 'Connected';
    });

    socket.on('connect_error', function () {
      if (statusDot) statusDot.className = 'status-dot disconnected';
      if (statusText) {
        if (window.location.hostname.includes('vercel.app') && !localStorage.getItem('sandai_server_url')) {
          statusText.textContent = 'Server Offline (Click ⚙ Server to connect Render backend)';
        } else {
          statusText.textContent = 'Server Offline';
        }
      }
    });

    socket.on('disconnect', function () {
      if (statusDot) statusDot.className = 'status-dot disconnected';
      if (statusText) statusText.textContent = 'Disconnected';
    });

    // Room created (Host)
    socket.on('room-created', function (data) {
      window.SANDAI.roomCode = data.code;
      window.SANDAI.playerNumber = 1;

      var roomInfo = document.getElementById('room-info');
      var codeDisplay = document.getElementById('room-code-display');
      if (roomInfo) roomInfo.classList.remove('hidden');
      if (codeDisplay) codeDisplay.textContent = data.code;
    });

    // Room joined (Guest)
    socket.on('room-joined', function (data) {
      window.SANDAI.roomCode = data.code;
      window.SANDAI.playerNumber = 2;
      showLobbyConnected();
    });

    // Opponent joined (Host view)
    socket.on('player-joined', function () {
      showLobbyConnected();
    });

    // Character selected sync
    socket.on('character-selected', function (data) {
      var chars = window.SANDAI.CHARACTERS || [];
      var c = chars[data.characterId] || chars[0];
      if (data.playerIndex === 0) {
        window.SANDAI.player1Character = data.characterId;
        var p1El = document.getElementById('lobby-char-p1');
        if (p1El) p1El.textContent = c.name + ' (' + c.style + ')';
      } else {
        window.SANDAI.player2Character = data.characterId;
        var p2El = document.getElementById('lobby-char-p2');
        if (p2El) p2El.textContent = c.name + ' (' + c.style + ')';
      }
    });

    // Ready status sync
    socket.on('player-ready-ack', function (data) {
      var statusEl = document.getElementById('ready-status');
      if (statusEl) {
        statusEl.textContent = 'Player ' + (data.playerIndex + 1) + ' is Ready!';
      }
    });

    // Both ready → Trigger Match Sequence
    socket.on('match-start', function (data) {
      if (data && data.players) {
        window.SANDAI.player1Character = data.players[0].characterId !== null ? data.players[0].characterId : 0;
        window.SANDAI.player2Character = data.players[1].characterId !== null ? data.players[1].characterId : 1;
      }
      onFightTriggered();
    });

    socket.on('error-message', function (data) {
      var feedback = document.getElementById('join-feedback');
      if (feedback) {
        feedback.textContent = data.error || 'Room error';
        feedback.classList.remove('hidden');
        feedback.className = 'join-feedback error';
      }
    });
  }

  function setupLobbyScreen() {
    var lobbyBack = document.getElementById('lobby-back');
    if (lobbyBack) {
      lobbyBack.addEventListener('click', function () {
        if (window.SANDAI.socket && window.SANDAI.roomCode) {
          window.SANDAI.socket.emit('leave-room', { roomCode: window.SANDAI.roomCode });
        }
        window.SANDAI.roomCode = null;
        showScreen('screen-mode');
      });
    }

    // Configure Backend Server URL
    var btnConfigServer = document.getElementById('btn-config-server');
    if (btnConfigServer) {
      btnConfigServer.addEventListener('click', function () {
        var currentUrl = window.SANDAI_SERVER_URL || localStorage.getItem('sandai_server_url') || (window.location.hostname.includes('localhost') ? 'http://localhost:3000' : window.location.origin);
        var input = prompt('Enter your Multiplayer Backend Server URL (e.g. https://your-backend.onrender.com):', currentUrl);
        if (input !== null) {
          input = input.trim();
          if (input) {
            localStorage.setItem('sandai_server_url', input);
            window.SANDAI_SERVER_URL = input;
            alert('Backend server set to: ' + input + '\nReconnecting...');
            if (window.SANDAI.socket) {
              window.SANDAI.socket.disconnect();
              window.SANDAI.socket = null;
            }
            initSocketMultiplayer();
          } else {
            localStorage.removeItem('sandai_server_url');
            window.SANDAI_SERVER_URL = null;
            alert('Reset to default server URL.');
            if (window.SANDAI.socket) {
              window.SANDAI.socket.disconnect();
              window.SANDAI.socket = null;
            }
            initSocketMultiplayer();
          }
        }
      });
    }

    // Tabs
    var tabs = document.querySelectorAll('.lobby-tab');
    var panelCreate = document.getElementById('panel-create');
    var panelJoin = document.getElementById('panel-join');

    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        if (tab.dataset.tab === 'create') {
          if (panelCreate) panelCreate.classList.add('active');
          if (panelJoin) panelJoin.classList.remove('active');
        } else {
          if (panelCreate) panelCreate.classList.remove('active');
          if (panelJoin) panelJoin.classList.add('active');
        }
      });
    });

    // Create Room Button
    var btnCreate = document.getElementById('btn-create-room');
    if (btnCreate) {
      btnCreate.addEventListener('click', function () {
        if (window.SANDAI.socket) {
          window.SANDAI.socket.emit('create-room');
        }
      });
    }

    // Copy Code Button
    var btnCopy = document.getElementById('btn-copy-code');
    if (btnCopy) {
      btnCopy.addEventListener('click', function () {
        var code = document.getElementById('room-code-display').textContent;
        if (code && navigator.clipboard) {
          navigator.clipboard.writeText(code).then(function () {
            btnCopy.classList.add('copied');
            setTimeout(function () { btnCopy.classList.remove('copied'); }, 1500);
          });
        }
      });
    }

    // Join Room Button
    var btnJoin = document.getElementById('btn-join-room');
    var inputCode = document.getElementById('input-room-code');
    var joinFeedback = document.getElementById('join-feedback');

    if (btnJoin && inputCode) {
      btnJoin.addEventListener('click', function () {
        var code = inputCode.value.trim().toUpperCase();
        if (code.length < 6) {
          if (joinFeedback) {
            joinFeedback.textContent = 'Please enter a valid 6-character room code.';
            joinFeedback.className = 'join-feedback error';
            joinFeedback.classList.remove('hidden');
          }
          return;
        }
        if (window.SANDAI.socket) {
          window.SANDAI.socket.emit('join-room', { code: code });
        }
      });
    }

    // Lobby Character Pickers
    var charP1 = document.getElementById('lobby-char-p1');
    var charP2 = document.getElementById('lobby-char-p2');

    if (charP1) {
      charP1.addEventListener('click', function () {
        if (window.SANDAI.playerNumber === 1) startCharacterSelection();
      });
    }
    if (charP2) {
      charP2.addEventListener('click', function () {
        if (window.SANDAI.playerNumber === 2) startCharacterSelection();
      });
    }

    // Ready Button
    var btnReady = document.getElementById('btn-ready');
    if (btnReady) {
      btnReady.addEventListener('click', function () {
        btnReady.classList.add('active-ready');
        btnReady.textContent = 'READY!';
        if (window.SANDAI.socket && window.SANDAI.roomCode) {
          window.SANDAI.socket.emit('player-ready', { roomCode: window.SANDAI.roomCode });
        }
      });
    }
  }

  function showLobbyConnected() {
    var connectedPanel = document.getElementById('lobby-connected');
    var createPanel = document.getElementById('panel-create');
    var joinPanel = document.getElementById('panel-join');
    var tabs = document.querySelector('.lobby-tabs');

    if (connectedPanel) connectedPanel.classList.remove('hidden');
    if (createPanel) createPanel.classList.remove('active');
    if (joinPanel) joinPanel.classList.remove('active');
    if (tabs) tabs.classList.add('hidden');

    var chars = window.SANDAI.CHARACTERS || [];
    var c1 = chars[window.SANDAI.player1Character] || chars[0];
    var c2 = chars[window.SANDAI.player2Character] || chars[1];

    var p1El = document.getElementById('lobby-char-p1');
    var p2El = document.getElementById('lobby-char-p2');
    if (p1El) p1El.textContent = c1.name + ' (' + c1.style + ') [Click to change]';
    if (p2El) p2El.textContent = c2.name + ' (' + c2.style + ') [Click to change]';
  }

  // ── Winner Screen ────────────────────────────────────────────
  function setupWinnerScreen() {
    var btnRematch = document.getElementById('btn-rematch');
    var btnCharSelect = document.getElementById('btn-charselect');
    var btnMainMenu = document.getElementById('btn-mainmenu');

    if (btnRematch) {
      btnRematch.addEventListener('click', function () {
        onFightTriggered();
      });
    }

    if (btnCharSelect) {
      btnCharSelect.addEventListener('click', function () {
        startCharacterSelection();
      });
    }

    if (btnMainMenu) {
      btnMainMenu.addEventListener('click', function () {
        showScreen('screen-home');
      });
    }

    // Connect Match Complete Callback from game engine
    window.SANDAI.onMatchComplete = function (data) {
      var winnerChar = data.winnerCharacter || window.SANDAI.CHARACTERS[0];
      var portrait = document.getElementById('winner-portrait');
      var name = document.getElementById('winner-name');
      var stats = document.getElementById('match-stats');

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

  // ── In-Game Controls (Pause) ─────────────────────────────────
  function setupGameControls() {
    var btnPause = document.getElementById('btn-pause');
    if (btnPause) {
      btnPause.addEventListener('click', function () {
        window.SANDAI.isPaused = !window.SANDAI.isPaused;
        btnPause.textContent = window.SANDAI.isPaused ? '▶' : '❚❚';
      });
    }
  }

})();
