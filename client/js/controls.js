// ============================================================
// SANDAI — controls.js
// PC Keyboard and Mobile Touch Multi-Input Engine
// ============================================================

(function () {
  'use strict';

  window.SANDAI = window.SANDAI || {};

  // ── Input State ────────────────────────────────────────────
  var inputState = {
    p1: { left: false, right: false, jump: false, crouch: false, block: false, punch: false, kick: false, special: false, dodge: false },
    p2: { left: false, right: false, jump: false, crouch: false, block: false, punch: false, kick: false, special: false, dodge: false }
  };

  // Single-fire actions (cleared each frame after reading)
  var inputPressed = {
    p1: { punch: false, kick: false, special: false, jump: false, dodge: false },
    p2: { punch: false, kick: false, special: false, jump: false, dodge: false }
  };

  // ── PC Keyboard Mapping ────────────────────────────────────
  // Player 1:
  // A/D: Move | W: Jump | S: Block | X: Crouch | C / Space: Dodge | J: Punch | K: Kick | L: Special
  var KEY_MAP_P1 = {
    'a': 'left', 'd': 'right', 'w': 'jump', 's': 'block', 'x': 'crouch',
    'c': 'dodge', ' ': 'dodge', 'space': 'dodge',
    'j': 'punch', 'k': 'kick', 'l': 'special'
  };

  // Player 2:
  // Arrows: Move/Jump/Block | Down: Block/Crouch | 0: Dodge | 1: Punch | 2: Kick | 3: Special
  var KEY_MAP_P2 = {
    'arrowleft': 'left', 'arrowright': 'right', 'arrowup': 'jump', 'arrowdown': 'block',
    '0': 'dodge', 'digit0': 'dodge', 'numpad0': 'dodge',
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
      if (actionP1 === 'punch' || actionP1 === 'kick' || actionP1 === 'special' || actionP1 === 'jump' || actionP1 === 'dodge') {
        inputPressed.p1[actionP1] = true;
      }
    }

    // Player 2
    var actionP2 = KEY_MAP_P2[key] || KEY_MAP_P2[code];
    if (actionP2) {
      inputState.p2[actionP2] = true;
      if (actionP2 === 'punch' || actionP2 === 'kick' || actionP2 === 'special' || actionP2 === 'jump' || actionP2 === 'dodge') {
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
    var actions = ['left', 'right', 'jump', 'crouch', 'block', 'punch', 'kick', 'special', 'dodge'];
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
  var touchIds = {}; // identifier -> action

  function createTouchControls() {
    if (touchActive) return;
    if (window.SANDAI.deviceType === 'pc') return;
    touchActive = true;

    touchContainer = document.createElement('div');
    touchContainer.id = 'sandai-touch-controls';
    touchContainer.className = 'touch-controls-layer';

    // ── Left Side: D-Pad Movement (Jump ▲, Left ◀, Right ▶, Crouch ▼) ──
    var leftPanel = document.createElement('div');
    leftPanel.className = 'touch-panel-left touch-dpad-grid';

    // Up: Jump
    var btnJump = document.createElement('button');
    btnJump.className = 'touch-btn btn-touch-jump btn-dpad-up';
    btnJump.dataset.action = 'jump';
    btnJump.textContent = '▲';
    btnJump.setAttribute('type', 'button');
    btnJump.setAttribute('aria-label', 'Jump');
    leftPanel.appendChild(btnJump);

    // Left: Move Left
    var btnLeft = document.createElement('button');
    btnLeft.className = 'touch-btn btn-touch-move btn-touch-left btn-dpad-left';
    btnLeft.dataset.action = 'left';
    btnLeft.textContent = '◀';
    btnLeft.setAttribute('type', 'button');
    btnLeft.setAttribute('aria-label', 'Move Left');
    leftPanel.appendChild(btnLeft);

    // Right: Move Right
    var btnRight = document.createElement('button');
    btnRight.className = 'touch-btn btn-touch-move btn-touch-right btn-dpad-right';
    btnRight.dataset.action = 'right';
    btnRight.textContent = '▶';
    btnRight.setAttribute('type', 'button');
    btnRight.setAttribute('aria-label', 'Move Right');
    leftPanel.appendChild(btnRight);

    // Down: Crouch
    var btnCrouch = document.createElement('button');
    btnCrouch.className = 'touch-btn btn-touch-crouch btn-dpad-down';
    btnCrouch.dataset.action = 'crouch';
    btnCrouch.textContent = '▼';
    btnCrouch.setAttribute('type', 'button');
    btnCrouch.setAttribute('aria-label', 'Crouch');
    leftPanel.appendChild(btnCrouch);

    touchContainer.appendChild(leftPanel);

    // ── Right Side: Action Buttons (Punch, Kick, Block, Dodge, Special) ──
    var rightPanel = document.createElement('div');
    rightPanel.className = 'touch-panel-right touch-actions-grid';

    // Action Row Top: Block (🛡️), Special (⚡)
    var topRow = document.createElement('div');
    topRow.className = 'touch-row-top';

    var btnBlock = document.createElement('button');
    btnBlock.className = 'touch-btn btn-touch-block';
    btnBlock.dataset.action = 'block';
    btnBlock.textContent = '🛡️';
    btnBlock.setAttribute('type', 'button');
    btnBlock.setAttribute('aria-label', 'Block');
    topRow.appendChild(btnBlock);

    var btnSpecial = document.createElement('button');
    btnSpecial.className = 'touch-btn btn-touch-special';
    btnSpecial.dataset.action = 'special';
    btnSpecial.textContent = '⚡';
    btnSpecial.setAttribute('type', 'button');
    btnSpecial.setAttribute('aria-label', 'Special Attack');
    topRow.appendChild(btnSpecial);

    rightPanel.appendChild(topRow);

    // Action Row Bottom: Dodge (💨), Punch (👊), Kick (🦶)
    var bottomRow = document.createElement('div');
    bottomRow.className = 'touch-row-bottom';

    var btnDodge = document.createElement('button');
    btnDodge.className = 'touch-btn btn-touch-dodge';
    btnDodge.dataset.action = 'dodge';
    btnDodge.textContent = '💨';
    btnDodge.setAttribute('type', 'button');
    btnDodge.setAttribute('aria-label', 'Dodge Evasion');
    bottomRow.appendChild(btnDodge);

    var btnPunch = document.createElement('button');
    btnPunch.className = 'touch-btn btn-touch-punch';
    btnPunch.dataset.action = 'punch';
    btnPunch.textContent = '👊';
    btnPunch.setAttribute('type', 'button');
    btnPunch.setAttribute('aria-label', 'Punch Light Attack');
    bottomRow.appendChild(btnPunch);

    var btnKick = document.createElement('button');
    btnKick.className = 'touch-btn btn-touch-kick';
    btnKick.dataset.action = 'kick';
    btnKick.textContent = '🦶';
    btnKick.setAttribute('type', 'button');
    btnKick.setAttribute('aria-label', 'Kick Heavy Attack');
    bottomRow.appendChild(btnKick);

    rightPanel.appendChild(bottomRow);
    touchContainer.appendChild(rightPanel);

    // ── Unified Multi-Touch & Pointer Handlers ─────────────────
    touchContainer.addEventListener('touchstart', onTouchStart, { passive: false });
    touchContainer.addEventListener('touchmove', onTouchMove, { passive: false });
    touchContainer.addEventListener('touchend', onTouchEnd, { passive: false });
    touchContainer.addEventListener('touchcancel', onTouchEnd, { passive: false });

    // Pointer events support
    touchContainer.addEventListener('pointerdown', onPointerDown, { passive: false });
    touchContainer.addEventListener('pointermove', onPointerMove, { passive: false });
    touchContainer.addEventListener('pointerup', onPointerUp, { passive: false });
    touchContainer.addEventListener('pointercancel', onPointerUp, { passive: false });

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

  function triggerActionDown(action, btn) {
    inputState.p1[action] = true;
    if (action === 'punch' || action === 'kick' || action === 'special' || action === 'jump' || action === 'dodge') {
      inputPressed.p1[action] = true;
      try {
        if (navigator.vibrate) navigator.vibrate(15);
      } catch (vhErr) {}
    }
    if (btn) btn.classList.add('touch-pressed');
  }

  function triggerActionUp(action, btn) {
    inputState.p1[action] = false;
    if (btn) btn.classList.remove('touch-pressed');
  }

  function onTouchStart(e) {
    e.preventDefault();
    for (var i = 0; i < e.changedTouches.length; i++) {
      var touch = e.changedTouches[i];
      var btn = getButtonFromPoint(touch.clientX, touch.clientY);
      if (btn) {
        var action = btn.dataset.action;
        touchIds['t_' + touch.identifier] = action;
        triggerActionDown(action, btn);
      }
    }
  }

  function onTouchMove(e) {
    e.preventDefault();
    for (var i = 0; i < e.changedTouches.length; i++) {
      var touch = e.changedTouches[i];
      var btn = getButtonFromPoint(touch.clientX, touch.clientY);
      var idKey = 't_' + touch.identifier;
      var prevAction = touchIds[idKey];

      if (btn) {
        var newAction = btn.dataset.action;
        if (prevAction !== newAction) {
          if (prevAction) {
            triggerActionUp(prevAction, touchContainer.querySelector('[data-action="' + prevAction + '"]'));
          }
          touchIds[idKey] = newAction;
          triggerActionDown(newAction, btn);
        }
      } else {
        if (prevAction) {
          triggerActionUp(prevAction, touchContainer.querySelector('[data-action="' + prevAction + '"]'));
          delete touchIds[idKey];
        }
      }
    }
  }

  function onTouchEnd(e) {
    e.preventDefault();
    for (var i = 0; i < e.changedTouches.length; i++) {
      var touch = e.changedTouches[i];
      var idKey = 't_' + touch.identifier;
      var action = touchIds[idKey];
      if (action) {
        triggerActionUp(action, touchContainer.querySelector('[data-action="' + action + '"]'));
        delete touchIds[idKey];
      }
    }
  }

  // Pointer event support for non-touch / stylus / pointer devices
  function onPointerDown(e) {
    if (e.pointerType === 'touch') return; // Handled by touch events
    e.preventDefault();
    var btn = getButtonFromPoint(e.clientX, e.clientY);
    if (btn) {
      var action = btn.dataset.action;
      touchIds['p_' + e.pointerId] = action;
      triggerActionDown(action, btn);
    }
  }

  function onPointerMove(e) {
    if (e.pointerType === 'touch') return;
    var idKey = 'p_' + e.pointerId;
    if (!touchIds[idKey]) return;
    e.preventDefault();
    var btn = getButtonFromPoint(e.clientX, e.clientY);
    var prevAction = touchIds[idKey];
    if (btn) {
      var newAction = btn.dataset.action;
      if (prevAction !== newAction) {
        if (prevAction) triggerActionUp(prevAction, touchContainer.querySelector('[data-action="' + prevAction + '"]'));
        touchIds[idKey] = newAction;
        triggerActionDown(newAction, btn);
      }
    } else {
      if (prevAction) {
        triggerActionUp(prevAction, touchContainer.querySelector('[data-action="' + prevAction + '"]'));
        delete touchIds[idKey];
      }
    }
  }

  function onPointerUp(e) {
    if (e.pointerType === 'touch') return;
    var idKey = 'p_' + e.pointerId;
    var action = touchIds[idKey];
    if (action) {
      triggerActionUp(action, touchContainer.querySelector('[data-action="' + action + '"]'));
      delete touchIds[idKey];
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
      touchContainer.removeEventListener('pointerdown', onPointerDown);
      touchContainer.removeEventListener('pointermove', onPointerMove);
      touchContainer.removeEventListener('pointerup', onPointerUp);
      touchContainer.removeEventListener('pointercancel', onPointerUp);
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
      crouch:  inputState.p1.crouch,
      block:   inputState.p1.block,
      punch:   inputPressed.p1.punch,
      kick:    inputPressed.p1.kick,
      special: inputPressed.p1.special,
      dodge:   inputPressed.p1.dodge
    };
  }

  function getP2Input() {
    return {
      left:    inputState.p2.left,
      right:   inputState.p2.right,
      jump:    inputPressed.p2.jump,
      crouch:  inputState.p2.crouch,
      block:   inputState.p2.block,
      punch:   inputPressed.p2.punch,
      kick:    inputPressed.p2.kick,
      special: inputPressed.p2.special,
      dodge:   inputPressed.p2.dodge
    };
  }

  function clearPressed() {
    inputPressed.p1.punch = false;
    inputPressed.p1.kick = false;
    inputPressed.p1.special = false;
    inputPressed.p1.jump = false;
    inputPressed.p1.dodge = false;

    inputPressed.p2.punch = false;
    inputPressed.p2.kick = false;
    inputPressed.p2.special = false;
    inputPressed.p2.jump = false;
    inputPressed.p2.dodge = false;
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
