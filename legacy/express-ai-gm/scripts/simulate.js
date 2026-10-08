// Smoke test: starts the server in mock mode and has bot players play a full game.
//   npm run simulate            (4 bots)
//   node scripts/simulate.js 6  (6 bots)
// Exits non-zero if the game doesn't reach the recap.
const { spawn } = require('child_process');
const path = require('path');
const { io } = require('socket.io-client');

const BOTS = Number(process.argv[2] || 4);
const PORT = 3999;
const URL = `http://localhost:${PORT}`;
const NAMES = ['Ana', 'Ben', 'Chi', 'Dev', 'Eli', 'Fay'];
const EMOJIS = ['😂', '😱', '🐍', '❤️'];

const server = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], {
  env: { ...process.env, PORT: String(PORT), GM_MODE: process.env.GM_MODE || 'mock', GM_MOCK_DELAY_MS: '50' },
  stdio: ['ignore', 'pipe', 'inherit'],
});

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const emit = (s, ev, payload) => new Promise((res) => s.emit(ev, payload, res));

function fail(msg) {
  console.error(`\nFAIL: ${msg}`);
  server.kill();
  process.exit(1);
}

async function main() {
  await new Promise((res) => server.stdout.on('data', (d) => d.toString().includes('running') && res()));
  const bots = [];
  let code = null;
  let done = false;
  const seen = new Set();

  for (let i = 0; i < BOTS; i++) {
    const s = io(URL, { forceNew: true });
    const bot = { s, name: NAMES[i], state: null, acted: new Set() };
    bots.push(bot);
    s.on('state', (st) => { bot.state = st; act(bot); });
    await new Promise((res) => s.on('connect', res));
    const res = i === 0 ? await emit(s, 'create', { name: bot.name }) : await emit(s, 'join', { name: bot.name, code });
    if (!res.ok) fail(`${bot.name} could not join: ${res.error}`);
    if (i === 0) code = bot.state.code;
  }

  // Each bot does each thing once per (phase, round) so repeated state pushes don't double-act.
  function once(bot, key, fn) {
    if (bot.acted.has(key)) return;
    bot.acted.add(key);
    setTimeout(fn, 20 + Math.random() * 40);
  }

  function act(bot) {
    const st = bot.state;
    const host = st.hostId === st.you;
    const r = st.round;
    const key = `${st.phase}:${r ? r.number : ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      if (st.phase === 'answering') console.log(`  round ${r.number} [${r.type}] ${r.type === 'secret' ? r.title : r.prompt}`);
      if (st.phase === 'roles') {
        console.log(`  world: ${st.world.name}\n  ${st.cast.intro}`);
        for (const p of st.players) console.log(`   ${p.name}: ${st.traits[p.id].label} (${st.traits[p.id].votes}/${st.traits[p.id].of}) -> ${st.cast.roles[p.id].title}`);
      }
    }
    if (st.phase === 'lobby' && host && st.players.length === BOTS) once(bot, key, () => emit(bot.s, 'start'));
    if (st.phase === 'world') {
      once(bot, key, () => emit(bot.s, 'voteWorld', { worldId: pick(st.worlds).id }));
      if (host && Object.keys(st.worldVotes).length === BOTS) once(bot, `${key}:lock`, () => emit(bot.s, 'lockWorld'));
    }
    if (st.phase === 'quiz') {
      once(bot, key, async () => {
        for (const q of st.quiz.questions) await emit(bot.s, 'quizAnswer', { traitId: q.id, playerId: pick(st.players).id });
      });
    }
    if (st.phase === 'roles' && host) once(bot, key, () => emit(bot.s, 'next'));
    if (st.phase === 'answering') once(bot, key, () => emit(bot.s, 'answer', { value: pick(r.options).id, reason: `${bot.name} had reasons` }));
    if (st.phase === 'reveal' && r.type === 'secret') {
      // Host reveals one player at a time; everyone reacts to each newly revealed decision.
      const latest = r.reveals[r.reveals.length - 1];
      if (latest && latest.playerId !== st.you && latest.answered) once(bot, `${key}:react:${latest.playerId}`, () => emit(bot.s, 'react', { targetId: latest.playerId, emoji: pick(EMOJIS) }));
      if (latest) once(bot, `${key}:log:${latest.playerId}`, () => host && console.log(`    ${st.players.find((p) => p.id === latest.playerId).name}: ${latest.choice} -> ${latest.outcome}`));
      if (host && !r.allRevealed) once(bot, `${key}:reveal:${r.reveals.length}`, () => setTimeout(() => emit(bot.s, 'revealNext'), 150));
      if (host && r.allRevealed) once(bot, `${key}:next`, () => setTimeout(() => emit(bot.s, 'next'), 300));
    } else if (st.phase === 'reveal') {
      // Emoji reactions (ignored by the server until reactions exist).
      if (r.answers) {
        const targets = Object.keys(r.answers).filter((id) => id !== st.you);
        if (targets.length) once(bot, `${key}:react`, () => emit(bot.s, 'react', { targetId: pick(targets), emoji: pick(EMOJIS) }));
      }
      if (host && r.type === 'vote_player' && !r.result.votes) once(bot, `${key}:voters`, () => emit(bot.s, 'revealVoters'));
      if (host) once(bot, `${key}:next`, () => setTimeout(() => emit(bot.s, 'next'), 300));
    }
    if (st.phase === 'recap' && !done) {
      done = true;
      const { stats, gm } = st.recap;
      console.log('\n  RECAP');
      for (const p of st.players) console.log(`   ${p.name}: ${gm.titles[p.id] ? gm.titles[p.id].title : '(no title)'}`);
      for (const a of stats.awards) console.log(`   award ${a.label}: ${a.playerIds.map((id) => st.players.find((p) => p.id === id).name).join(', ')} (${a.detail})`);
      for (const m of gm.memories) console.log(`   memory: ${m}`);
      for (const m of stats.moments) console.log(`   R${m.round}: ${m.outcome}`);
      console.log(`\nPASS: ${BOTS} bots reached the recap (GM source: ${st.gmSource}).`);
      bots.forEach((b) => b.s.close());
      server.kill();
      process.exit(0);
    }
  }

  setTimeout(() => fail('timed out before reaching the recap'), 60000);
}

main().catch((e) => fail(e.stack));
