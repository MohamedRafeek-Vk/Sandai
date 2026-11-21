// ============================================================
// SANDAI — Stage 3 Real-Time Custom Room Multiplayer Test Suite
// Verifies all real-time Socket.IO multiplayer workflows:
// 1. Connection & Ping/Pong Latency RTT Check
// 2. Room Creation (6-character code, Host slot assigned)
// 3. Room Joining (Guest slot assigned, shared state)
// 4. Room Rejection (Room full when 3rd player attempts join)
// 5. Arena Selection by Host & synchronized ready reset
// 6. Character Selection & synchronized ready reset
// 7. Ready State Synchronization & Synchronized Match Start
// 8. Real-time Combat Action Broadcast & Whitelist Validation
// 9. Rematch Workflow (request-rematch -> rematch-requested -> rematch-start)
// 10. Opponent Disconnect Notification & 30s Grace Period
// ============================================================

const io = require('socket.io-client');
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

async function runStage3MultiplayerTests() {
  console.log('=== SANDAI STAGE 3: REAL-TIME MULTIPLAYER AUTOMATED TEST SUITE ===\n');

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
  console.log('Target Server URL:', SERVER_URL, '\n');

  const socketHost = io(SERVER_URL, { transports: ['websocket'], forceNew: true });
  const socketGuest = io(SERVER_URL, { transports: ['websocket'], forceNew: true });
  const socketThird = io(SERVER_URL, { transports: ['websocket'], forceNew: true });

  let roomCode = null;

  // 1. Ping / Pong Latency Check
  console.log('--- 1. Testing Ping / Pong Latency Check ---');
  await new Promise((resolve, reject) => {
    socketHost.on('connect', () => {
      const startT = Date.now();
      socketHost.emit('ping-check', { clientTs: startT });
    });
    socketHost.on('pong-check', (data) => {
      assert(typeof data.clientTs === 'number', 'pong-check returned valid timestamp');
      const rtt = Date.now() - data.clientTs;
      assert(rtt >= 0 && rtt < 1000, `RTT latency measured: ${rtt}ms`);
      resolve();
    });
    setTimeout(() => reject(new Error('Ping timeout')), 4000);
  });

  // 2. Room Creation
  console.log('\n--- 2. Testing Custom Room Creation ---');
  await new Promise((resolve, reject) => {
    socketHost.emit('create-room');
    socketHost.on('room-created', (data) => {
      roomCode = data.code;
      assert(typeof roomCode === 'string' && roomCode.length === 6, `Room created with 6-char code: "${roomCode}"`);
      assert(data.playerIndex === 0, 'Room creator assigned playerIndex: 0 (Host)');
      assert(data.arena === 'mountain', 'Default arena is "mountain"');
      resolve();
    });
    setTimeout(() => reject(new Error('Create room timeout')), 4000);
  });

  // 3. Room Joining
  console.log('\n--- 3. Testing Room Joining (Guest) ---');
  await new Promise((resolve, reject) => {
    function doJoin() {
      socketGuest.emit('join-room', { code: roomCode });
    }
    socketGuest.on('room-joined', (data) => {
      assert(data.code === roomCode, `Guest joined correct room code: "${data.code}"`);
      assert(data.playerIndex === 1, 'Guest assigned playerIndex: 1');
      assert(data.arena === 'mountain', 'Guest receives synchronized arena');
      resolve();
    });
    if (socketGuest.connected) doJoin();
    else socketGuest.once('connect', doJoin);
    setTimeout(() => reject(new Error('Join room timeout')), 4000);
  });

  // 4. Room Rejection for 3rd Player
  console.log('\n--- 4. Testing Room Full Rejection ---');
  await new Promise((resolve, reject) => {
    function doJoinThird() {
      socketThird.emit('join-room', { code: roomCode });
    }
    socketThird.on('error-message', (data) => {
      assert(data.error.includes('full') || data.error.includes('not found') || data.error.includes('progress'),
        `3rd player rejected properly: "${data.error}"`);
      resolve();
    });
    if (socketThird.connected) doJoinThird();
    else socketThird.once('connect', doJoinThird);
    setTimeout(() => reject(new Error('Room full rejection timeout')), 4000);
  });

  // 5. Arena Selection by Host & Ready Reset
  console.log('\n--- 5. Testing Arena Selection by Host ---');
  await new Promise((resolve, reject) => {
    socketGuest.on('arena-selected', (data) => {
      assert(data.arena === 'nightcity', `Guest received updated arena: "${data.arena}"`);
      assert(data.resetReady === true, 'Arena change flagged resetReady: true');
      resolve();
    });
    socketHost.emit('select-arena', { roomCode, arena: 'nightcity' });
    setTimeout(() => reject(new Error('Arena select timeout')), 4000);
  });

  // 6. Character Selection & Ready Reset
  console.log('\n--- 6. Testing Character Selection & Ready Reset ---');
  await new Promise((resolve, reject) => {
    let receivedHost = false;
    let receivedGuest = false;

    socketGuest.on('character-selected', (data) => {
      if (data.playerIndex === 0 && data.characterId === 2) {
        assert(data.characterId === 2, 'Host selected characterId 2 (Dhinesh) broadcasted');
        assert(data.ready === false, 'Host selection resets ready state');
        receivedHost = true;
      }
      if (data.playerIndex === 1 && data.characterId === 5) {
        assert(data.characterId === 5, 'Guest selected characterId 5 (Nawin) broadcasted');
        assert(data.ready === false, 'Guest selection resets ready state');
        receivedGuest = true;
      }
      if (receivedHost && receivedGuest) resolve();
    });

    socketHost.emit('select-character', { roomCode, characterId: 2 });
    socketGuest.emit('select-character', { roomCode, characterId: 5 });
    setTimeout(() => reject(new Error('Character select timeout')), 4000);
  });

  // 7. Ready Toggles & Synchronized Match Start
  console.log('\n--- 7. Testing Ready Toggles & Synchronized Match Start ---');
  await new Promise((resolve, reject) => {
    socketHost.on('match-start', (data) => {
      assert(data.arena === 'nightcity', `Match start synchronized arena: "${data.arena}"`);
      const p1 = data.players.find(p => p.playerIndex === 0);
      const p2 = data.players.find(p => p.playerIndex === 1);
      assert(p1 && p1.characterId === 2, 'Host character is Dhinesh (ID 2)');
      assert(p2 && p2.characterId === 5, 'Guest character is Nawin (ID 5)');
      resolve();
    });
    socketHost.emit('player-ready', { roomCode, ready: true });
    socketGuest.emit('player-ready', { roomCode, ready: true });
    setTimeout(() => reject(new Error('Match start timeout')), 4000);
  });

  // 8. Real-time Combat Action Broadcast & Whitelist Validation
  console.log('\n--- 8. Testing Real-time Combat Action Synchronization ---');
  await new Promise((resolve, reject) => {
    socketGuest.on('game-action', (data) => {
      assert(data.action === 'special', `Guest received valid game action: "${data.action}"`);
      assert(data.playerIndex === 0, 'Game action attributed to correct playerIndex: 0');
      resolve();
    });
    // Send valid action
    socketHost.emit('game-action', { roomCode, action: 'special', details: { extra: true } });
    setTimeout(() => reject(new Error('Game action timeout')), 4000);
  });

  // Test invalid action rejection by server whitelist
  await new Promise((resolve) => {
    let receivedInvalid = false;
    const testTimeout = setTimeout(() => {
      assert(!receivedInvalid, 'Invalid action "malicious_hack" correctly filtered out and NOT broadcasted');
      resolve();
    }, 500);

    socketGuest.once('game-action', (data) => {
      if (data.action === 'malicious_hack') {
        receivedInvalid = true;
        clearTimeout(testTimeout);
        assert(false, 'Invalid action should not be broadcasted');
        resolve();
      }
    });
    socketHost.emit('game-action', { roomCode, action: 'malicious_hack' });
  });

  // 9. Rematch Workflow
  console.log('\n--- 9. Testing Rematch Workflow ---');
  await new Promise((resolve, reject) => {
    socketGuest.on('rematch-requested', (data) => {
      assert(data.playerIndex === 0, 'Guest received rematch request notification from Host');
      // Guest accepts rematch
      socketGuest.emit('request-rematch', { roomCode });
    });

    socketHost.on('rematch-start', (data) => {
      assert(data.arena === 'nightcity', 'Both players accepted rematch -> rematch-start triggered!');
      resolve();
    });

    socketHost.emit('request-rematch', { roomCode });
    setTimeout(() => reject(new Error('Rematch workflow timeout')), 4000);
  });

  // 10. Disconnect Notification & 30s Grace Period
  console.log('\n--- 10. Testing Disconnect Notification & Grace Period ---');
  await new Promise((resolve, reject) => {
    socketHost.on('player-disconnected', (data) => {
      assert(data.playerIndex === 1, 'Host notified of Guest disconnect (playerIndex 1)');
      assert(data.graceMs === 30000, `Grace period communicated: ${data.graceMs / 1000}s`);
      resolve();
    });
    socketGuest.disconnect();
    setTimeout(() => reject(new Error('Disconnect event timeout')), 4000);
  });

  console.log('\n======================================================');
  console.log(`TOTAL MULTIPLAYER TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('======================================================\n');

  socketHost.disconnect();
  socketThird.disconnect();

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runStage3MultiplayerTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
