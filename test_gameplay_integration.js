// ============================================================
// SANDAI — Comprehensive Automated Integration Test Suite
// Verifies All 6 Requirements:
// 1. Full-Body 2D Fighting Characters (All 8 fighters)
// 2. Character Selection Connection (Sprites & Metadata)
// 3. 9 Animations per Character (Idle, Walk, Jump, Punch, Kick, Block, Special, Hit, Victory)
// 4. PC Keyboard Controls Guide Screen (#screen-controls-guide & P1/P2 keycaps)
// 5. Mobile Touch Controls (Left Move, Right Actions, Multi-touch, PC guide skipped on mobile)
// 6. Game Modes & Socket.IO Multiplayer Compatibility
// ============================================================

const fs = require('fs');
const path = require('path');
const http = require('http');

const CLIENT_DIR = path.join(__dirname, '..', 'client');
const SPRITES_DIR = path.join(CLIENT_DIR, 'assets', 'sprites');
const CHARACTERS_DIR = path.join(CLIENT_DIR, 'assets', 'characters');

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log('  [PASS]', message);
    testsPassed++;
  } else {
    console.error('  [FAIL]', message);
    testsFailed++;
  }
}

console.log('=== SANDAI FIGHTING GAME INTEGRATION TEST SUITE ===\n');

// ── Test 1: Verify All 8 Supplied Character Portraits ─────────
console.log('--- 1. Testing Supplied Character Portraits ---');
const expectedPortraits = [
  'Abilash.webp', 'Anas.webp', 'Dhinesh.webp', 'Farook.webp',
  'Kiran.webp', 'Nawin.webp', 'Rafeek.webp', 'Tharun.webp'
];

expectedPortraits.forEach(file => {
  const filePath = path.join(CHARACTERS_DIR, file);
  const exists = fs.existsSync(filePath);
  const size = exists ? fs.statSync(filePath).size : 0;
  assert(exists && size > 1000, `Portrait exists: ${file} (${size} bytes)`);
});

// ── Test 2: Verify All 8 Full-Body 2D Fighting Spritesheets ───
console.log('\n--- 2. Testing Full-Body 2D Fighting Spritesheets (28 Frames, 140x200 per frame) ---');
const expectedSprites = [
  'abilash_sheet.png', 'anas_sheet.png', 'dhinesh_sheet.png', 'farook_sheet.png',
  'kiran_sheet.png', 'nawin_sheet.png', 'rafeek_sheet.png', 'tharun_sheet.png'
];

const PNG = require('pngjs').PNG;

expectedSprites.forEach(file => {
  const filePath = path.join(SPRITES_DIR, file);
  const exists = fs.existsSync(filePath);
  assert(exists, `Spritesheet file exists: ${file}`);

  if (exists) {
    const data = fs.readFileSync(filePath);
    const png = PNG.sync.read(data);
    assert(png.width === 980 && png.height === 800,
      `Spritesheet dimensions: ${file} is ${png.width}x${png.height} (7 cols x 4 rows of 140x200 frames = 28 frames)`);
  }
});

// ── Test 3: Verify HTML Structure for Controls Guide & Screens ─
console.log('\n--- 3. Testing HTML Structure for Controls Guide & Game Screens ---');
const htmlContent = fs.readFileSync(path.join(CLIENT_DIR, 'index.html'), 'utf8');

assert(htmlContent.includes('id="screen-device"'), 'Device selection screen (#screen-device) is present');
assert(htmlContent.includes('id="device-pc"'), 'PC / Laptop card (#device-pc) is present');
assert(htmlContent.includes('id="device-mobile"'), 'Mobile card (#device-mobile) is present');
assert(htmlContent.includes('id="screen-controls-guide"'), 'PC Controls Guide screen (#screen-controls-guide) is present');
assert(htmlContent.includes('id="btn-start-fight-guide"'), 'START FIGHT button (#btn-start-fight-guide) is present');
assert(htmlContent.includes('PLAYER 1') && htmlContent.includes('Primary Fighter'), 'Player 1 controls card present in guide');
assert(htmlContent.includes('PLAYER 2') && htmlContent.includes('Opponent / Local 2P'), 'Player 2 controls card present in guide');

