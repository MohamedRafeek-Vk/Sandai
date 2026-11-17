const io = require('socket.io-client');

async function testMultiplayer() {
  const SERVER_URL = 'http://localhost:3000';
  console.log('Testing Socket.IO multiplayer at', SERVER_URL);

  const socket1 = io(SERVER_URL, { transports: ['websocket'], forceNew: true });
  const socket2 = io(SERVER_URL, { transports: ['websocket'], forceNew: true });

  let roomCode = null;

  await new Promise((resolve, reject) => {
    socket1.on('connect', () => {
      console.log('Socket 1 connected:', socket1.id);
      socket1.emit('create-room');
    });

    socket1.on('room-created', (data) => {
      console.log('Room created with code:', data.code);
      roomCode = data.code;
      resolve();
    });

    setTimeout(() => reject(new Error('Create room timeout')), 4000);
  });

  await new Promise((resolve, reject) => {
    function tryJoin() {
      if (socket2.connected) {
        console.log('Socket 2 connected:', socket2.id);
        socket2.emit('join-room', { code: roomCode });
      } else {
        socket2.once('connect', () => {
          console.log('Socket 2 connected on event:', socket2.id);
          socket2.emit('join-room', { code: roomCode });
        });
      }
    }

    socket2.on('room-joined', (data) => {
      console.log('Socket 2 joined room:', data.code);
      resolve();
    });

    tryJoin();
    setTimeout(() => reject(new Error('Join room timeout')), 4000);
  });

  // Both select characters
  await new Promise((resolve, reject) => {
    let count = 0;
    socket1.on('character-selected', (data) => {
      console.log('Char selected broadcast on socket 1:', data);
      count++;
      if (count === 2) resolve();
    });
    socket1.emit('select-character', { roomCode, characterId: 0 });
    socket2.emit('select-character', { roomCode, characterId: 3 });
    setTimeout(() => reject(new Error('Char select timeout')), 4000);
  });

  // Ready and match start
  await new Promise((resolve, reject) => {
    socket1.on('match-start', (data) => {
      console.log('Match start event received on socket 1:', data);
      resolve();
    });
    socket1.emit('player-ready', { roomCode });
    socket2.emit('player-ready', { roomCode });
    setTimeout(() => reject(new Error('Match start timeout')), 4000);
  });

  // Test game action sync
  await new Promise((resolve, reject) => {
    socket2.on('game-action', (data) => {
      console.log('Socket 2 received action from socket 1:', data);
      if (data.action === 'punch') resolve();
    });
    socket1.emit('game-action', { roomCode, action: 'punch' });
    setTimeout(() => reject(new Error('Game action timeout')), 4000);
  });

  console.log('ALL SOCKET.IO MULTIPLAYER TESTS PASSED SUCCESSFULLY!');
  socket1.disconnect();
  socket2.disconnect();
  process.exit(0);
}

testMultiplayer().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
