// HTTP + Socket.IO server. Each socket event maps to one action in rooms.js,
// then every player in the room gets a fresh (personalised) copy of the state.
require('dotenv').config({ quiet: true });
const os = require('os');
const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const rooms = require('./rooms');
const gm = require('./gm');

const PORT = Number(process.env.PORT || 3000);
const app = express();
app.use(express.static(path.join(__dirname, '..', 'public')));
// Lets the lobby show a join link that works on phones (not "localhost").
app.get('/info', (req, res) => res.json({ urls: lanUrls(), port: PORT, gmMode: gm.mode }));
const server = http.createServer(app);
const io = new Server(server);

// playerId -> socket, per room, so we can send each player their own view.
const sockets = new Map(); // `${code}:${playerId}` -> socket

function broadcast(room) {
  for (const p of room.players) {
    const s = sockets.get(`${room.code}:${p.id}`);
    if (s) s.emit('state', rooms.publicState(room, p.id));
  }
}

function attach(socket, room, player) {
  const key = `${room.code}:${player.id}`;
  const old = sockets.get(key);
  if (old && old !== socket) old.disconnect(true); // same player opened a second tab
  sockets.set(key, socket);
  socket.data = { code: room.code, playerId: player.id };
  room.listeners.add(broadcast);
  socket.emit('joined', { code: room.code, token: player.token, playerId: player.id, name: player.name });
  rooms.setConnected(room, player.id, true);
  broadcast(room);
}

io.on('connection', (socket) => {
  // Wraps a handler: reply with an error message instead of crashing, then broadcast.
  const on = (event, fn) => socket.on(event, async (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    try {
      const room = socket.data.code ? rooms.getRoom(socket.data.code) : null;
      const pending = fn(payload, room, socket.data.playerId);
      if (room) broadcast(room);
      await pending;
      reply({ ok: true });
    } catch (err) {
      if (!(err instanceof rooms.GameError)) console.error(err);
      reply({ ok: false, error: err instanceof rooms.GameError ? err.message : 'Something went wrong.' });
    }
  });

  on('create', ({ name }) => {
    const { room, player } = rooms.createRoom(name);
    attach(socket, room, player);
  });
  on('join', ({ code, name }) => {
    const { room, player } = rooms.joinRoom(code, name);
    attach(socket, room, player);
  });
  on('resume', ({ code, token }) => {
    const { room, player } = rooms.resume(code, token);
    attach(socket, room, player);
  });

  on('start', (_, room, pid) => rooms.start(room, pid));
  on('voteWorld', ({ worldId }, room, pid) => rooms.voteWorld(room, pid, worldId));
  on('lockWorld', (_, room, pid) => rooms.lockWorld(room, pid));
  on('quizAnswer', ({ traitId, playerId }, room, pid) => rooms.quizAnswer(room, pid, traitId, playerId));
  on('forceQuiz', (_, room, pid) => rooms.forceQuiz(room, pid));
  on('next', (_, room, pid) => rooms.nextRound(room, pid));
  on('answer', ({ value, reason }, room, pid) => rooms.answer(room, pid, value, reason));
  on('forceReveal', (_, room, pid) => rooms.forceReveal(room, pid));
  on('react', ({ targetId, emoji }, room, pid) => rooms.react(room, pid, targetId, emoji));
  on('revealVoters', (_, room, pid) => rooms.revealVoters(room, pid));
  on('revealNext', (_, room, pid) => rooms.revealNext(room, pid));
  on('playAgain', (_, room, pid) => rooms.playAgain(room, pid));

  socket.on('disconnect', () => {
    const { code, playerId } = socket.data;
    if (!code) return;
    const key = `${code}:${playerId}`;
    if (sockets.get(key) !== socket) return; // replaced by a newer tab
    sockets.delete(key);
    try {
      const room = rooms.getRoom(code);
      rooms.setConnected(room, playerId, false);
      broadcast(room);
    } catch { /* room gone */ }
  });
});

function lanUrls() {
  return Object.values(os.networkInterfaces()).flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => `http://${i.address}:${PORT}`);
}

server.listen(PORT, () => {
  console.log(`\nAlternate Universe running (GM mode: ${gm.mode}${gm.mode === 'live' ? `, model: ${process.env.GM_MODEL || 'claude-sonnet-5'}` : ''})`);
  if (gm.mode === 'live' && !process.env.ANTHROPIC_API_KEY) {
    console.warn('  Warning: GM_MODE=live but ANTHROPIC_API_KEY is not set. Rounds will fall back to mock.');
  }
  console.log(`  This computer:  http://localhost:${PORT}`);
  for (const url of lanUrls()) console.log(`  Phones on Wi-Fi: ${url}`);
  console.log('');
});