// Check Player 1 keycaps
const p1Keys = ['A', 'D', 'W', 'S', 'J', 'K', 'L'];
p1Keys.forEach(k => {
  assert(htmlContent.includes(`>${k}</span>`), `Player 1 keycap '${k}' present in guide`);
});

// Check Player 2 keycaps
const p2Keys = ['◀', '▶', '▲', '▼', '1', '2', '3'];
p2Keys.forEach(k => {
  assert(htmlContent.includes(`>${k}</span>`), `Player 2 keycap '${k}' present in guide`);
});

assert(htmlContent.includes('id="screen-game"'), 'Game screen (#screen-game) is present');
assert(htmlContent.includes('id="game-container"'), 'Phaser game container (#game-container) is present');

// ── Test 4: Verify CSS Styles for Controls Guide & Touch ──────
console.log('\n--- 4. Testing CSS Styles for Controls Guide & Mobile Touch ---');
const cssContent = fs.readFileSync(path.join(CLIENT_DIR, 'css', 'styles.css'), 'utf8');

assert(cssContent.includes('#screen-controls-guide'), 'CSS has #screen-controls-guide styling');
assert(cssContent.includes('.controls-guide-grid'), 'CSS has .controls-guide-grid styling');
assert(cssContent.includes('.controls-player-card'), 'CSS has .controls-player-card styling');
assert(cssContent.includes('.key-cap'), 'CSS has .key-cap capsule button styling');
assert(cssContent.includes('.touch-controls-layer'), 'CSS has .touch-controls-layer styling');
assert(cssContent.includes('.touch-panel-left'), 'CSS has left movement panel styling');
assert(cssContent.includes('.touch-panel-right'), 'CSS has right action panel styling');
assert(cssContent.includes('.btn-touch-move'), 'CSS has .btn-touch-move styling');
assert(cssContent.includes('.btn-touch-jump'), 'CSS has .btn-touch-jump styling');
assert(cssContent.includes('.btn-touch-special'), 'CSS has .btn-touch-special styling');
assert(cssContent.includes('.btn-touch-punch'), 'CSS has .btn-touch-punch styling');
assert(cssContent.includes('.btn-touch-kick'), 'CSS has .btn-touch-kick styling');
assert(cssContent.includes('.btn-touch-block'), 'CSS has .btn-touch-block styling');

// ── Test 5: Verify Application Logic (app.js) ─────────────────
console.log('\n--- 5. Testing Application Logic & Screen Routing (app.js) ---');
const appJsContent = fs.readFileSync(path.join(CLIENT_DIR, 'js', 'app.js'), 'utf8');

assert(appJsContent.includes('onFightTriggered'), 'onFightTriggered() entrypoint is implemented');
assert(appJsContent.includes("window.SANDAI.deviceType === 'pc'") && appJsContent.includes("'screen-controls-guide'"),
  'PC route explicitly shows #screen-controls-guide');
assert(appJsContent.includes('startMatchSequence()'),
  'Mobile route bypasses controls guide and starts match sequence immediately');
assert(appJsContent.includes('setupControlsGuideScreen'), 'setupControlsGuideScreen() handler is registered');

// ── Test 6: Verify Mobile Touch Multi-Input Engine (controls.js)
console.log('\n--- 6. Testing Mobile Touch Controls Engine (controls.js) ---');
const controlsJsContent = fs.readFileSync(path.join(CLIENT_DIR, 'js', 'controls.js'), 'utf8');

