'use strict';
require('dotenv').config({ quiet: true });
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const http = require('node:http');
const { Server } = require('socket.io');
const game = require('./last-light');
const QRCode = require('qrcode');
const PORT = Number(process.env.PORT || 3000);
const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => { res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'"); next(); });
app.use(express.static(path.join(__dirname, '..', 'public')));
const lanUrls = () => Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => `http://${i.address}:${PORT}`);
app.get('/info', (req, res) => res.json({ urls: lanUrls(), port: PORT }));
app.get('/join-qr', async (req, res) => {
  const code = String(req.query.room || '').toUpperCase();
  if (!/^[A-Z]{4}$/.test(code)) return res.status(400).send('Invalid room');
  const origin = ['localhost','127.0.0.1'].includes(req.hostname) ? (lanUrls()[0] || `http://localhost:${PORT}`) : `${req.protocol}://${req.get('host')}`;
  try { res.type('svg').send(await QRCode.toString(`${origin}/?room=${code}`, { type: 'svg', margin: 2, color: { dark: '#141414', light: '#e8d9b8' } })); }
  catch { res.status(500).send('QR unavailable'); }
});
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 16384 });
const players = new Map();
function broadcast(room) {
  for (const s of io.sockets.sockets.values()) if (s.data.code === room.code) s.emit('state', game.view(room, s.data.playerId));
}
function attach(s, room, player) {
  if (s.data.code) throw new game.GameError('Leave the current session before joining another.');
  const key = `${room.code}:${player.id}`;
  const old = players.get(key);
  players.set(key, s); if (old && old !== s) old.disconnect(true);
  s.data.code = room.code; s.data.playerId = player.id;
  player.connected = true;
  if (!room.players.some(p => p.id === room.hostId && p.connected)) room.hostId = player.id;
  s.emit('joined', { code: room.code, token: player.token, name: player.name });
  broadcast(room);
}
io.on('connection', s => {
  let count = 0, since = Date.now();
  function on(event, handler) {
    s.on(event, (data = {}, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      try {
        if (Date.now() - since > 10000) { count = 0; since = Date.now(); }
        if (++count > 100) throw new game.GameError('Too many actions. Wait a moment.');
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new game.GameError('Invalid request.');
        handler(data); reply({ ok: true });
      } catch (err) { if (!(err instanceof game.GameError)) console.error(err); reply({ ok: false, error: err instanceof game.GameError ? err.message : 'Unable to complete that action.' }); }
    });
  }
  on('create', d => { if (s.data.code) throw new game.GameError('Already in a session.'); const {room, player} = game.createRoom(d.name); attach(s, room, player); });
  on('join', d => { if (s.data.code) throw new game.GameError('Already in a session.'); const {room, player} = game.joinRoom(d.code, d.name); attach(s, room, player); });
  on('resume', d => { const {room, player} = game.resume(d.code, d.token); attach(s, room, player); });
  on('watch', d => { if (s.data.code) throw new game.GameError('Open a separate tab for the shared screen.'); const r = game.getRoom(d.code); s.data.code = r.code; s.emit('state', game.view(r)); });
  on('action', d => { const r = game.getRoom(s.data.code); game.action(r, s.data.playerId, d.type, d); broadcast(r); });
  s.on('disconnect', () => {
    if (!s.data.playerId) return;
    const key = `${s.data.code}:${s.data.playerId}`;
    if (players.get(key) !== s) return;
    players.delete(key);
    const r = game.getRoom(s.data.code); const p = r.players.find(x => x.id === s.data.playerId); p.connected = false; broadcast(r);
    if (r.hostId === p.id) { const timer = setTimeout(() => { if (!p.connected && r.hostId === p.id) { const replacement = r.players.find(x => x.connected && !x.bot); if (replacement) { r.hostId = replacement.id; broadcast(r); } } }, 30000); timer.unref(); }
  });
});
setInterval(() => { for (const r of game.rooms.values()) if (game.tick(r)) broadcast(r); }, 250).unref();
setInterval(game.cleanup, 60000).unref();
server.listen(PORT, () => { console.log(`Last Light — no AI or API keys required\n  This computer: http://localhost:${PORT}`); for (const url of lanUrls()) console.log(`  Phones on Wi-Fi: ${url}`); });
