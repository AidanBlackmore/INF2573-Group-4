'use strict';
const { randomInt, randomUUID } = require('node:crypto');
const HOUSE = ['Foyer', 'Dining Room', 'Kitchen', 'Study', 'Library', 'Conservatory', 'Billiard Room'];
const ROOMS = ['Study', 'Library', 'Billiard Room'];
const WEAPONS = ['Brass candlestick', 'Letter opener', 'Curtain cord'];
const story = require('./story');
const LETTER = 'Morgan: “Alex, I accepted help from the fund when I was struggling. Please do not turn that difficult period into a story for everyone else. I have repaid the support. I would like to decide who knows about it.” Morgan is a fictional non-attendee, not a suspect.';
class GameError extends Error {}
const check = (condition, message = 'That action is not available now.') => { if (!condition) throw new GameError(message); };
const pick = a => a[randomInt(a.length)];
function shuffle(a) { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const rooms = new Map();
function getRoom(code) { const r = rooms.get(String(code || '').trim().toUpperCase()); check(r, 'Room not found. Check the four-letter code.'); return r; }
function addPlayer(r, name) {
  check(r.round === 0, 'This game has started. Use your saved recovery credential to rejoin.');
  check(r.players.length < 6, 'This room is full.');
  check(typeof name === 'string' && name.trim().length > 0 && name.trim().length <= 24, 'Enter a name of 1–24 characters.');
  name = name.trim().replace(/\s+/g, ' ');
  check(!r.players.some(p => p.name.toLowerCase() === name.toLowerCase()), 'That name is already in use.');
  const p = { id: randomUUID(), token: randomUUID(), name, connected: true, clues: [] };
  r.players.push(p); r.hostId ||= p.id; return p;
}
function createRoom(name) {
  check(rooms.size < 500, 'The server has too many rooms. Try again later.');
  let code; do { code = Array.from({ length: 4 }, () => pick('ABCDEFGHJKLMNPQRSTUVWXYZ')).join(''); } while (rooms.has(code));
  const room = { code, gameId: randomUUID(), players: [], hostId: null, round: 0, stage: 'lobby', board: [], decisions: {}, dice: {}, statements: [], submissions: {}, lastActive: Date.now() };
  const player = addPlayer(room, name); rooms.set(code, room); return { room, player };
}
function joinRoom(code, name) { const room = getRoom(code); return { room, player: addPlayer(room, name) }; }
function resume(code, token) { const room = getRoom(code); const player = room.players.find(p => typeof token === 'string' && p.token === token); check(player, 'Recovery credential not recognized.'); return { room, player }; }
function card(id, title, category, text) { return { id, title, category, text }; }
function evidence(r) {
  const s = r.solution;
  if (!s?.room) return {};
  const trace = ['a hard circular base with a chipped edge. Green wax is attached to the matching surface.', 'a short, narrow blade with a nick. A fragment of decorative brass was recovered.', 'a double-braided cord. Dark-blue fibers and resin-coated strands were recovered.'][WEAPONS.indexOf(s.weapon)];
  return {
    K1: card('K1', 'Discovery', 'Rooms', `Alex was found in the ${s.room}. Death occurred here. The body was not moved.`),
    K2: card('K2', 'Time and access', 'Timeline', 'The incident occurred between 10:02 and 10:03 p.m. Windows remained secured. There was no second entrance or remote mechanism. Anyone responsible had to be inside. Searches after 10:04 do not establish earlier whereabouts.'),
    K3: card('K3', 'Door log', 'Timeline', `${s.room} — verified battery-backed record. 10:01:50 — guest code ${r.codes[s.murderer]} enters. 10:03:10 — the same code leaves. No other guest enters during that interval. Alex was already inside and has no guest code. This record has not been altered. A code alone does not identify a name.`),
    K4: card('K4', 'Guest register', 'People', r.players.map(p => `${p.name}: ${r.codes[p.id]}`).join('\n') + '\nGuest cards were never exchanged, copied, lost, or reassigned. A register alone does not establish who entered a room.'),
    K5: card('K5', 'Scene traces', 'Objects', `The relevant trace matches ${trace}`),
    K6: card('K6', 'Object inventory', 'Objects', 'Brass candlestick: hard circular base, chipped edge, green wax.\nLetter opener: short narrow blade, nicked edge, decorative brass.\nCurtain cord: double braid, dark-blue fibers, resin-coated ends.\nAll were accessible before dinner. Earlier handling is not proof of murder.')
  };
}
function give(r, p, id) { if (!p.clues.includes(id)) p.clues.push(id); }
function publish(r, c, p) { if (!r.board.some(x => x.id === c.id)) { r.board.push({ ...c, sharedBy: p?.name || null }); if (p) r.firstShare ||= p.name; } }
function fact(r, id, text, category = 'Timeline') { publish(r, card(id, 'House record', category, text)); }
function missing(p, available) { return available.find(k => !p.clues.includes(k)) || available[0]; }
function speak(r, next) {
  const offset = (r.round - 1) / 2;
  r.speakers = r.players.map((_, i) => r.players[(i + offset) % r.players.length].id);
  r.speakerIndex = 0; r.afterSpeaking = next; r.stage = 'speaking'; r.speakerUntil = Date.now() + 20000;
}
function pass(r) { r.speakerIndex++; r.speakerUntil = Date.now() + 20000; if (r.speakerIndex >= r.speakers.length) { r.stage = r.afterSpeaking; r.speakerUntil = null; } }
function tick(r) { if (r.stage === 'speaking' && Date.now() >= r.speakerUntil) { pass(r); return true; } return false; }
function begin(r, n) {
  r.round = n; r.submissions = {}; r.tally = null; r.stage = 'action'; r.discussionUntil = Date.now() + 120000;
  if (n === 1 || n === 5) speak(r, 'vote');
  if (n === 5) {
    fact(r, 'S2', 'The original meeting minutes show that Alex accepted a sale offer before consulting the people who built Rain House. The audit was due to compare the original records with his edited summaries. Each dispute explains a motive, not who committed the murder.');
    for (const p of r.players) publish(r, r.extraCards[`M-${p.id}`]);
  }
  if (n === 3) {
    const e = evidence(r); publish(r, e.K1);
    const recipients = shuffle(r.players);
    ['K2', 'K3', 'K5', 'K6'].forEach((k, i) => give(r, recipients[i], k));
    if (recipients[4]) { r.extraCards ||= {}; r.extraCards.BAT = card('BAT', 'Independent power', 'Timeline', 'Door records continued on independent battery power.'); give(r, recipients[4], 'BAT'); }
    if (recipients[5]) { r.extraCards ||= {}; r.extraCards.VIS = card('VIS', 'No visitor', 'People', 'No external visitor entered Rain House that evening.'); give(r, recipients[5], 'VIS'); }
    r.discoverers = r.players.filter(p => p.search === r.solution.room).map(p => p.name);
    fact(r, 'discovery', r.discoverers.length ? `${r.discoverers.join(' and ')} found Alex in the ${r.solution.room}.` : `A location alert brought everyone to the ${r.solution.room}.`, 'Rooms');
    for (let i = 0; i < r.players.length; i++) give(r, r.players[i], `M-${r.players[(i + 1) % r.players.length].id}`);
    speak(r, 'vote');
  }
  if (n === 4 && r.decisions[1] === 'A') publish(r, evidence(r).K3);
  if (n === 6) r.stage = 'discussion';
}
// Test injection is internal only: socket actions never supply the random source.
function roll(r, random = randomInt) {
  if (r.dice[r.round]) return;
  check(r.stage === 'dice');
  const value = random(1, 7), roller = r.players[(r.round - 1) / 2];
  const rewards = [];
  const gain = id => { give(r, roller, id); rewards.push({ title: ({...evidence(r), ...r.extraCards})[id].title, recipient: roller.name, destination: 'My clues · private' }); };
  const reveal = (id, title, text) => { const c = card(id, title, 'Timeline', text); publish(r,c); rewards.push({title,recipient:'Everyone',destination:'Shared evidence board'}); };
  let text;
  if (r.round === 1) {
    text = value <= 2 ? (r.decisions[1] === 'A' ? 'The paper catches against the lining just as Alex returns. His eyes settle on the broken seal. “Was the receipt not enough?” The document you needed is safe, but the pocket yields nothing more.' : `A glass tips over. ${roller.name} lifts the envelope clear of the spreading water as Alex returns. He sees the envelope in their hand; the letter is still folded. No extra document is found.`) : value === 6 ? 'A stiff edge catches your finger behind the lining. The meeting note comes free—and with it, a second page bearing a buyer’s signature. Alex had agreed to sell before he invited you here.' : 'You ease a folded note from the lining. Alex’s own handwriting lists what he intended to settle at dinner. This invitation was not a reunion.';
    if (value >= 3) gain('B1');
    if (value === 6) gain('B2');
  } else if (r.round === 3) {
    const available = r.decisions[3] === 'A' ? ['K3','K2','K5','K6'] : ['K5','K6','K3','K2'];
    const count = value === 6 ? 2 : value >= 3 ? 1 : 0;
    for (let i=0; i<count; i++) gain(missing(roller,available));
    text = count === 2 ? 'Behind the first report is a second, overlooked sheet. You separate them carefully: two independent pieces of the night, both now yours to compare.' : count === 1 ? 'A page was tucked beneath the stack. It gives you a second angle on the evidence you already hold.' : 'The search turns up no additional report. The first records remain intact; the group can continue with what it already knows.';
  } else {
    text = value <= 2 ? 'A loose scrap accuses someone without naming a source. You set it aside. There is enough suspicion in this house already; this is not evidence.' : value === 6 ? 'The false bottom lifts. Beneath a card-custody slip lies an unsent letter in Alex’s handwriting. For the first time tonight, you hear the version of events he never intended to read aloud.' : 'A custody slip is wedged in the hinge: each numbered card stayed with its assigned guest. The register can be trusted.';
    if (value >= 3) reveal('B5','Card-custody slip','Every guest card remained with its assigned owner. No card was exchanged, copied, lost, or reassigned during dinner.');
    if (value === 6) reveal('B6', 'Alex’s unsent letter', '“The buyers want a clean history. I have let the others carry decisions I made with them. Tomorrow the originals may undo the story I told.” The letter confirms Alex’s manipulation of the sale narrative. It does not identify his killer.');
  }
  r.dice[r.round] = { value, roller: roller.name, text, rewards, extraCount: rewards.length, action: story.diceRules(r).action };
  fact(r, `dice${r.round}`, text);
  r.stage = 'discussion'; r.discussionUntil = Date.now() + 120000;
}
function resolveVote(r) {
  const values = r.players.map(p => r.submissions[p.id] || 'N');
  r.tally = { A: values.filter(x => x === 'A').length, B: values.filter(x => x === 'B').length, N: values.filter(x => x === 'N').length };
  const winner = r.tally.A > r.tally.B ? 'A' : 'B'; r.decisions[r.round] = winner;
  if (r.round === 1) {
    fact(r, 'receipt', 'Independent audit appointment: tomorrow, 9:00 a.m. Original ledger required. A disputed transfer will be reviewed against the originals.');
    if (winner === 'A') fact(r, 'letter', LETTER, 'People');
    r.stage = 'dice';
  } else if (r.round === 3) {
    publish(r, evidence(r)[winner === 'A' ? 'K2' : 'K6']);
    r.stage = 'dice';
  } else {
    if (winner === 'A') {
      publish(r, evidence(r).K3); publish(r, evidence(r).K4);
      fact(r, 'archive', `${r.decisions[1] === 'A' ? 'Morgan’s privacy request is shown again. ' : LETTER + ' '}Taylor: “I considered leaving the project. Please let me tell people myself if I decide to go.” Taylor is a fictional non-attendee, not a suspect.`, 'People');
    }
    r.submissions = {}; r.stage = 'verify';
  }
}
function finish(r) {
  const correct = r.players.filter(p => p.id !== r.solution.murderer && ['murderer', 'room', 'weapon'].every(k => r.submissions[p.id]?.[k] === r.solution[k])).length;
  const needed = Math.floor((r.players.length - 1) / 2) + 1;
  r.result = { confession: r.players.find(p => p.id === r.solution.murderer).role.confession, motives: r.players.map(p => ({name:p.name,title:p.role.title,motive:p.role.motive})), ...r.solution, murdererName: r.players.find(p => p.id === r.solution.murderer).name, correct, needed, guestsWin: correct >= needed, ballots: r.players.map(p => ({ name: p.name, ...(r.submissions[p.id] || { murderer: '', weapon: '', room: '' }) })) };
  Object.values(evidence(r)).forEach(c => publish(r, c));
  r.recap = ['You came to Rain House expecting dinner and an announcement.', r.decisions[1] === 'A' ? 'You opened the whole envelope, including Morgan’s private letter.' : 'You took the receipt and left Morgan’s personal letter folded.', r.decisions[3] === 'A' ? 'Together, you searched the missing minutes first.' : 'Together, you searched the physical traces first.', r.discoverers.length ? `${r.discoverers.join(' and ')} found Alex in the ${r.solution.room}.` : `A location alert brought everyone to the ${r.solution.room}.`, r.firstShare ? `${r.firstShare} was the first to put a private clue on the shared board.` : 'Much of the evidence stayed on individual phones.', r.decisions[5] === 'A' ? 'You chose a fully open archive, revealing records and personal correspondence.' : 'You kept the letters closed and chose which records to inspect.', correct >= needed ? 'By the end, enough of you had connected the same story.' : 'The complete story became clear only after the final votes.'];
  r.stage = 'ending';
}
function next(r) {
  if (r.stage === 'briefing') { r.submissions = {}; speak(r, 'vote'); return; }
  if (r.stage === 'speaking') return pass(r);
  if (r.stage === 'vote') return resolveVote(r);
  if (r.stage === 'dice') return roll(r);
  if (r.round === 2 && r.stage === 'action') {
    r.solution.room ||= pick(ROOMS); r.solution.weapon ||= pick(WEAPONS);
    r.players.forEach(p => { p.search = r.submissions[p.id]?.search || 'Observe'; p.searchResult = p.search === r.solution.room ? `You helped find Alex in the ${r.solution.room}.` : p.search === 'Observe' ? 'You stayed to observe. A search after 10:04 cannot establish an earlier alibi.' : `Your search of the ${p.search} did not find Alex. It took place after 10:04.`; });
    return begin(r, 3);
  }
  if ((r.round === 4 && r.stage === 'action') || r.stage === 'verify') {
    r.players.forEach(p => { if (!r.submissions[p.id]) give(r, p, r.round === 5 && !p.clues.includes('K4') ? 'K4' : missing(p, ['K2','K3',...(r.round === 5 ? ['K4'] : []),'K5','K6'])); });
    if (r.round === 4 && r.decisions[1] === 'B' && !r.extraVerified) { give(r, r.players[0], missing(r.players[0], ['K2','K3','K5','K6'])); r.extraVerified = true; }
    r.stage = r.round === 5 ? 'dice' : 'discussion'; return;
  }
  if (r.round === 6 && r.stage === 'discussion') { r.stage = 'accuse'; r.discussionUntil = Date.now() + 60000; return; }
  if (r.stage === 'accuse') return finish(r);
  if (r.stage === 'discussion' && r.round < 6) return begin(r, r.round + 1);
  check(false);
}
function action(r, pid, type, data = {}) {
  check(r && r.players.some(p => p.id === pid), 'Join on your phone first.');
  check(data && typeof data === 'object' && !Array.isArray(data), 'Invalid action.');
  const p = r.players.find(p => p.id === pid);
  // Phase stamps prevent delayed or repeated taps from advancing a different stage.
  check(data.round === r.round && data.stage === r.stage, 'The game moved on. Try again.');
  if (type === 'start') {
    check(pid === r.hostId && r.round === 0); check(r.players.length >= 4, 'You need 4–6 players.');
    r.solution = { murderer: pick(r.players).id }; const roles = shuffle(story.ROLES);
    r.extraCards = { B1: card('B1','Alex’s meeting note','People','“Dinner: settle the outstanding disputes. Audit: compare originals. Sale: keep the buyers away from the correspondence.” Alex expected resistance before anyone arrived.'), B2: card('B2','The signed sale offer','Timeline','The buyer signed at 4:30 p.m., hours before dinner. Alex’s announcement was not a consultation. The offer still required his final signature after the audit.') };
    r.players.forEach((p,i) => { p.role = roles[i]; r.extraCards[`M-${p.id}`] = card(`M-${p.id}`, `${p.name} — a paper trail`, 'People', `${p.name}, ${p.role.title.toLowerCase()}: ${p.role.document} This establishes a dispute with Alex, not presence at the crime scene.`); });
    const codes = shuffle([17,24,38,46,59,63]); r.codes = Object.fromEntries(r.players.map((q, i) => [q.id, codes[i]])); begin(r, 1); r.stage = 'briefing'; r.speakerUntil = null;
  } else if (type === 'ready') { check(r.stage === 'briefing'); r.submissions[pid] = true;
  } else if (type === 'next') { check(pid === r.hostId, 'Only the host can advance.'); next(r);
  } else if (type === 'pass') { check(r.stage === 'speaking' && (r.speakers[r.speakerIndex] === pid || pid === r.hostId)); pass(r);
  } else if (type === 'vote') { check((r.stage === 'vote' || (r.stage === 'speaking' && r.afterSpeaking === 'vote')) && ['A','B','N'].includes(data.value)); r.submissions[pid] = data.value;
  } else if (type === 'search') {
    check(r.round === 2 && r.stage === 'action' && [...HOUSE, 'Observe'].includes(data.search));
    if (r.solution.murderer === pid) { check(ROOMS.includes(data.room) && WEAPONS.includes(data.weapon), 'Choose a crime room and weapon.'); r.solution.room = data.room; r.solution.weapon = data.weapon; }
    r.submissions[pid] = { search: data.search };
  } else if (type === 'verify') {
    check((r.round === 4 && r.stage === 'action') || (r.round === 5 && r.stage === 'verify'));
    const available = ['K2','K3',...(r.round === 5 ? ['K4'] : []),'K5','K6'];
    const id = data.value === 'pass' ? (r.round === 5 && !p.clues.includes('K4') ? 'K4' : missing(p, available)) : data.value;
    check(available.includes(id));
    if (data.extra) { check(r.round === 4 && pid === r.players[0].id && r.decisions[1] === 'B' && !r.extraVerified && r.submissions[pid]); r.extraVerified = true; }
    else { check(!r.submissions[pid], 'Your verification is already saved.'); r.submissions[pid] = id; }
    give(r, p, id);
  } else if (type === 'roll') { check(r.stage === 'dice' && r.players[(r.round - 1) / 2].id === pid, 'It is another player’s turn to roll.'); roll(r);
  } else if (type === 'share') {
    check(r.round >= 1 && r.stage !== 'ending' && p.clues.includes(data.value)); const c = { ...evidence(r), ...r.extraCards }[data.value]; check(c); publish(r, c, p);
  } else if (type === 'statement') {
    check(r.round === 4 && !r.statements.some(x => x.playerId === pid));
    check(['sound','object','doubt'].includes(data.kind));
    const allowed = data.kind === 'sound' ? HOUSE : data.kind === 'object' ? WEAPONS : r.players.map(x => x.id); check(allowed.includes(data.value));
    const text = data.kind === 'sound' ? `I think the sound came from the ${data.value}.` : data.kind === 'object' ? `Someone may have handled the ${data.value} before dinner.` : `I’m not convinced this proves ${r.players.find(x => x.id === data.value).name} did it.`;
    r.statements.push({ playerId: pid, name: p.name, text });
  } else if (type === 'accuse') {
    check(r.stage === 'accuse'); check(['', ...r.players.map(x => x.id)].includes(data.murderer) && ['',...ROOMS].includes(data.room) && ['',...WEAPONS].includes(data.weapon));
    r.submissions[pid] = { murderer: data.murderer, weapon: data.weapon, room: data.room };
  } else check(false, 'Unknown action.');
  r.lastActive = Date.now();
}
function view(r, pid) {
  const p = r.players.find(x => x.id === pid);
  const s = { code: r.code, gameId: r.gameId, round: r.round, stage: r.stage, hostId: r.hostId, players: r.players.map(({id,name,connected,role}) => ({id,name,connected,...(role ? {roleTitle:role.title,introduction:role.introduction} : {})})), title: story.TITLES[r.round - 1] || 'An invitation from Alex', scene: story.scene(r), decision: story.DECISIONS[r.round] || null, diceRules: [1,3,5].includes(r.round) ? story.diceRules(r) : null, board: r.board, statements: r.statements, completed: Object.keys(r.submissions).length, decisions: r.decisions, tally: r.tally, dice: r.dice, discussionUntil: r.discussionUntil, speaker: r.stage === 'speaking' ? { id: r.speakers[r.speakerIndex], until: r.speakerUntil, position: r.speakerIndex + 1 } : null, rollerId: r.stage === 'dice' ? r.players[(r.round - 1) / 2].id : null, house: HOUSE, rooms: ROOMS, weapons: WEAPONS };
  if (p) s.me = { role: p.role ? { title:p.role.title, relationship:p.role.relationship, secret:p.role.secret, motive:p.role.motive } : null, id: p.id, name: p.name, objective: r.round ? (r.solution.murderer === pid ? 'murderer' : 'guest') : null, clues: p.clues.map(k => ({ ...evidence(r), ...r.extraCards }[k])).filter(Boolean), submission: r.submissions[pid] || null, searchResult: r.round >= 3 ? p.searchResult : null, extraVerification: r.round === 4 && r.decisions[1] === 'B' && pid === r.players[0].id && !r.extraVerified, selection: r.round >= 2 && pid === r.solution.murderer ? { room: r.solution.room, weapon: r.solution.weapon } : null };
  if (r.stage === 'ending') { s.result = r.result; s.recap = r.recap; }
  return s;
}
function cleanup() { for (const [code, r] of rooms) if (Date.now() - r.lastActive > 24 * 60 * 60 * 1000 && !r.players.some(p => p.connected)) rooms.delete(code); }
module.exports = { GameError, createRoom, joinRoom, getRoom, resume, action, view, tick, cleanup, rooms, HOUSE, ROOMS, WEAPONS, evidence, roll };