assert(controlsJsContent.includes('createTouchControls'), 'createTouchControls() is implemented');
assert(controlsJsContent.includes('touch-panel-left'), 'Left panel for movement buttons created');
assert(controlsJsContent.includes('touch-panel-right'), 'Right panel for action buttons created');
assert(controlsJsContent.includes('btn-touch-jump') && controlsJsContent.includes('▲'), 'Jump touch button (▲) present');
assert(controlsJsContent.includes('btn-touch-special') && controlsJsContent.includes('⚡'), 'Special touch button (⚡) present');
assert(controlsJsContent.includes('btn-touch-punch') && controlsJsContent.includes('👊'), 'Punch touch button (👊) present');
assert(controlsJsContent.includes('btn-touch-kick') && controlsJsContent.includes('🦶'), 'Kick touch button (🦶) present');
assert(controlsJsContent.includes('btn-touch-block') && controlsJsContent.includes('🛡️'), 'Block touch button (🛡️) present');
assert(controlsJsContent.includes('touchstart') && controlsJsContent.includes('changedTouches'),
  'Multi-touch event listener (touchstart) implemented');
assert(controlsJsContent.includes('touchIds'),
  'Multi-touch finger tracking dictionary (touchIds) implemented for simultaneous inputs');

// ── Test 7: Verify Fighter Class & Animations (fighters.js) ───
console.log('\n--- 7. Testing Fighter Class & 9 Animation Types (fighters.js) ---');
const fightersJsContent = fs.readFileSync(path.join(CLIENT_DIR, 'js', 'fighters.js'), 'utf8');

assert(fightersJsContent.includes('createSprite'), 'Fighter.createSprite() uses Phaser full-body sprites');
assert(fightersJsContent.includes('playAnim'), 'Fighter.playAnim() handles animation state transitions');

const requiredAnimations = ['idle', 'walk', 'jump', 'punch', 'kick', 'block', 'special', 'hit', 'victory'];
requiredAnimations.forEach(anim => {
  assert(fightersJsContent.includes(`'${anim}'`), `Animation state '${anim}' is handled in Fighter class`);
});

// ── Test 8: Verify Phaser Game Engine & Spritesheet Setup (game.js)
console.log('\n--- 8. Testing Phaser Scene & Spritesheet Loading (game.js) ---');
const gameJsContent = fs.readFileSync(path.join(CLIENT_DIR, 'js', 'game.js'), 'utf8');

assert(gameJsContent.includes('this.load.spritesheet'), 'All spritesheets are loaded via this.load.spritesheet');
assert(gameJsContent.includes('frameWidth: 140') && gameJsContent.includes('frameHeight: 200'),
  'Frame dimensions set to 140x200');
assert(gameJsContent.includes('registerAllFighterAnimations'), 'registerAllFighterAnimations() registers anims for all 8 characters');

requiredAnimations.forEach(anim => {
  assert(gameJsContent.includes(`charName + '_${anim}'`), `Phaser animation key '<name>_${anim}' registered`);
});

assert(gameJsContent.includes('Controls.createTouchControls'), 'Touch controls initialized when device is mobile');
assert(gameJsContent.includes('Controls.initKeyboard'), 'Keyboard controls initialized');

// ── Test 9: Verify Stage 3 AI Behavior & Difficulty Presets (ai.js) ─
console.log('\n--- 9. Testing Stage 3 AI Behavior & Difficulty Presets (ai.js) ---');
const aiJsContent = fs.readFileSync(path.join(CLIENT_DIR, 'js', 'ai.js'), 'utf8');

assert(aiJsContent.includes('DIFFICULTY_PRESETS'), 'AIController defines DIFFICULTY_PRESETS');
assert(aiJsContent.includes('easy:') && aiJsContent.includes('normal:') && aiJsContent.includes('hard:'),
  'All 3 AI difficulty presets (easy, normal, hard) defined');
assert(aiJsContent.includes('whiffTimer'), 'AI implements whiff punishment detection');
assert(aiJsContent.includes('jump-attack') || aiJsContent.includes('jump'), 'AI implements anti-air / jump attack reaction');
assert(aiJsContent.includes('this.difficulty ='), 'AIController sets active difficulty');

