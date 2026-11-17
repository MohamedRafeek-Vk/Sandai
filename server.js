require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 3000;
const CLIENT_URL = process.env.CLIENT_URL || '*';
const VALID_CHARACTER_IDS = [0, 1, 2, 3, 4, 5, 6, 7];
const MAX_PLAYERS_PER_ROOM = 2;
const RECONNECT_GRACE_MS = 30_000; // 30 seconds
const RATE_LIMIT_WINDOW_MS = 1_000;
const RATE_LIMIT_MAX_ACTIONS = 30;
const MAX_HEALTH = 100;
const MIN_HEALTH = 0;

// ---------------------------------------------------------------------------
// Express + HTTP
// ---------------------------------------------------------------------------
const app = express();
const server = http.createServer(app);

const fs = require('fs');

const corsOrigins = CLIENT_URL === '*' ? '*' : CLIENT_URL.split(',').map(s => s.trim());

app.use(cors({ origin: corsOrigins }));

// Locate client directory across local, Render, Docker, and cloud environments
const possibleClientDirs = [
  path.resolve(__dirname, '..', 'client'),
  path.resolve(__dirname, 'client'),
  path.resolve(process.cwd(), 'client'),
  path.resolve(process.cwd())
];

const resolvedClientDir = possibleClientDirs.find(d => fs.existsSync(path.join(d, 'index.html'))) || path.resolve(__dirname, '..', 'client');
app.use(express.static(resolvedClientDir));

// Explicit root route to ensure index.html is served under all conditions
app.get('/', (req, res) => {
  for (const dir of possibleClientDirs) {
    const indexPath = path.join(dir, 'index.html');
    if (fs.existsSync(indexPath)) {
      return res.sendFile(indexPath);
    }
  }
  res.status(200).send('<!DOCTYPE html><html><head><title>SANDAI</title></head><body><h1>SANDAI Fighting Game</h1><p>Client loading...</p></body></html>');
});

// Health-check endpoints (useful for Render, Vercel, and uptime monitors)
app.get('/health', (_req, res) => res.json({ status: 'ok', game: 'SANDAI' }));
app.get('/api/health', (_req, res) => res.json({ status: 'ok', game: 'SANDAI', timestamp: Date.now() }));

app.get('/api/characters', (_req, res) => {
  res.json({
    characters: [
      { id: 0, name: 'Abilash', style: 'Inferno Fist', power: 7, speed: 5, defense: 5, special: 8, portrait: 'Abilash.webp' },
      { id: 1, name: 'Anas', style: 'Iron Guard', power: 6, speed: 4, defense: 9, special: 6, portrait: 'Anas.webp' },
      { id: 2, name: 'Dhinesh', style: 'Shadow Strike', power: 6, speed: 8, defense: 4, special: 7, portrait: 'Dhinesh.webp' },
      { id: 3, name: 'Farook', style: 'Thunder Claw', power: 8, speed: 6, defense: 5, special: 6, portrait: 'Farook.webp' },
      { id: 4, name: 'Kiran', style: 'Storm Blade', power: 7, speed: 7, defense: 5, special: 6, portrait: 'Kiran.webp' },
      { id: 5, name: 'Nawin', style: 'Venom Fury', power: 5, speed: 6, defense: 6, special: 9, portrait: 'Nawin.webp' },
      { id: 6, name: 'Rafeek', style: 'Titan Grip', power: 9, speed: 3, defense: 8, special: 5, portrait: 'Rafeek.webp' },
      { id: 7, name: 'Tharun', style: 'Divine Wrath', power: 7, speed: 5, defense: 6, special: 7, portrait: 'Tharun.webp' }
    ]
  });
});

// ---------------------------------------------------------------------------
// Socket.IO
// ---------------------------------------------------------------------------
const io = new Server(server, {
  cors: {
    origin: corsOrigins === '*' ? '*' : corsOrigins,
    methods: ['GET', 'POST'],
  },
  transports: ['polling', 'websocket'],
});

