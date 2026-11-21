// ============================================================
// SANDAI — Online Multiplayer Custom Rooms & Mobile Gameplay Tests
// Verifies:
// 1. Room Creation with non-null characterId and 6-char code
// 2. Room Joining with Guest slot (P2)
// 3. Independent Character Selection for P1 and P2
// 4. Host-controlled Start Match validation (unauthorized / not ready rejection)
// 5. Host-controlled Start Match execution when both ready
// 6. Leave Room handling and room reset
// 7. Whitelisted combat actions (crouch, stopCrouch, dodge)
// 8. Mobile touch controls structure (Left D-Pad, Right Actions)
// 9. Mobile landscape orientation prompt & dismiss button
// 10. Server connection modal and URL resolver logic
// ============================================================

const io = require('socket.io-client');
const fs = require('fs');
const path = require('path');
const { server } = require('./server.js');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    console.log('  [PASS]', msg);
    passed++;
  } else {
    console.error('  [FAIL]', msg);
    failed++;
  }
}

async function runLobbyAndMobileTests() {
  console.log('=== SANDAI ONLINE MULTIPLAYER & MOBILE TEST SUITE ===\n');

  let port = 3000;
  try {
    await new Promise((resolve, reject) => {
      server.listen(0, () => {
        port = server.address().port;
        resolve();
      });
      server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') resolve();
        else reject(err);
      });
    });
  } catch (e) {}

  const SERVER_URL = `http://localhost:${port}`;
  console.log('Server Endpoint:', SERVER_URL, '\n');

  const socketHost = io(SERVER_URL, { transports: ['websocket'], forceNew: true });
  const socketGuest = io(SERVER_URL, { transports: ['websocket'], forceNew: true });

  let roomCode = null;

  // 1. Custom Room Creation
  console.log('--- 1. Testing Room Creation with Default Character ID ---');
  await new Promise((resolve, reject) => {
    socketHost.on('connect', () => {
      socketHost.emit('create-room', { characterId: 0 });
    });
    socketHost.on('room-created', (data) => {
      roomCode = data.code;
      assert(typeof roomCode === 'string' && roomCode.length === 6, `Room code generated: "${roomCode}" (6 characters)`);
      assert(data.playerIndex === 0, 'Host assigned playerIndex 0');
      assert(data.characterId === 0, 'Host assigned initial characterId 0 (Abilash, never null)');
      assert(Array.isArray(data.players) && data.players[0].characterId === 0, 'Room players list contains Host with valid characterId');
      resolve();
    });
    setTimeout(() => reject(new Error('Create room timeout')), 4000);
  });

  // 2. Guest Joins Room
  console.log('\n--- 2. Testing Room Joining by Second Player (Guest) ---');
  await new Promise((resolve, reject) => {
    function doJoin() {
      socketGuest.emit('join-room', { code: roomCode, characterId: 1 });
    }
    socketGuest.on('room-joined', (data) => {
      assert(data.code === roomCode, `Guest joined room "${data.code}"`);
      assert(data.playerIndex === 1, 'Guest assigned playerIndex 1 (Slot 2)');
      assert(data.players.length === 2, 'Room now has 2 players');
      assert(data.players[1].characterId === 1, 'Guest assigned initial characterId 1 (Anas, never null)');
      resolve();
    });
    if (socketGuest.connected) doJoin();
    else socketGuest.once('connect', doJoin);
    setTimeout(() => reject(new Error('Join room timeout')), 4000);
  });

  // 3. Independent Character Selection
  console.log('\n--- 3. Testing Independent Character Selection (P1 & P2) ---');
  await new Promise((resolve, reject) => {
    let hostSelected = false;
    let guestSelected = false;

    socketGuest.on('character-selected', (data) => {
      if (data.playerIndex === 0) {
        assert(data.characterId === 3, 'Host independently selected characterId 3 (Farook)');
        assert(data.ready === false, 'Character selection reset ready state');
        hostSelected = true;
      }
      if (data.playerIndex === 1) {
        assert(data.characterId === 6, 'Guest independently selected characterId 6 (Rafeek)');
        assert(data.ready === false, 'Character selection reset ready state');
        guestSelected = true;
      }
      if (hostSelected && guestSelected) resolve();
    });

    socketHost.emit('select-character', { roomCode, characterId: 3 });
    socketGuest.emit('select-character', { roomCode, characterId: 6 });
    setTimeout(() => reject(new Error('Character selection timeout')), 4000);
  });

  // 4. Host-Controlled Start Match: Rejection when not ready
  console.log('\n--- 4. Testing Start Match Security & Readiness Checks ---');
  await new Promise((resolve) => {
    socketGuest.once('error-message', (err) => {
      assert(err.error.includes('host'), `Guest cannot start match: "${err.error}"`);
      resolve();
    });
    // Guest attempts to start match -> Rejected!
    socketGuest.emit('start-match', { roomCode });
  });

  await new Promise((resolve) => {
    socketHost.once('error-message', (err) => {
      assert(err.error.includes('ready'), `Host cannot start match before both ready: "${err.error}"`);
      resolve();
    });
    // Host attempts to start match before ready -> Rejected!
    socketHost.emit('start-match', { roomCode });
  });

  // 5. Ready Declaration & Host Start Match Execution
  console.log('\n--- 5. Testing Ready Declarations & Host Start Match Execution ---');
  await new Promise((resolve, reject) => {
    let bothReadyNotified = false;

    socketHost.on('both-players-ready', (data) => {
      if (data.canStart) {
        bothReadyNotified = true;
        assert(data.canStart === true, 'Server broadcasted both-players-ready (canStart: true)');
        // Host now triggers the authorized start-match!
        socketHost.emit('start-match', { roomCode });
      }
    });

    socketHost.on('match-start', (data) => {
      assert(data.arena === 'mountain', `Match launched with synchronized arena: ${data.arena}`);
      const p1 = data.players.find(p => p.playerIndex === 0);
      const p2 = data.players.find(p => p.playerIndex === 1);
      assert(p1 && p1.characterId === 3, 'P1 fighter confirmed as Farook (ID 3)');
      assert(p2 && p2.characterId === 6, 'P2 fighter confirmed as Rafeek (ID 6)');
      resolve();
    });

    socketHost.emit('player-ready', { roomCode, ready: true, autoStart: false });
    socketGuest.emit('player-ready', { roomCode, ready: true, autoStart: false });
    setTimeout(() => reject(new Error('Start match timeout')), 4000);
  });

  // 6. Combat Actions Whitelist (crouch, stopCrouch, dodge)
  console.log('\n--- 6. Testing Whitelisted Combat Actions (Crouch & Dodge) ---');
  await new Promise((resolve, reject) => {
    const received = [];
    socketGuest.on('game-action', (data) => {
      received.push(data.action);
      if (received.includes('crouch') && received.includes('dodge') && received.includes('stopCrouch')) {
        assert(true, 'Server successfully synchronized crouch, stopCrouch, and dodge combat actions');
        resolve();
      }
    });

    socketHost.emit('game-action', { roomCode, action: 'crouch' });
    socketHost.emit('game-action', { roomCode, action: 'stopCrouch' });
    socketHost.emit('game-action', { roomCode, action: 'dodge' });
    setTimeout(() => reject(new Error('Combat action timeout')), 4000);
  });

  // 7. Leave Room Workflow
  console.log('\n--- 7. Testing Leave Room Workflow ---');
  await new Promise((resolve, reject) => {
    socketHost.on('player-left', (data) => {
      assert(data.playerIndex === 1, 'Host notified that Guest (playerIndex 1) left the room');
      assert(Array.isArray(data.players) && data.players.length === 1, 'Remaining players count is 1 (Host)');
      resolve();
    });
    socketGuest.emit('leave-room', { roomCode });
    setTimeout(() => reject(new Error('Leave room timeout')), 4000);
  });

  // 8. Mobile Touch Controls HTML/JS Inspection
  console.log('\n--- 8. Testing Mobile Touch Controls Structure & Keybindings ---');
  const controlsSrc = fs.readFileSync(path.resolve(__dirname, '..', 'client', 'js', 'controls.js'), 'utf8');
  assert(controlsSrc.includes('btn-dpad-up') && controlsSrc.includes('btn-dpad-down'), 'Left D-Pad has Up (Jump) and Down (Crouch) buttons');
  assert(controlsSrc.includes('btn-touch-dodge') && controlsSrc.includes('💨'), 'Right panel has Dodge evasion button (💨)');
  assert(controlsSrc.includes('pointerdown') && controlsSrc.includes('pointerup'), 'Controls engine implements Pointer Events for multi-touch');
  assert(controlsSrc.includes('crouch') && controlsSrc.includes('dodge'), 'Input state tracks crouch and dodge');

  // 9. Mobile Landscape Prompt & HTML Inspection
  console.log('\n--- 9. Testing Landscape Orientation Prompt & CSS ---');
  const indexHtml = fs.readFileSync(path.resolve(__dirname, '..', 'client', 'index.html'), 'utf8');
  assert(indexHtml.includes('id="landscape-prompt"'), 'HTML contains #landscape-prompt overlay');
  assert(indexHtml.includes('id="btn-dismiss-rotate"'), 'HTML contains dismiss button (#btn-dismiss-rotate)');
  assert(indexHtml.includes('id="btn-start-match"'), 'HTML contains Host Start Match button (#btn-start-match)');
  assert(indexHtml.includes('id="modal-server-config"'), 'HTML contains Server Configuration Modal (#modal-server-config)');

  const stylesCss = fs.readFileSync(path.resolve(__dirname, '..', 'client', 'css', 'styles.css'), 'utf8');
  assert(stylesCss.includes('.landscape-prompt-overlay'), 'CSS styles .landscape-prompt-overlay');
  assert(stylesCss.includes('rotatePhone'), 'CSS contains phone rotation animation (@keyframes rotatePhone)');
  assert(stylesCss.includes('.btn-start-match'), 'CSS styles .btn-start-match');
  assert(stylesCss.includes('.btn-touch-dodge'), 'CSS styles .btn-touch-dodge');

  // 10. Server URL Resolver & Presets
  console.log('\n--- 10. Testing Backend Server Endpoint Resolution ---');
  const appSrc = fs.readFileSync(path.resolve(__dirname, '..', 'client', 'js', 'app.js'), 'utf8');
  assert(appSrc.includes('resolveServerUrl'), 'app.js implements resolveServerUrl()');
  assert(appSrc.includes('sandai-backend.onrender.com'), 'app.js contains Render production backend default for Vercel');
  assert(appSrc.includes('copyToClipboard'), 'app.js implements robust copyToClipboard with fallbacks');

  console.log('\n======================================================');
  console.log(`TOTAL LOBBY & MOBILE TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('======================================================\n');

  socketHost.disconnect();
  socketGuest.disconnect();

  if (failed > 0) process.exit(1);
  else process.exit(0);
}

runLobbyAndMobileTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