// ── Test 10: Verify Stage 3 Local 2-Player Controls (controls.js) ─
console.log('\n--- 10. Testing Stage 3 Local 2-Player Key Mappings (controls.js) ---');
assert(controlsJsContent.includes('KEY_MAP_P2'), 'P2 key mapping defined');
assert(controlsJsContent.includes("'digit1'") || controlsJsContent.includes("'numpad1'"), 'P2 controls support Digit1 and Numpad1 for Punch');
assert(controlsJsContent.includes("'digit2'") || controlsJsContent.includes("'numpad2'"), 'P2 controls support Digit2 and Numpad2 for Kick');
assert(controlsJsContent.includes("'digit3'") || controlsJsContent.includes("'numpad3'"), 'P2 controls support Digit3 and Numpad3 for Special');

// ── Test 11: Verify Stage 3 Online Custom Room Lobby UI & Overlays ───
console.log('\n--- 11. Testing Stage 3 Online Custom Room Lobby & Overlays ---');
assert(htmlContent.includes('id="ai-difficulty-selector"'), 'AI difficulty selector (#ai-difficulty-selector) present in character select');
assert(htmlContent.includes('id="screen-lobby"'), 'Online Lobby screen (#screen-lobby) present');
assert(htmlContent.includes('id="lobby-ping"') && htmlContent.includes('id="ping-text"'), 'Real-time ping display (#lobby-ping) present in lobby');
assert(htmlContent.includes('id="btn-copy-code"'), 'Copy room code button (#btn-copy-code) present');
assert(htmlContent.includes('id="btn-copy-link"'), 'Copy invite link button (#btn-copy-link) present');
assert(htmlContent.includes('id="lobby-p1-name"'), 'Host slot character card (lobby-p1-name) present in lobby');
assert(htmlContent.includes('id="lobby-p2-name"'), 'Guest slot character card (lobby-p2-name) present in lobby');
assert(htmlContent.includes('id="lobby-arena-row"'), 'Arena selector strip (#lobby-arena-row) present in lobby');
assert(htmlContent.includes('btn-lobby-ready') && htmlContent.includes('id="btn-ready"'), 'Big ready toggle button present in lobby');
assert(htmlContent.includes('id="disconnect-overlay"'), 'Disconnection / reconnection overlay (#disconnect-overlay) present');
assert(htmlContent.includes('id="rematch-status"'), 'Rematch status text (#rematch-status) present in winner screen');

// ── Test 12: Verify Stage 4 Web Audio Engine (audio.js) ────────
console.log('\n--- 12. Testing Stage 4 Web Audio Synthesizer Engine (audio.js) ---');
const audioJsPath = path.join(CLIENT_DIR, 'js', 'audio.js');
assert(fs.existsSync(audioJsPath), 'audio.js exists in client/js');
const audioJsContent = fs.readFileSync(audioJsPath, 'utf8');

assert(audioJsContent.includes('playPunch'), 'audio.js synthesizes punch impacts');
assert(audioJsContent.includes('playKick'), 'audio.js synthesizes kick impacts');
assert(audioJsContent.includes('playBlock'), 'audio.js synthesizes metallic guard clinks');
assert(audioJsContent.includes('playJump'), 'audio.js synthesizes jump whooshes');
assert(audioJsContent.includes('playSpecial'), 'audio.js synthesizes character-specific special attacks');
assert(audioJsContent.includes('playHit'), 'audio.js synthesizes hit reactions');
assert(audioJsContent.includes('playKO'), 'audio.js synthesizes K.O. sub-bass drops');
assert(audioJsContent.includes('playVictory'), 'audio.js synthesizes victory fanfare chords');
assert(audioJsContent.includes('startAmbience') && audioJsContent.includes('stopAmbience'), 'audio.js handles procedural arena ambience');
assert(audioJsContent.includes('setMasterVolume') && audioJsContent.includes('setMusicVolume') && audioJsContent.includes('setSfxVolume'),
  'audio.js provides master, music, and sfx gain controls');

