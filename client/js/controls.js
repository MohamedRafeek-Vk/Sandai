// ============================================================
// SANDAI — controls.js
// PC Keyboard and Mobile Touch Multi-Input Engine
// ============================================================

(function () {
  'use strict';

  window.SANDAI = window.SANDAI || {};

  // ── Input State ────────────────────────────────────────────
  var inputState = {
    p1: { left: false, right: false, jump: false, block: false, punch: false, kick: false, special: false },
    p2: { left: false, right: false, jump: false, block: false, punch: false, kick: false, special: false }
  };

  // Single-fire actions (cleared each frame after reading)
  var inputPressed = {
    p1: { punch: false, kick: false, special: false, jump: false },
    p2: { punch: false, kick: false, special: false, jump: false }
  };

  // ── PC Keyboard Mapping ────────────────────────────────────
  // Player 1:
  // A/D: Move | W: Jump | S: Block | J: Punch | K: Kick | L: Special
  var KEY_MAP_P1 = {
    'a': 'left', 'd': 'right', 'w': 'jump', 's': 'block',
    'j': 'punch', 'k': 'kick', 'l': 'special'
  };

  // Player 2:
  // Arrows: Move/Jump/Block | 1: Punch | 2: Kick | 3: Special (Supports top row & numpad)
  var KEY_MAP_P2 = {
    'arrowleft': 'left', 'arrowright': 'right', 'arrowup': 'jump', 'arrowdown': 'block',
    '1': 'punch', 'digit1': 'punch', 'numpad1': 'punch',
    '2': 'kick', 'digit2': 'kick', 'numpad2': 'kick',
    '3': 'special', 'digit3': 'special', 'numpad3': 'special'
  };

  var keysDown = {};

  // ── Keyboard Event Handlers ────────────────────────────────
  function onKeyDown(e) {
    var key = (e.key || '').toLowerCase();
    var code = (e.code || '').toLowerCase();
    var ident = code || key;

    if (keysDown[ident]) return;
    keysDown[ident] = true;

    // Player 1
    var actionP1 = KEY_MAP_P1[key] || KEY_MAP_P1[code];
    if (actionP1) {
      inputState.p1[actionP1] = true;
      if (actionP1 === 'punch' || actionP1 === 'kick' || actionP1 === 'special' || actionP1 === 'jump') {
        inputPressed.p1[actionP1] = true;
      }
    }

    // Player 2
    var actionP2 = KEY_MAP_P2[key] || KEY_MAP_P2[code];
    if (actionP2) {
      inputState.p2[actionP2] = true;
      if (actionP2 === 'punch' || actionP2 === 'kick' || actionP2 === 'special' || actionP2 === 'jump') {
        inputPressed.p2[actionP2] = true;
      }
    }

    if (actionP1 || actionP2) {
      e.preventDefault();
    }
  }

  function onKeyUp(e) {
    var key = (e.key || '').toLowerCase();
    var code = (e.code || '').toLowerCase();
    var ident = code || key;
    keysDown[ident] = false;

    var actionP1 = KEY_MAP_P1[key] || KEY_MAP_P1[code];
    if (actionP1) {
      inputState.p1[actionP1] = false;
    }
    var actionP2 = KEY_MAP_P2[key] || KEY_MAP_P2[code];
    if (actionP2) {
      inputState.p2[actionP2] = false;
    }
  }

  var keyboardActive = false;

  function initKeyboard() {
    if (keyboardActive) return;
    keyboardActive = true;
    window.addEventListener('keydown', onKeyDown, { capture: true });
    window.addEventListener('keyup', onKeyUp, { capture: true });
  }

  function destroyKeyboard() {
    if (!keyboardActive) return;
    keyboardActive = false;
    window.removeEventListener('keydown', onKeyDown, { capture: true });
    window.removeEventListener('keyup', onKeyUp, { capture: true });
    resetAllInputs();
  }

  // ── Reset Held Inputs On Focus Loss (Stage 4) ────────────────
  function resetAllInputs() {
    keysDown = {};
    touchIds = {};
    var actions = ['left', 'right', 'jump', 'block', 'punch', 'kick', 'special'];
    for (var i = 0; i < actions.length; i++) {
      inputState.p1[actions[i]] = false;
      inputState.p2[actions[i]] = false;
      if (inputPressed.p1[actions[i]] !== undefined) inputPressed.p1[actions[i]] = false;
      if (inputPressed.p2[actions[i]] !== undefined) inputPressed.p2[actions[i]] = false;
    }
    if (touchContainer) {
      var pressedBtns = touchContainer.querySelectorAll('.touch-pressed');
      pressedBtns.forEach(function (btn) { btn.classList.remove('touch-pressed'); });
    }
  }

  // Automatically reset held inputs when app loses focus or tab becomes inactive
  window.addEventListener('blur', resetAllInputs);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) resetAllInputs();
  });

  // ── Mobile Touch Multi-Touch Controls ───────────────────────
  var touchContainer = null;
  var touchActive = false;
  var touchIds = {}; // touch.identifier -> action

  function createTouchControls() {
    if (touchActive) return;
    if (window.SANDAI.deviceType === 'pc') return;
    touchActive = true;

    touchContainer = document.createElement('div');
    touchContainer.id = 'sandai-touch-controls';
    touchContainer.className = 'touch-controls-layer';

    // ── Left Side: Movement Buttons (◀ Left, ▶ Right) ─────────
    var leftPanel = document.createElement('div');
    leftPanel.className = 'touch-panel-left';

    var moveButtons = [
      { action: 'left',  label: '◀', cls: 'btn-touch-move' },
      { action: 'right', label: '▶', cls: 'btn-touch-move' }
    ];

    moveButtons.forEach(function (b) {
      var btn = document.createElement('button');
      btn.className = 'touch-btn ' + b.cls;
      btn.dataset.action = b.action;
      btn.textContent = b.label;
      btn.setAttribute('type', 'button');
      leftPanel.appendChild(btn);
    });

    touchContainer.appendChild(leftPanel);

    // ── Right Side: Action Buttons (Punch, Kick, Block, Jump, Special)
    var rightPanel = document.createElement('div');
    rightPanel.className = 'touch-panel-right';

    // Top Action Row: Jump (▲), Special (⚡)
    var topRow = document.createElement('div');
    topRow.className = 'touch-row-top';

    var btnJump = document.createElement('button');
    btnJump.className = 'touch-btn btn-touch-jump';
    btnJump.dataset.action = 'jump';
    btnJump.textContent = '▲';
    topRow.appendChild(btnJump);

    var btnSpecial = document.createElement('button');
    btnSpecial.className = 'touch-btn btn-touch-special';
    btnSpecial.dataset.action = 'special';
    btnSpecial.textContent = '⚡';
    topRow.appendChild(btnSpecial);

    rightPanel.appendChild(topRow);

    // Bottom Action Row: Block (🛡️), Punch (👊), Kick (🦶)
    var bottomRow = document.createElement('div');
    bottomRow.className = 'touch-row-bottom';

    var btnBlock = document.createElement('button');
    btnBlock.className = 'touch-btn btn-touch-block';
    btnBlock.dataset.action = 'block';
    btnBlock.textContent = '🛡️';
    bottomRow.appendChild(btnBlock);

    var btnPunch = document.createElement('button');
    btnPunch.className = 'touch-btn btn-touch-punch';
    btnPunch.dataset.action = 'punch';
    btnPunch.textContent = '👊';
    bottomRow.appendChild(btnPunch);

    var btnKick = document.createElement('button');
    btnKick.className = 'touch-btn btn-touch-kick';
    btnKick.dataset.action = 'kick';
    btnKick.textContent = '🦶';
    bottomRow.appendChild(btnKick);

    rightPanel.appendChild(bottomRow);
    touchContainer.appendChild(rightPanel);

    // ── Multi-Touch Touch Handlers ───────────────────────────
    touchContainer.addEventListener('touchstart', onTouchStart, { passive: false });
    touchContainer.addEventListener('touchmove', onTouchMove, { passive: false });
    touchContainer.addEventListener('touchend', onTouchEnd, { passive: false });
    touchContainer.addEventListener('touchcancel', onTouchEnd, { passive: false });

    // Mount to Game Arena
    var arena = document.getElementById('screen-game') || document.body;
    arena.appendChild(touchContainer);
  }

  function getButtonFromPoint(x, y) {
    var el = document.elementFromPoint(x, y);
    while (el && el !== touchContainer) {
      if (el.dataset && el.dataset.action) return el;
      el = el.parentElement;
    }
    return null;
  }

  function onTouchStart(e) {
    e.preventDefault();
    for (var i = 0; i < e.changedTouches.length; i++) {
      var touch = e.changedTouches[i];
      var btn = getButtonFromPoint(touch.clientX, touch.clientY);
      if (btn) {
        var action = btn.dataset.action;
        touchIds[touch.identifier] = action;
        inputState.p1[action] = true;
        if (action === 'punch' || action === 'kick' || action === 'special' || action === 'jump') {
          inputPressed.p1[action] = true;
          // Subtle haptic response on attack & jump
          try {
            if (navigator.vibrate) navigator.vibrate(15);
          } catch (vhErr) {}
        }
        btn.classList.add('touch-pressed');
      }
    }
  }

  function onTouchMove(e) {
    e.preventDefault();
    for (var i = 0; i < e.changedTouches.length; i++) {
      var touch = e.changedTouches[i];
      var btn = getButtonFromPoint(touch.clientX, touch.clientY);
      var prevAction = touchIds[touch.identifier];

      if (btn) {
        var newAction = btn.dataset.action;
        if (prevAction !== newAction) {
          if (prevAction) {
            inputState.p1[prevAction] = false;
            var prevBtn = touchContainer.querySelector('[data-action="' + prevAction + '"]');
            if (prevBtn) prevBtn.classList.remove('touch-pressed');
          }
          inputState.p1[newAction] = true;
          touchIds[touch.identifier] = newAction;
          btn.classList.add('touch-pressed');
        }
      } else {
        if (prevAction) {
          inputState.p1[prevAction] = false;
          var oldBtn = touchContainer.querySelector('[data-action="' + prevAction + '"]');
          if (oldBtn) oldBtn.classList.remove('touch-pressed');
          delete touchIds[touch.identifier];
        }
      }
    }
  }

  function onTouchEnd(e) {
    e.preventDefault();
    for (var i = 0; i < e.changedTouches.length; i++) {
      var touch = e.changedTouches[i];
      var action = touchIds[touch.identifier];
      if (action) {
        inputState.p1[action] = false;
        var btn = touchContainer.querySelector('[data-action="' + action + '"]');
        if (btn) btn.classList.remove('touch-pressed');
        delete touchIds[touch.identifier];
      }
    }
  }

  function destroyTouchControls() {
    if (!touchActive) return;
    touchActive = false;
    if (touchContainer) {
      touchContainer.removeEventListener('touchstart', onTouchStart);
      touchContainer.removeEventListener('touchmove', onTouchMove);
      touchContainer.removeEventListener('touchend', onTouchEnd);
      touchContainer.removeEventListener('touchcancel', onTouchEnd);
      if (touchContainer.parentNode) touchContainer.parentNode.removeChild(touchContainer);
      touchContainer = null;
    }
    touchIds = {};
  }

  // ── Public Input Readers ───────────────────────────────────
  function getP1Input() {
    return {
      left:    inputState.p1.left,
      right:   inputState.p1.right,
      jump:    inputPressed.p1.jump,
      block:   inputState.p1.block,
      punch:   inputPressed.p1.punch,
      kick:    inputPressed.p1.kick,
      special: inputPressed.p1.special
    };
  }

  function getP2Input() {
    return {
      left:    inputState.p2.left,
      right:   inputState.p2.right,
      jump:    inputPressed.p2.jump,
      block:   inputState.p2.block,
      punch:   inputPressed.p2.punch,
      kick:    inputPressed.p2.kick,
      special: inputPressed.p2.special
    };
  }

  function clearPressed() {
    inputPressed.p1.punch = false;
    inputPressed.p1.kick = false;
    inputPressed.p1.special = false;
    inputPressed.p1.jump = false;
    inputPressed.p2.punch = false;
    inputPressed.p2.kick = false;
    inputPressed.p2.special = false;
    inputPressed.p2.jump = false;
  }

  // ── Fullscreen API ───────────────────────────────────────────
  function toggleFullscreen() {
    var doc = window.document;
    var docEl = doc.documentElement;

    var isFS = doc.fullscreenElement || doc.mozFullScreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement;
    if (!isFS) {
      var req = docEl.requestFullscreen || docEl.mozRequestFullScreen || docEl.webkitRequestFullScreen || docEl.msRequestFullscreen;
      if (req) {
        req.call(docEl).catch(function () {});
      }
    } else {
      var exit = doc.exitFullscreen || doc.mozCancelFullScreen || doc.webkitExitFullscreen || doc.msExitFullscreen;
      if (exit) {
        exit.call(doc).catch(function () {});
      }
    }
  }

  // ── Landscape Orientation Helper ─────────────────────────────
  var rotateDismissed = false;

  function checkOrientation() {
    var promptEl = document.getElementById('landscape-prompt');
    if (!promptEl || rotateDismissed) return;

    var isMobile = (window.SANDAI.deviceType === 'mobile') || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    var isPortrait = window.innerHeight > window.innerWidth;

    if (isMobile && isPortrait) {
      promptEl.classList.remove('hidden');
    } else {
      promptEl.classList.add('hidden');
    }
  }

  function initMobileOptimizations() {
    // Check initial orientation
    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);

    var btnDismiss = document.getElementById('btn-dismiss-rotate');
    if (btnDismiss) {
      btnDismiss.addEventListener('click', function () {
        rotateDismissed = true;
        var promptEl = document.getElementById('landscape-prompt');
        if (promptEl) promptEl.classList.add('hidden');
      });
    }

    // Connect Fullscreen Button
    var btnFs = document.getElementById('btn-fullscreen');
    if (btnFs) {
      btnFs.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        toggleFullscreen();
      });
    }

    // Prevent accidental gesture navigation / zoom during fighting
    document.addEventListener('gesturestart', function (e) { e.preventDefault(); }, { passive: false });
    document.addEventListener('dblclick', function (e) {
      if (e.target && (e.target.closest('#screen-game') || e.target.closest('#sandai-touch-controls'))) {
        e.preventDefault();
      }
    }, { passive: false });
  }

  window.SANDAI.Controls = {
    initKeyboard: initKeyboard,
    destroyKeyboard: destroyKeyboard,
    createTouchControls: createTouchControls,
    destroyTouchControls: destroyTouchControls,
    getP1Input: getP1Input,
    getP2Input: getP2Input,
    clearPressed: clearPressed,
    inputState: inputState,
    resetAllInputs: resetAllInputs,
    toggleFullscreen: toggleFullscreen,
    initMobileOptimizations: initMobileOptimizations
  };

})();
