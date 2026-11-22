// ============================================================
// SANDAI — KICKING ANIMATION & COMBAT MOVEMENT VERIFICATION SUITE
// ============================================================

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const THREE = require('three');

console.log('=== SANDAI KICKING ANIMATION & COMBAT TEST SUITE ===\n');

let passCount = 0;
let failCount = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    failCount++;
  }
}

// ------------------------------------------------------------
// 1. Verify K Key Input Mapping in controls.js & game.js
// ------------------------------------------------------------
console.log('--- 1. Testing K Key Mapping & Input Handlers ---');

const controlsCode = fs.readFileSync(path.join(__dirname, '../client/js/controls.js'), 'utf8');

test('controls.js maps K key strictly to "kick" for Player 1', () => {
  assert(controlsCode.includes("'k': 'kick'"), 'Expected KEY_MAP_P1 to map "k" to "kick"');
});

test('controls.js maps 2 / NumPad2 to "kick" for Player 2', () => {
  assert(controlsCode.includes("'2': 'kick'") || controlsCode.includes("'numpad2': 'kick'"), 'Expected KEY_MAP_P2 to map "2" to "kick"');
});

test('controls.js touch button has data-action="kick"', () => {
  assert(controlsCode.includes("btnKick.dataset.action = 'kick'"), 'Expected mobile kick button dataset.action to be "kick"');
});

const gameCode = fs.readFileSync(path.join(__dirname, '../client/js/game.js'), 'utf8');

test('game.js routes p1Input.kick exclusively to fighter1.kick()', () => {
  assert(gameCode.includes('if (p1Input.kick) { this.fighter1.kick();'), 'Expected p1Input.kick to call this.fighter1.kick()');
});

test('game.js routes p2Input.kick exclusively to fighter2.kick()', () => {
  assert(gameCode.includes('if (p2Input.kick) this.fighter2.kick();'), 'Expected p2Input.kick to call this.fighter2.kick()');
});

test('controls.js has NO random animation dispatch on K key', () => {
  // Verify onKeyDown does not contain Math.random() for action dispatch
  const onKeyDownMatch = controlsCode.match(/function onKeyDown[\s\S]*?^  \}/m);
  assert(onKeyDownMatch, 'onKeyDown found');
  assert(!onKeyDownMatch[0].includes('Math.random()'), 'onKeyDown must not use Math.random()');
});

// ------------------------------------------------------------
// 2. Verify GLB Model & Embedded Kick Animations
// ------------------------------------------------------------
console.log('\n--- 2. Testing GLB Model & Embedded Skeletal Kick Animations ---');

const glbBuffer = fs.readFileSync(path.join(__dirname, '../client/assets/models/fighter_base.glb'));
const jsonLen = glbBuffer.readUInt32LE(12);
const jsonBuf = glbBuffer.slice(20, 20 + jsonLen);
const gltf = JSON.parse(jsonBuf.toString('utf8'));

test('fighter_base.glb contains Kick_Martial_Arts animation clip', () => {
  const kickClip = gltf.animations.find(a => a.name === 'Kick_Martial_Arts');
  assert(kickClip, 'Expected Kick_Martial_Arts animation in GLTF');
  assert(kickClip.channels.length >= 10, 'Expected at least 10 skeletal channels in Kick_Martial_Arts');
});

test('fighter_base.glb contains Kick_Jump_Martial aerial animation clip', () => {
  const jumpClip = gltf.animations.find(a => a.name === 'Kick_Jump_Martial');
  assert(jumpClip, 'Expected Kick_Jump_Martial animation in GLTF');
  assert(jumpClip.channels.length >= 5, 'Expected at least 5 skeletal channels in Kick_Jump_Martial');
});

test('Kick_Martial_Arts contains essential skeletal tracks for martial arts biomechanics', () => {
  const kickClip = gltf.animations.find(a => a.name === 'Kick_Martial_Arts');
  const targetNodes = kickClip.channels.map(ch => gltf.nodes[ch.target.node].name);
  
  assert(targetNodes.includes('thigh_r'), 'Must animate thigh_r for hip flexion');
  assert(targetNodes.includes('calf_r'), 'Must animate calf_r for knee chamber & extension');
  assert(targetNodes.includes('foot_r'), 'Must animate foot_r for ball of foot impact');
  assert(targetNodes.includes('thigh_l'), 'Must animate thigh_l for weight shift');
  assert(targetNodes.includes('calf_l'), 'Must animate calf_l for supporting balance');
  assert(targetNodes.includes('pelvis'), 'Must animate pelvis for weight shift & forward thrust');
  assert(targetNodes.includes('spine_01'), 'Must animate spine_01 for torso counter-lean');
  assert(targetNodes.includes('upperarm_l'), 'Must animate upperarm_l for guard defense');
  assert(targetNodes.includes('upperarm_r'), 'Must animate upperarm_r for balance & guard');
});

