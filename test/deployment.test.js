'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Server, get } = require('node:http');
const { once } = require('node:events');
const { io } = require('socket.io-client');
const QRCode = require('qrcode');

test('cloud entrypoint exports HTTP and WebSocket handling without opening a port', async t => {
  const previous = process.env.VERCEL;
  process.env.VERCEL = '1';
  const server = require('../server');
  t.after(() => {
    if (previous === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previous;
  });
  assert.ok(server instanceof Server);
  assert.equal(server.listening, false);
  assert.equal(require('../server/index'), server, 'legacy entrypoint uses the same server');
  assert.ok(server.listenerCount('upgrade') > 0, 'Socket.IO upgrade handler is exported');
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;

  await t.test('serves the game, assets, and Socket.IO browser client', async () => {
    for (const [route, expected] of [
      ['/', /THE GATHERING|Last Light|The Gathering/],
      ['/app.js', /transports: \['websocket'\]/],
      ['/socket.io/socket.io.js', /Socket.IO/],
    ]) {
      const response = await fetch(base + route);
      assert.equal(response.status, 200, route);
      assert.match(await response.text(), expected, route);
    }
  });

  await t.test('public QR join links preserve HTTPS behind the deployment proxy', async () => {
    const original = QRCode.toString;
    QRCode.toString = async value => value;
    try {
      const response = await new Promise((resolve, reject) => {
        get(base + '/join-qr?room=ABCD', {
          headers: { host: 'rain-house.example', 'x-forwarded-proto': 'https' },
        }, res => {
          let body = '';
          res.setEncoding('utf8');
          res.on('data', chunk => { body += chunk; });
          res.on('end', () => resolve({ status: res.statusCode, body }));
          res.on('error', reject);
        }).on('error', reject);
      });
      assert.equal(response.status, 200);
      assert.equal(response.body, 'https://rain-house.example/?room=ABCD');
    } finally { QRCode.toString = original; }
  });

  await t.test('accepts a real WebSocket connection and creates a room', async () => {
    const socket = io(base, {
      transports: ['websocket'], reconnection: false, timeout: 2000,
    });
    try {
      await new Promise((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('connect_error', reject);
      });
      const joined = once(socket, 'joined');
      const result = await socket.timeout(2000).emitWithAck('create', { name: 'Deploy check' });
      assert.equal(result.ok, true);
      const [credential] = await joined;
      assert.match(credential.code, /^[A-Z]{4}$/);
      assert.ok(credential.token);
    } finally { socket.disconnect(); }
  });
});
