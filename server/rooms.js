// In-memory rooms and the game's phase machine. This is the only file that changes game state.
//
// Phases: lobby -> world -> quiz -> loading -> roles -> (answering -> reveal) x N -> recap
const crypto = require('crypto');
const config = require('./config');
const gm = require('./gm');
const { computeResult, describeRound, describeSecret } = require('./results');
const { computeStats } = require('./recap');

const rooms = new Map();
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I/O, easy to read aloud
// How long a disconnected host keeps the crown, so a reload or a sleeping phone doesn't cost it.
const HOST_GRACE_MS = Number(process.env.HOST_GRACE_MS ?? 30000);

class GameError extends Error {}
const bad = (msg) => { throw new GameError(msg); };

function newCode() {
  let code;
  do {
    code = Array.from({ length: 4 }, () => CODE_LETTERS[crypto.randomInt(CODE_LETTERS.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function cleanName(name) {
  const n = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 20);
  if (!n) bad('Please enter a name.');
  return n;
}

// ---------- joining ----------

function createRoom(name) {
  const room = {
    code: newCode(),
    hostId: null,
    phase: 'lobby',
    loadingText: '',
    worldVotes: {},
    world: null,
    players: [],
    quizAnswers: {}, // voterId -> { traitId: votedPlayerId }
    traits: null, // playerId -> the quiz trait their role is built on
    quizTallies: null,
    cast: null,
    plan: null,
    rounds: [],
    recap: null,
    gmSource: null,
    busy: false,
    listeners: new Set(), // callbacks fired after every state change
  };
  rooms.set(room.code, room);
  const player = addPlayer(room, name);
  return { room, player };
}

function addPlayer(room, name) {
  const n = cleanName(name);
  if (room.phase !== 'lobby') bad('That game has already started.');
  if (room.players.length >= config.roundPlan().maxPlayers) bad('That room is full.');
  if (room.players.some((p) => p.name.toLowerCase() === n.toLowerCase())) bad('Someone in the room already has that name.');
  const player = { id: `p${room.players.length + 1}`, name: n, token: crypto.randomUUID(), connected: true };
  room.players.push(player);
  if (!room.hostId) room.hostId = player.id;
  return player;
}

function joinRoom(code, name) {
  const room = getRoom(code);
  return { room, player: addPlayer(room, name) };
}

function getRoom(code) {
  const room = rooms.get(String(code || '').trim().toUpperCase());
  if (!room) bad('No room with that code.');
  return room;
}

function resume(code, token) {
  const room = getRoom(code);
  const player = room.players.find((p) => p.token === token);
  if (!player) bad('Could not rejoin that room.');
  player.connected = true;
  return { room, player };
}

function setConnected(room, playerId, connected) {
  const p = room.players.find((pl) => pl.id === playerId);
  if (!p) return;
  p.connected = connected;
  if (!connected && room.hostId === playerId) {
    // If the host drops, wait a little before handing control to the next connected player.
    clearTimeout(room.hostTimer);
    room.hostTimer = setTimeout(() => handOverHost(room), HOST_GRACE_MS);
    room.hostTimer.unref();
  } else if (connected && room.hostId === playerId) {
    clearTimeout(room.hostTimer); // the host came back in time
    room.hostTimer = null;
  } else if (connected && !room.hostTimer && !room.players.some((pl) => pl.connected && pl.id === room.hostId)) {
    room.hostId = playerId; // nobody is hosting (e.g. everyone had dropped)
  }
  // A dropped player shouldn't block the round or the quiz.
  if (room.phase === 'answering' && everyoneAnswered(room)) reveal(room);
  if (room.phase === 'quiz' && everyoneDoneQuiz(room)) finishQuiz(room);
}

function handOverHost(room) {
  room.hostTimer = null;
  if (room.players.some((pl) => pl.connected && pl.id === room.hostId)) return;
  const next = room.players.find((pl) => pl.connected);
  if (next) {
    room.hostId = next.id;
    changed(room);
  }
}

// ---------- helpers ----------

function currentRound(room) {
  return room.rounds[room.rounds.length - 1] || null;
}

function requireHost(room, playerId) {
  if (room.hostId !== playerId) bad('Only the host can do that.');
}

function requirePhase(room, phase) {
  if (room.phase !== phase) bad('Not right now.');
}

function connectedPlayers(room) {
  return room.players.filter((p) => p.connected);
}

function everyoneAnswered(room) {
  const round = currentRound(room);
  return connectedPlayers(room).every((p) => p.id in round.answers);
}

function history(room) {
  return room.rounds
    .filter((r) => r.result)
    .map((r, i) => ({ round: i + 1, type: r.plan.type, targetId: r.plan.targetId || '', prompt: r.gm.prompt, outcome: describeRound(r, room.players) }));
}

function gmContext(room, extra = {}) {
  return {
    world: room.world,
    players: room.players.map(({ id, name }) => ({ id, name })),
    traits: room.traits,
    quizTallies: room.quizTallies,
    cast: room.cast,
    history: history(room),
    ...extra,
  };
}

function changed(room) {
  for (const fn of room.listeners) fn(room);
}

// Runs a GM call behind a loading screen. Guards against double-taps.
async function withGM(room, loadingText, fn) {
  if (room.busy) bad('The Game Master is busy.');
  room.busy = true;
  const prevPhase = room.phase;
  room.phase = 'loading';
  room.loadingText = loadingText;
  changed(room);
  try {
    await fn();
  } catch (err) {
    console.error('[rooms] GM step failed:', err);
    room.phase = prevPhase;
  } finally {
    room.busy = false;
    changed(room);
  }
}

// ---------- phase actions (called from socket handlers) ----------

function start(room, playerId) {
  requireHost(room, playerId);
  requirePhase(room, 'lobby');
  const min = config.roundPlan().minPlayers;
  if (room.players.length < min) bad(`You need at least ${min} players.`);
  room.phase = 'world';
}

function voteWorld(room, playerId, worldId) {
  requirePhase(room, 'world');
  if (!config.world(worldId)) bad('Unknown world.');
  room.worldVotes[playerId] = worldId;
}

function lockWorld(room, playerId) {
  requireHost(room, playerId);
  requirePhase(room, 'world');
  const counts = {};
  for (const w of Object.values(room.worldVotes)) counts[w] = (counts[w] || 0) + 1;
  const top = Math.max(0, ...Object.values(counts));
  const leaders = Object.keys(counts).filter((w) => counts[w] === top);
  const hostPick = room.worldVotes[playerId];
  const chosen = leaders.includes(hostPick) ? hostPick : leaders[0];
  if (!chosen) bad('Vote for a world first.');
  room.world = config.world(chosen);
  room.plan = config.roundPlan();
  room.quizAnswers = {};
  room.phase = 'quiz';
}

// ---------- casting quiz: "who in the group is most...?" decides everyone's role ----------

function everyoneDoneQuiz(room) {
  const traits = config.quiz().traits;
  return connectedPlayers(room).every((p) => traits.every((t) => room.quizAnswers[p.id] && t.id in room.quizAnswers[p.id]));
}

function quizAnswer(room, playerId, traitId, votedId) {
  requirePhase(room, 'quiz');
  if (!config.quiz().traits.some((t) => t.id === traitId)) bad('Unknown question.');
  if (!room.players.some((p) => p.id === votedId)) bad('Unknown player.');
  (room.quizAnswers[playerId] ||= {})[traitId] = votedId;
  if (everyoneDoneQuiz(room)) finishQuiz(room);
}

function forceQuiz(room, playerId) {
  requireHost(room, playerId);
  requirePhase(room, 'quiz');
  return finishQuiz(room);
}

// Gives every player a different trait, most-voted matches first
// (e.g. whoever the group picked as "strongest execution" gets the doer role).
function assignTraits(room) {
  const traits = config.quiz().traits;
  const voters = Object.values(room.quizAnswers);
  const votes = (traitId, pid) => voters.filter((a) => a[traitId] === pid).length;
  const pairs = [];
  for (const t of traits) for (const p of room.players) pairs.push({ t, p, count: votes(t.id, p.id), tie: Math.random() });
  pairs.sort((a, b) => b.count - a.count || a.tie - b.tie);
  const out = {};
  const usedTraits = new Set();
  for (const { t, p, count } of pairs) {
    if (out[p.id] || usedTraits.has(t.id)) continue;
    out[p.id] = { id: t.id, label: t.label, question: t.question, votes: count, of: voters.length };
    usedTraits.add(t.id);
  }
  // More players than traits: reuse traits for whoever is left.
  room.players.filter((p) => !out[p.id]).forEach((p, i) => {
    const t = traits[i % traits.length];
    out[p.id] = { id: t.id, label: t.label, question: t.question, votes: votes(t.id, p.id), of: voters.length };
  });
  return out;
}

// Per question, who the group picked, e.g. for the roles screen and the GM.
function quizTallies(room) {
  const voters = Object.values(room.quizAnswers);
  return config.quiz().traits.map((t) => ({
    traitId: t.id,
    question: t.question,
    tally: room.players
      .map((p) => ({ playerId: p.id, count: voters.filter((a) => a[t.id] === p.id).length }))
      .filter((x) => x.count > 0)
      .sort((a, b) => b.count - a.count),
  }));
}

function finishQuiz(room) {
  if (room.busy) return undefined;
  room.traits = assignTraits(room);
  room.quizTallies = quizTallies(room);
  return withGM(room, 'The Game Master is casting your roles…', async () => {
    const { data, source } = await gm.setup(gmContext(room));
    room.cast = data;
    room.gmSource = source;
    room.phase = 'roles';
  });
}

function planRound(room) {
  const index = room.rounds.length;
  const spec = room.plan.rounds[index];
  const plan = { type: spec.type };
  const connected = connectedPlayers(room);
  if (spec.type === 'predict') {
    // Put the spotlight on whoever has had it least.
    const spotlight = (id) => room.rounds.filter((r) => r.plan.targetId === id).length;
    const fewest = Math.min(...connected.map((p) => spotlight(p.id)));
    const candidates = connected.filter((p) => spotlight(p.id) === fewest);
    plan.targetId = candidates[crypto.randomInt(candidates.length)].id;
  }
  // Rotate who reads the scene out loud (never the person the round is about).
  const readers = connected.filter((p) => p.id !== plan.targetId);
  plan.readerId = readers[index % readers.length].id;
  return plan;
}

function nextRound(room, playerId) {
  requireHost(room, playerId);
  if (!['roles', 'reveal'].includes(room.phase)) bad('Not right now.');
  const last = currentRound(room);
  if (room.phase === 'reveal' && last.plan.type === 'secret' && last.revealed < last.result.order.length) bad('Reveal everyone first.');
  if (room.rounds.length >= room.plan.rounds.length) return finish(room);
  const plan = planRound(room);
  const number = room.rounds.length + 1;
  return withGM(room, `The Game Master is writing round ${number}…`, async () => {
    const { data, source } = await gm.round(gmContext(room, { plan, roundNumber: number, totalRounds: room.plan.rounds.length }));
    room.rounds.push({ plan, gm: data, answers: {}, reasons: {}, result: null, votersRevealed: false, revealed: 0, reactions: {} });
    room.gmSource = source;
    room.phase = 'answering';
  });
}

// In secret rounds each player has their own options, and can add a short "why".
function optionsFor(round, playerId) {
  if (round.plan.type !== 'secret') return round.gm.options;
  const brief = round.gm.briefs[playerId];
  return brief ? brief.options : [];
}

function answer(room, playerId, value, reason) {
  requirePhase(room, 'answering');
  const round = currentRound(room);
  if (!optionsFor(round, playerId).some((o) => o.id === value)) bad('That is not an option.');
  round.answers[playerId] = value; // can change your mind until the reveal
  if (round.plan.type === 'secret' && typeof reason === 'string') round.reasons[playerId] = reason.trim().slice(0, 120);
  if (everyoneAnswered(room)) reveal(room);
}

function forceReveal(room, playerId) {
  requireHost(room, playerId);
  requirePhase(room, 'answering');
  reveal(room);
}

function reveal(room) {
  const round = currentRound(room);
  round.result = computeResult(round, room.players);
  room.phase = 'reveal';
}

// Secret rounds are revealed one player at a time, so each decision gets its own moment.
function revealNext(room, playerId) {
  requireHost(room, playerId);
  requirePhase(room, 'reveal');
  const round = currentRound(room);
  if (round.plan.type !== 'secret') bad('Not a secret round.');
  if (round.revealed < round.result.order.length) round.revealed += 1;
}

// Vote rounds show tallies first; the host decides whether to reveal who voted for whom.
function revealVoters(room, playerId) {
  requireHost(room, playerId);
  requirePhase(room, 'reveal');
  const round = currentRound(room);
  if (round.plan.type !== 'vote_player') bad('Not a vote round.');
  round.votersRevealed = true;
}

// Emoji reaction to another player's answer. Tap the same emoji again to take it back.
function react(room, playerId, targetId, emoji) {
  requirePhase(room, 'reveal');
  const round = currentRound(room);
  if (!room.plan.reactions.includes(emoji)) bad('Unknown reaction.');
  if (targetId === playerId) bad("You can't react to yourself.");
  if (!(targetId in round.answers)) bad('Nothing to react to.');
  if (round.plan.type === 'vote_player' && !round.votersRevealed) bad('Votes are still secret.');
  if (round.plan.type === 'secret' && !round.result.order.slice(0, round.revealed).includes(targetId)) bad('Not revealed yet.');
  const mine = (round.reactions[targetId] ||= {});
  if (mine[playerId] === emoji) delete mine[playerId];
  else mine[playerId] = emoji;
}

function finish(room) {
  const stats = computeStats(room);
  return withGM(room, 'The Game Master is writing your story…', async () => {
    const { data, source } = await gm.recap(gmContext(room, { stats }));
    room.recap = { stats, gm: data };
    room.gmSource = source;
    room.phase = 'recap';
  });
}

function playAgain(room, playerId) {
  requireHost(room, playerId);
  requirePhase(room, 'recap');
  Object.assign(room, { phase: 'world', worldVotes: {}, world: null, quizAnswers: {}, traits: null, quizTallies: null, cast: null, rounds: [], recap: null });
}

// ---------- what each player is allowed to see ----------

function publicState(room, viewerId) {
  const round = currentRound(room);
  const state = {
    code: room.code,
    phase: room.phase,
    you: viewerId,
    hostId: room.hostId,
    hostAway: !room.players.some((p) => p.connected && p.id === room.hostId),
    players: room.players.map(({ id, name, connected }) => ({ id, name, connected })),
    loadingText: room.loadingText,
    gmSource: room.gmSource,
    minPlayers: config.roundPlan().minPlayers,
  };
  if (room.phase === 'world') {
    state.worlds = config.worlds();
    state.worldVotes = room.worldVotes;
  }
  if (room.world) state.world = room.world;
  if (room.phase === 'quiz') {
    const traits = config.quiz().traits;
    state.quiz = {
      questions: traits.map(({ id, question }) => ({ id, question })),
      yourAnswers: room.quizAnswers[viewerId] || {},
      doneIds: room.players.filter((p) => traits.every((t) => room.quizAnswers[p.id] && t.id in room.quizAnswers[p.id])).map((p) => p.id),
    };
  }
  if (room.traits) state.traits = room.traits;
  if (room.quizTallies) state.quizTallies = room.quizTallies;
  if (room.cast) state.cast = room.cast;
  if (room.plan) state.totalRounds = room.plan.rounds.length;
  if (round && ['answering', 'reveal'].includes(room.phase)) {
    const revealed = room.phase === 'reveal';
    // In vote rounds, individual votes stay secret unless the host reveals them.
    const showAnswers = revealed && (round.plan.type !== 'vote_player' || round.votersRevealed);
    state.round = {
      number: room.rounds.length,
      type: round.plan.type,
      targetId: round.plan.targetId || null,
      readerId: round.plan.readerId,
      scene: round.gm.scene,
      prompt: round.gm.prompt,
      callback: round.gm.callback,
      options: round.gm.options,
      answeredIds: Object.keys(round.answers),
      yourAnswer: round.answers[viewerId] ?? null,
      // Other players' answers stay hidden until the reveal.
      answers: showAnswers ? round.answers : null,
      votersRevealed: round.votersRevealed,
      reactions: revealed ? round.reactions : null,
      reactionEmojis: room.plan.reactions,
      result: revealed ? round.result : null,
      isLast: room.rounds.length >= room.plan.rounds.length,
    };
    if (round.plan.type === 'secret') Object.assign(state.round, secretView(room, round, viewerId, revealed));
  }
  if (room.phase === 'recap') state.recap = room.recap;
  return state;
}

// Before the reveal you only see your own brief. After it, briefs are shown one player at a time.
function secretView(room, round, viewerId, revealed) {
  const brief = round.gm.briefs[viewerId] || null;
  const view = {
    title: round.gm.prompt,
    brief,
    prompt: brief ? brief.prompt : round.gm.prompt,
    options: brief ? brief.options : [],
    yourReason: round.reasons[viewerId] || '',
    previously: previousOutcomes(room),
    answers: null,
    reveals: [],
  };
  if (revealed) {
    const shown = round.result.order.slice(0, round.revealed);
    view.reveals = shown.map((pid) => ({ playerId: pid, ...describeSecret(round, pid) }));
    view.answers = Object.fromEntries(shown.filter((pid) => pid in round.answers).map((pid) => [pid, round.answers[pid]]));
    view.nextRevealId = round.result.order[round.revealed] || null;
    view.allRevealed = round.revealed >= round.result.order.length;
  }
  return view;
}

// What happened because of last round's decisions, shown at the top of the next secret round.
function previousOutcomes(room) {
  const prev = room.rounds[room.rounds.length - 2];
  if (!prev || prev.plan.type !== 'secret' || !prev.result) return [];
  return prev.result.order.map((pid) => describeSecret(prev, pid).outcome).filter(Boolean);
}

module.exports = {
  GameError, createRoom, joinRoom, getRoom, resume, setConnected, publicState, changed,
  start, voteWorld, lockWorld, quizAnswer, forceQuiz, nextRound, answer, forceReveal, revealVoters, revealNext, react, playAgain,
};