// ---------------------------------------------------------------------------
// In-memory state
// ---------------------------------------------------------------------------
const rooms = new Map();          // roomCode → Room
const socketToRoom = new Map();   // socketId  → roomCode
const disconnectTimers = new Map(); // socketId → timeout handle
const rateLimitBuckets = new Map(); // socketId → { count, resetAt }

/**
 * Room shape:
 * {
 *   code: string,
 *   players: [ { id: socketId, characterId: null|number, ready: false } , ... ],
 *   matchState: 'waiting' | 'character-select' | 'playing' | 'finished',
 *   disconnected: Map<socketId, { playerIndex, timer }>
 * }
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code;
  do {
    code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms.has(code));
  return code;
}

function getRoom(code) {
  return rooms.get(code?.toUpperCase?.());
}

function playerInRoom(room, socketId) {
  return room && room.players.some(p => p.id === socketId);
}

function opponentOf(room, socketId) {
  return room.players.find(p => p.id !== socketId);
}

function cleanupRoom(code) {
  const room = rooms.get(code);
  if (!room) return;
  // Clear any lingering disconnect timers
  for (const [, entry] of room.disconnected) {
    clearTimeout(entry.timer);
  }
  rooms.delete(code);
}

function rateLimitOk(socketId) {
  const now = Date.now();
  let bucket = rateLimitBuckets.get(socketId);
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    rateLimitBuckets.set(socketId, bucket);
  }
  bucket.count++;
  return bucket.count <= RATE_LIMIT_MAX_ACTIONS;
}

// ---------------------------------------------------------------------------
// Socket.IO events
// ---------------------------------------------------------------------------
io.on('connection', (socket) => {
  console.log(`[connect] ${socket.id}`);

  // ---- create-room ---------------------------------------------------
  socket.on('create-room', (_, ack) => {
    const code = generateRoomCode();
    const room = {
      code,
      players: [{ id: socket.id, characterId: null, ready: false }],
      matchState: 'waiting',
      disconnected: new Map(),
    };
    rooms.set(code, room);
    socketToRoom.set(socket.id, code);
    socket.join(code);
    const payload = { code, playerIndex: 0 };
    socket.emit('room-created', payload);
    if (typeof ack === 'function') ack(payload);
    console.log(`[create-room] ${socket.id} → ${code}`);
  });

  // ---- join-room -----------------------------------------------------
  socket.on('join-room', (data, ack) => {
    const code = (data?.code || '').toUpperCase();
    const room = getRoom(code);

    if (!room) {
      const err = { error: 'Room not found' };
      socket.emit('error-message', err);
      if (typeof ack === 'function') ack(err);
      return;
    }

    // Check for reconnection first
    if (room.disconnected.has(socket.id)) {
      // Shouldn't normally happen (new socket id), but handle gracefully
    }

    if (room.players.length >= MAX_PLAYERS_PER_ROOM) {
      const err = { error: 'Room is full' };
      socket.emit('error-message', err);
      if (typeof ack === 'function') ack(err);
      return;
    }

    const playerIndex = room.players.length;
    room.players.push({ id: socket.id, characterId: null, ready: false });
    socketToRoom.set(socket.id, code);
    socket.join(code);

    if (room.matchState === 'waiting') {
      room.matchState = 'character-select';
    }

    const joinPayload = { code, playerIndex, players: room.players.length };
    socket.emit('room-joined', joinPayload);
    socket.to(code).emit('player-joined', { playerIndex, playerId: socket.id });
    if (typeof ack === 'function') ack(joinPayload);
    console.log(`[join-room] ${socket.id} → ${code} (player ${playerIndex})`);
  });

  // ---- select-character ----------------------------------------------
  socket.on('select-character', (data) => {
    const room = getRoom(data?.roomCode);
    if (!room || !playerInRoom(room, socket.id)) {
      return socket.emit('error-message', { error: 'Invalid room' });
    }

    const characterId = Number(data.characterId);
    if (!VALID_CHARACTER_IDS.includes(characterId)) {
      return socket.emit('error-message', { error: 'Invalid character ID' });
    }

    const player = room.players.find(p => p.id === socket.id);
    player.characterId = characterId;

    io.to(room.code).emit('character-selected', {
      playerId: socket.id,
      playerIndex: room.players.indexOf(player),
      characterId,
    });
  });

  // ---- player-ready --------------------------------------------------
  socket.on('player-ready', (data) => {
    const room = getRoom(data?.roomCode);
    if (!room || !playerInRoom(room, socket.id)) {
      return socket.emit('error-message', { error: 'Invalid room' });
    }

    const player = room.players.find(p => p.id === socket.id);
    player.ready = true;

    io.to(room.code).emit('player-ready-ack', {
      playerId: socket.id,
      playerIndex: room.players.indexOf(player),
    });

    // Check if all players ready
    if (room.players.length === MAX_PLAYERS_PER_ROOM && room.players.every(p => p.ready)) {
      room.matchState = 'playing';
      io.to(room.code).emit('match-start', {
        players: room.players.map((p, i) => ({
          playerIndex: i,
          characterId: p.characterId,
        })),
      });
      console.log(`[match-start] Room ${room.code}`);
    }
  });

  // ---- game-action ---------------------------------------------------
  socket.on('game-action', (data) => {
    if (!rateLimitOk(socket.id)) {
      return socket.emit('error-message', { error: 'Rate limited' });
    }

    const room = getRoom(data?.roomCode);
    if (!room || !playerInRoom(room, socket.id)) {
      return socket.emit('error-message', { error: 'Invalid room' });
    }
    if (room.matchState !== 'playing') return;

    const playerIndex = room.players.findIndex(p => p.id === socket.id);
    socket.to(room.code).emit('game-action', {
      playerIndex,
      action: data.action,
      timestamp: Date.now(),
    });
  });

  // ---- game-state (host authoritative) -------------------------------
  socket.on('game-state', (data) => {
    const room = getRoom(data?.roomCode);
    if (!room || !playerInRoom(room, socket.id)) {
      return socket.emit('error-message', { error: 'Invalid room' });
    }
    if (room.matchState !== 'playing') return;

    // Host is player 0
    const playerIndex = room.players.findIndex(p => p.id === socket.id);
    if (playerIndex !== 0) return; // only host may sync state

    const state = data.state;
    // Validate health bounds if provided
    if (state) {
      if (state.player1Health !== undefined) {
        state.player1Health = Math.max(MIN_HEALTH, Math.min(MAX_HEALTH, Number(state.player1Health)));
      }
      if (state.player2Health !== undefined) {
        state.player2Health = Math.max(MIN_HEALTH, Math.min(MAX_HEALTH, Number(state.player2Health)));
      }
    }

    socket.to(room.code).emit('game-state', {
      state,
      timestamp: Date.now(),
    });
  });

  // ---- match-result --------------------------------------------------
  socket.on('match-result', (data) => {
    const room = getRoom(data?.roomCode);
    if (!room || !playerInRoom(room, socket.id)) {
      return socket.emit('error-message', { error: 'Invalid room' });
    }

    // Only host can declare result
    const playerIndex = room.players.findIndex(p => p.id === socket.id);
    if (playerIndex !== 0) return;

    const winner = Number(data.winner);
    if (![0, 1].includes(winner) && winner !== -1) return; // -1 = draw

    room.matchState = 'finished';
    io.to(room.code).emit('match-result', { winner, timestamp: Date.now() });
    console.log(`[match-result] Room ${room.code} winner: player ${winner}`);
  });

  // ---- leave-room ----------------------------------------------------
  socket.on('leave-room', (data) => {
    const room = getRoom(data?.roomCode);
    if (!room || !playerInRoom(room, socket.id)) return;

    const leavingIndex = room.players.findIndex(p => p.id === socket.id);
    room.players.splice(leavingIndex, 1);
    socketToRoom.delete(socket.id);
    socket.leave(room.code);

    socket.to(room.code).emit('player-left', { playerIndex: leavingIndex });

    if (room.players.length === 0 && room.disconnected.size === 0) {
      cleanupRoom(room.code);
      console.log(`[cleanup] Room ${room.code} removed (empty)`);
    } else {
      // Reset room to waiting if match was in progress
      room.matchState = 'waiting';
      room.players.forEach(p => { p.ready = false; });
    }
  });

  // ---- disconnect ----------------------------------------------------
  socket.on('disconnect', () => {
    console.log(`[disconnect] ${socket.id}`);
    const roomCode = socketToRoom.get(socket.id);
    if (!roomCode) return;

    const room = getRoom(roomCode);
    if (!room) { socketToRoom.delete(socket.id); return; }

    const playerIndex = room.players.findIndex(p => p.id === socket.id);
    if (playerIndex === -1) { socketToRoom.delete(socket.id); return; }

    // Notify opponent
    socket.to(room.code).emit('player-disconnected', { playerIndex });

    // Start reconnection grace period
    const timer = setTimeout(() => {
      // Grace period expired — player abandoned
      room.disconnected.delete(socket.id);
      room.players.splice(playerIndex, 1);
      socketToRoom.delete(socket.id);
      rateLimitBuckets.delete(socket.id);

      io.to(room.code).emit('player-abandoned', { playerIndex });

      // Declare remaining player winner if match was in progress
      if (room.matchState === 'playing' && room.players.length === 1) {
        room.matchState = 'finished';
        io.to(room.code).emit('match-result', { winner: 0, reason: 'opponent-abandoned', timestamp: Date.now() });
      }

      if (room.players.length === 0 && room.disconnected.size === 0) {
        cleanupRoom(room.code);
        console.log(`[cleanup] Room ${room.code} removed (abandoned)`);
      }
    }, RECONNECT_GRACE_MS);

    room.disconnected.set(socket.id, { playerIndex, timer });
    disconnectTimers.set(socket.id, { roomCode, timer });
  });

  // ---- reconnect (via middleware / new connection identifying itself) --
  socket.on('reconnect-room', (data) => {
    const code = (data?.roomCode || '').toUpperCase();
    const oldSocketId = data?.oldSocketId;
    const room = getRoom(code);

    if (!room || !oldSocketId) {
      return socket.emit('error-message', { error: 'Invalid reconnection' });
    }

    const entry = room.disconnected.get(oldSocketId);
    if (!entry) {
      return socket.emit('error-message', { error: 'No pending reconnection for this player' });
    }

    // Clear the timeout
    clearTimeout(entry.timer);
    room.disconnected.delete(oldSocketId);
    disconnectTimers.delete(oldSocketId);

    // Swap the socket id in room state
    const player = room.players[entry.playerIndex];
    if (player) {
      player.id = socket.id;
    }
    socketToRoom.delete(oldSocketId);
    socketToRoom.set(socket.id, code);
    socket.join(code);

    socket.emit('reconnected', {
      code,
      playerIndex: entry.playerIndex,
      matchState: room.matchState,
      players: room.players.map((p, i) => ({
        playerIndex: i,
        characterId: p.characterId,
        ready: p.ready,
      })),
    });

    socket.to(code).emit('player-reconnected', { playerIndex: entry.playerIndex });
    console.log(`[reconnect] ${socket.id} restored to room ${code} as player ${entry.playerIndex}`);
  });
});

// ---------------------------------------------------------------------------
// Start (Only when executed directly, not when imported as a serverless module)
// ---------------------------------------------------------------------------
if (require.main === module) {
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[SANDAI Server WARN] Port ${PORT} is in use.`);
      const fallbackPort = PORT + 1;
      console.log(`[SANDAI Server] Attempting fallback to port ${fallbackPort}...`);
      setTimeout(() => {
        server.listen(fallbackPort, () => {
          console.log(`[SANDAI Server] listening on fallback port ${fallbackPort}`);
        });
      }, 500);
    } else {
      console.error('[SANDAI Server Error]', err);
    }
  });

  server.listen(PORT, () => {
    console.log(`[SANDAI Server] listening on port ${PORT}`);
    console.log(`[SANDAI Server] CORS origin: ${CLIENT_URL}`);
    console.log(`[SANDAI Server] Transports: polling, websocket`);
  });
}

// Export app directly for Vercel Express compatibility, attaching server & io
module.exports = app;
module.exports.app = app;
module.exports.server = server;
module.exports.io = io;