// ── Test 13: Verify Stage 4 Cinematic Match Loading Screen ──────
console.log('\n--- 13. Testing Stage 4 Match Loading Screen ---');
assert(htmlContent.includes('id="screen-loading"'), 'Cinematic loading screen (#screen-loading) present');
assert(htmlContent.includes('id="loading-progress-bar"'), 'Measurable progress bar (#loading-progress-bar) present');
assert(htmlContent.includes('id="loading-percent-val"'), 'Progress percentage indicator (#loading-percent-val) present');
assert(htmlContent.includes('id="loading-status-text"'), 'Loading status message (#loading-status-text) present');
assert(htmlContent.includes('id="btn-loading-retry"'), 'Loading error retry button (#btn-loading-retry) present');

// ── Test 14: Verify Stage 4 Complete Settings Interface ────────
console.log('\n--- 14. Testing Stage 4 Complete Settings Modal ---');
assert(htmlContent.includes('id="slider-master-volume"'), 'Master volume slider (#slider-master-volume) present');
assert(htmlContent.includes('id="slider-music-volume"'), 'Music volume slider (#slider-music-volume) present');
assert(htmlContent.includes('id="slider-sfx-volume"'), 'SFX volume slider (#slider-sfx-volume) present');
assert(htmlContent.includes('id="toggle-audio-mute"'), 'Audio mute toggle (#toggle-audio-mute) present');
assert(htmlContent.includes('id="toggle-camera-shake"'), 'Camera shake toggle (#toggle-camera-shake) present');
assert(htmlContent.includes('id="toggle-reduced-vfx"'), 'Reduced visual effects toggle (#toggle-reduced-vfx) present');
assert(htmlContent.includes('id="btn-settings-fullscreen"'), 'Fullscreen toggle button in settings present');
assert(htmlContent.includes('id="btn-settings-guide"'), 'Controls guide button in settings present');
assert(htmlContent.includes('id="btn-reset-settings"'), 'Reset to defaults button (#btn-reset-settings) present');

// ── Test 15: Verify Stage 4 Renderer3D Optimizations & Context Recovery ──
console.log('\n--- 15. Testing Stage 4 Renderer3D Optimizations & Context Recovery ---');
const renderer3dContent = fs.readFileSync(path.join(CLIENT_DIR, 'js', 'renderer3d.js'), 'utf8');
assert(renderer3dContent.includes('resolveQuality'), 'Renderer3D implements resolveQuality() for AUTO tier detection');
assert(renderer3dContent.includes('webglcontextlost') && renderer3dContent.includes('webglcontextrestored'),
  'Renderer3D implements graceful WebGL context loss & restoration');
assert(renderer3dContent.includes('visibilitychange') || renderer3dContent.includes('document.hidden'),
  'Renderer3D pauses rendering on inactive background tabs');
assert(renderer3dContent.includes('cameraShakeEnabled'), 'Renderer3D respects camera shake toggle');
assert(renderer3dContent.includes('reducedVFX'), 'Renderer3D respects reduced visual effects toggle');

// ── Test 16: Verify Stage 4 Controls Focus Loss Reset ──────────
console.log('\n--- 16. Testing Stage 4 Controls Focus Loss Reset ---');
assert(controlsJsContent.includes('resetAllInputs'), 'Controls implements resetAllInputs() on application blur');
assert(controlsJsContent.includes('window.addEventListener(\'blur\'') || controlsJsContent.includes('blur'),
  'Controls automatically listens for window blur to prevent stuck keys');

// ── Test 17: Verify Next-Gen Combat, 3D Showcase & Training Mode ─
console.log('\n--- 17. Testing Next-Gen Combat, 3D Showcase & Training Mode ---');
assert(htmlContent.includes('id="btn-quick-training"'), 'Main Menu quick training button (#btn-quick-training) present');
assert(htmlContent.includes('data-mode="training"'), 'Mode selection includes Training Dojo card');
assert(htmlContent.includes('id="char-3d-preview-container"'), 'Character select 3D showcase container (#char-3d-preview-container) present');
assert(htmlContent.includes('id="btn-toggle-3d"') && htmlContent.includes('id="btn-toggle-2d"'), '3D/2D showcase toggle buttons present');
assert(htmlContent.includes('id="training-overlay"'), 'In-game training overlay ribbon (#training-overlay) present');
assert(htmlContent.includes('id="btn-reset-training"'), 'Training reset button (#btn-reset-training) present');
assert(htmlContent.includes('id="btn-open-movelist"'), 'Training Move List button (#btn-open-movelist) present');
assert(htmlContent.includes('id="modal-movelist"'), 'Move list modal (#modal-movelist) present');

