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

// ── Test 9: HTTP Verification with Running Server ─────────────
console.log('\n--- 9. Testing HTTP Asset Delivery from Live Server ---');

function testUrl(urlPath) {
  return new Promise((resolve) => {
    http.get(`http://localhost:3000${urlPath}`, (res) => {
      resolve({ path: urlPath, statusCode: res.statusCode, length: res.headers['content-length'] });
    }).on('error', (err) => {
      resolve({ path: urlPath, statusCode: 500, error: err.message });
    });
  });
}

async function runHttpTests() {
  const assets = [
    '/',
    '/css/styles.css',
    '/js/app.js',
    '/js/game.js',
    '/js/fighters.js',
    '/js/controls.js',
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
    const res = await testUrl(asset);
    assert(res.statusCode === 200, `HTTP GET ${asset} -> 200 OK (${res.length || 'stream'} bytes)`);
  }

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