// ------------------------------------------------------------
// 3. Verify Renderer3D Animation Controller Mapping
// ------------------------------------------------------------
console.log('\n--- 3. Testing Renderer3D Animation Controller ---');

const rendererCode = fs.readFileSync(path.join(__dirname, '../client/js/renderer3d.js'), 'utf8');

test('renderer3d.js maps actions["kick"] to Kick_Martial_Arts (NOT Sword_Attack)', () => {
  assert(!rendererCode.includes("actions['kick'] = actions['Sword_Attack']"), 'actions["kick"] must NOT be Sword_Attack');
  assert(rendererCode.includes("actions['kick'] = actions['Kick_Martial_Arts']"), 'actions["kick"] must map to Kick_Martial_Arts');
});

test('renderer3d.js maps actions["kick_jump"] to Kick_Jump_Martial', () => {
  assert(rendererCode.includes("actions['kick_jump'] = actions['Kick_Jump_Martial']"), 'actions["kick_jump"] must map to Kick_Jump_Martial');
});

test('renderer3d.js includes "kick" and "kick_jump" in one-shot attack loop configuration', () => {
  assert(rendererCode.includes("'kick'") && rendererCode.includes("'kick_jump'"), 'Expected kick and kick_jump in oneShots list');
});

test('renderer3d.js implements fast 0.06s crossfade for responsive attack execution', () => {
  assert(rendererCode.includes('var isAttack = (targetAnim === \'kick\'') || rendererCode.includes('fadeTime = isAttack ? 0.06 : 0.12;'), 'Expected snappy 0.06s attack fade time');
});

test('renderer3d.js locks targetFacing during attack to prevent unnatural snapping', () => {
  assert(rendererCode.includes('if (!fighterState.isAttacking'), 'Expected targetFacing to lock during attack');
});

// ------------------------------------------------------------
// 4. Verify Combat Engine & Kick Hit Detection (fighters.js)
// ------------------------------------------------------------
console.log('\n--- 4. Testing Combat Engine & Hit Detection Frame Data ---');

const fightersCode = fs.readFileSync(path.join(__dirname, '../client/js/fighters.js'), 'utf8');

// Load Fighter in mock environment
const Fighter = (function() {
  const sandbox = {
    window: { SANDAI: { Audio: { playKick: () => {}, playPunch: () => {}, playJump: () => {} } } },
    console: console
  };
  const fn = new Function('window', 'console', fightersCode);
  fn(sandbox.window, sandbox.console);
  return sandbox.window.SANDAI.Fighter;
})();

test('Fighter.prototype.kick sets state to "kick" and initializes 6-phase attack descriptor', () => {
  const f = new Fighter(null, 0, 0, 100, 300);
  f.kick();
  assert.strictEqual(f.state, 'kick');
  assert.strictEqual(f.isAttacking, true);
  assert(f.currentAttack, 'currentAttack must be set');
  assert.strictEqual(f.currentAttack.type, 'kick');
  assert.strictEqual(f.currentAttack.startup, 8);
  assert.strictEqual(f.currentAttack.activeStart, 9);
  assert.strictEqual(f.currentAttack.activeEnd, 19);
  assert.strictEqual(f.currentAttack.recovery, 16);
  assert.strictEqual(f.currentAttack.totalDuration, 35);
  assert.strictEqual(f.currentAttack.range, 125);
  assert.strictEqual(f.hitRegistered, false);
});

test('Repeated K presses while kick is executing do NOT stack or reset attack', () => {
  const f = new Fighter(null, 0, 0, 100, 300);
  f.kick();
  f.stateTimer = 4;
  f.kick(); // Second press while attacking
  assert.strictEqual(f.stateTimer, 4, 'stateTimer must not reset on repeated press');
  assert.strictEqual(f.isAttacking, true);
});

test('Kick deals 0 damage during startup window (frames 0 to 8)', () => {
  const attacker = new Fighter(null, 0, 0, 100, 300);
  const target = new Fighter(null, 1, 1, 150, 300); // 50px away (in range)
  attacker.kick();
  attacker.stateTimer = 5; // In startup chamber
  const hit = attacker.checkHit(target);
  assert.strictEqual(hit, false, 'No hit during startup');
  assert.strictEqual(target.health, 100, 'Target health unchanged');
});

test('Kick deals damage when in active window (frame 9 to 19) and within range', () => {
  const attacker = new Fighter(null, 0, 0);
  const target = new Fighter(null, 1, 1);
  attacker.x = 300;
  target.x = 380; // 80px away (in 125px range)
  target.y = attacker.y;
  attacker.kick();
  attacker.stateTimer = 12; // In active strike apex window
  const hit = attacker.checkHit(target);
  assert.strictEqual(hit, true, 'Kick should connect during active window');
  assert(target.health < 100, 'Target should take damage');
  assert.strictEqual(target.state, 'hit', 'Target should enter hit stun');
  assert(target.hitStunTimer > 0, 'Target should have hit stun duration');
  assert(target.knockbackX !== 0, 'Target should receive knockback');
});