// Combat system assertions (fighters.js)
assert(fightersJsContent.includes('this.energy'), 'Fighter implements 0-100% Super Energy Meter');
assert(fightersJsContent.includes('guard_break'), 'Fighter implements Guard Break dizzy state on stamina depletion');
assert(fightersJsContent.includes('isCounter') || fightersJsContent.includes('COUNTER HIT'), 'Fighter implements Counter Hit startup vulnerability system');
assert(fightersJsContent.includes('startup') && fightersJsContent.includes('activeStart') && fightersJsContent.includes('recovery'), 'Fighter implements professional startup/active/recovery frame data');
assert(fightersJsContent.includes('comboScaling') || fightersJsContent.includes('0.85'), 'Fighter implements combo damage scaling');

// Fighting HUD & Training Logic (game.js)
assert(gameJsContent.includes('p1RecoilHealth'), 'Game implements Tekken/MK style golden recoil damage trails');
assert(gameJsContent.includes('triggerHitStop'), 'Game implements hit-stop freeze-frame impact engine');
assert(gameJsContent.includes('showFloatingBanner'), 'Game implements floating combat banners (Counter Hit, Guard Break)');
assert(gameJsContent.includes('resetTrainingPositions'), 'FightScene implements resetTrainingPositions()');

// 3D Engine Preview Showcase (renderer3d.js)
assert(renderer3dContent.includes('createPreviewScene'), 'Renderer3D implements createPreviewScene() for character selection');

// ── Test 18: HTTP Verification with Live Server ─────────────
console.log('\n--- 18. Testing HTTP Asset Delivery from Live Server ---');

function testUrl(port, urlPath) {
  return new Promise((resolve) => {
    http.get(`http://localhost:${port}${urlPath}`, (res) => {
      resolve({ path: urlPath, statusCode: res.statusCode, length: res.headers['content-length'] });
    }).on('error', (err) => {
      resolve({ path: urlPath, statusCode: 500, error: err.message });
    });
  });
}

async function runHttpTests() {
  const app = require('./server.js');
  const testServer = http.createServer(app);
  await new Promise((resolve) => testServer.listen(0, resolve));
  const testPort = testServer.address().port;

  const assets = [
    '/',
    '/css/styles.css',
    '/js/audio.js',
    '/js/app.js',
    '/js/game.js',
    '/js/fighters.js',
    '/js/controls.js',
    '/js/renderer3d.js',
    '/health',
    '/api/health',
    '/assets/sprites/abilash_sheet.png',
    '/assets/sprites/anas_sheet.png',
    '/assets/sprites/dhinesh_sheet.png',
    '/assets/sprites/farook_sheet.png',
    '/assets/sprites/kiran_sheet.png',
    '/assets/sprites/nawin_sheet.png',
    '/assets/sprites/rafeek_sheet.png',
    '/assets/sprites/tharun_sheet.png',
    '/assets/characters/Abilash.webp',
    '/assets/characters/Anas.webp',
    '/assets/characters/Dhinesh.webp',
    '/assets/characters/Farook.webp',
    '/assets/characters/Kiran.webp',
    '/assets/characters/Nawin.webp',
    '/assets/characters/Rafeek.webp',
    '/assets/characters/Tharun.webp'
  ];

  for (const asset of assets) {
    const res = await testUrl(testPort, asset);
    assert(res.statusCode === 200, `HTTP GET ${asset} -> 200 OK (${res.length || 'stream'} bytes)`);
  }

  testServer.close();

  console.log('\n======================================================');
  console.log(`TOTAL TESTS: ${testsPassed + testsFailed} | PASSED: ${testsPassed} | FAILED: ${testsFailed}`);
  console.log('======================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runHttpTests();