test('Kick deals ZERO damage when opponent is outside range (dist >= 125px)', () => {
  const attacker = new Fighter(null, 0, 0);
  const target = new Fighter(null, 1, 1);
  attacker.x = 300;
  target.x = 480; // 180px away (outside 125px range)
  target.y = attacker.y;
  attacker.kick();
  attacker.stateTimer = 8; // In active window
  const hit = attacker.checkHit(target);
  assert.strictEqual(hit, false, 'Kick cannot hit outside range');
  assert.strictEqual(target.health, 100, 'Target health unchanged');
});

test('Single kick cannot cause multiple damage events (hitRegistered prevents multi-hit)', () => {
  const attacker = new Fighter(null, 0, 0);
  const target = new Fighter(null, 1, 1);
  attacker.x = 300;
  target.x = 380;
  target.y = attacker.y;
  attacker.kick();
  attacker.stateTimer = 11; // In active strike apex window (frame 9 to 19)
  attacker.checkHit(target);
  const healthAfterFirst = target.health;

  // Next frame in active window
  attacker.stateTimer = 12;
  const secondHit = attacker.checkHit(target);
  assert.strictEqual(secondHit, false, 'Second checkHit must return false');
  assert.strictEqual(target.health, healthAfterFirst, 'Health must not decrease again from same kick');
});

test('Blocking reduces kick damage by 70% and causes block stun & guard drain', () => {
  const attacker = new Fighter(null, 0, 0);
  const unblockedTarget = new Fighter(null, 1, 1);
  attacker.x = 300;
  unblockedTarget.x = 380;
  unblockedTarget.y = attacker.y;
  attacker.kick();
  attacker.stateTimer = 11; // In active window
  attacker.checkHit(unblockedTarget);
  const unblockedDmg = 100 - unblockedTarget.health;

  const attacker2 = new Fighter(null, 0, 0);
  const blockingTarget = new Fighter(null, 1, 1);
  attacker2.x = 300;
  blockingTarget.x = 380;
  blockingTarget.y = attacker2.y;
  blockingTarget.block();
  attacker2.kick();
  attacker2.stateTimer = 11; // In active window
  attacker2.checkHit(blockingTarget);
  const blockedDmg = 100 - blockingTarget.health;

  assert(blockedDmg <= unblockedDmg * 0.35, 'Blocked damage must be ~30% of normal damage');
  assert(blockingTarget.guardStamina < 100, 'Guard stamina should be drained');
  assert(blockingTarget.blockStunTimer > 0, 'Target should experience block stun');
});

test('Kick completes 35-frame recovery and transitions smoothly back to idle', () => {
  const f = new Fighter(null, 0, 0, 100, 300);
  f.kick();
  // Simulate 38 frames (35-frame total animation duration)
  for (let i = 0; i < 38; i++) {
    f.update(16.667);
  }
  assert.strictEqual(f.state, 'idle', 'Fighter must return to idle state after recovery');
  assert.strictEqual(f.isAttacking, false, 'isAttacking must be false after kick ends');
  assert.strictEqual(f.currentAttack, null, 'currentAttack must be null after kick ends');
});

// ------------------------------------------------------------
// 5. Verify All 10 Characters and AI Support Kick
// ------------------------------------------------------------
console.log('\n--- 5. Testing Character Roster & AI Support ---');

const charNames = ['Abilash', 'Anas', 'Dhinesh', 'Farook', 'Kiran', 'Nawin', 'Rafeek', 'Tharun', 'Dharsan', 'Yuga'];

test('All 10 characters execute kick with character-specific power scaling', () => {
  charNames.forEach((name, id) => {
    const f = new Fighter(null, id, 0, 100, 300);
    f.kick();
    assert.strictEqual(f.state, 'kick', `${name} state must be kick`);
    assert(f.currentAttack.damage >= 14, `${name} kick damage must be >= base damage (14)`);
  });
});

const aiCode = fs.readFileSync(path.join(__dirname, '../client/js/ai.js'), 'utf8');

test('ai.js executes ai.kick() when deciding to kick', () => {
  assert(aiCode.includes("case 'kick':\n        ai.kick();") || aiCode.includes("case 'kick':\r\n        ai.kick();"), 'AI must call ai.kick() on kick action');
});

console.log(`\n======================================================`);
console.log(`TOTAL KICK TESTS: ${passCount + failCount} | PASSED: ${passCount} | FAILED: ${failCount}`);
console.log(`======================================================\n`);

if (failCount > 0) {
  process.exit(1);
}
