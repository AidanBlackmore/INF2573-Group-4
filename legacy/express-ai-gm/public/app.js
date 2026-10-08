// Client: renders one screen per game phase from the state the server sends.
// Buttons use data-action="..." and are handled by one click listener at the bottom.
/* global io */
const socket = io();
const $app = document.getElementById('app');
let state = null;
let lanUrl = null;

// ---------- session (so a phone that sleeps can rejoin) ----------

// Per-tab session (sessionStorage) auto-resumes after a reload or dropped connection.
// localStorage remembers the last game on this device, offered as a "Rejoin" button
// (never automatic, so several tabs in one browser can be different players).
const SESSION_KEY = 'au-session';
function readStore(store) {
  try { return JSON.parse(store.getItem(SESSION_KEY)); } catch { return null; }
}
function saveSession(s) {
  for (const store of [sessionStorage, localStorage]) {
    try { store.setItem(SESSION_KEY, JSON.stringify(s)); } catch { /* private mode */ }
  }
}
function clearSession() {
  for (const store of [sessionStorage, localStorage]) {
    try { store.removeItem(SESSION_KEY); } catch { /* ignore */ }
  }
}
function resume(s) {
  socket.emit('resume', s, (res) => {
    if (!res.ok) { clearSession(); state = null; render(); toast('That game has ended.'); }
  });
}

socket.on('connect', () => {
  const s = readStore(sessionStorage);
  if (s) resume(s);
  else if (!state) render();
});
socket.on('joined', ({ code, token, name }) => saveSession({ code, token, name }));
socket.on('state', (s) => { state = s; render(); });

fetch('/info').then((r) => r.json()).then((info) => { lanUrl = info.urls[0] || null; if (state) render(); }).catch(() => {});

function send(event, payload = {}) {
  socket.emit(event, payload, (res) => { if (res && !res.ok) toast(res.error); });
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.hidden = true; }, 3000);
}

// ---------- helpers ----------

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const me = () => state.players.find((p) => p.id === state.you);
const isHost = () => state.hostId === state.you;
const nameOf = (id) => (state.players.find((p) => p.id === id) || { name: '?' }).name;
const namesOf = (ids) => ids.map(nameOf).join(', ');

function hostBar(html) {
  return isHost() ? `<div class="host-bar stack">${html}</div>` : '';
}

function waitingForHost(text = 'Waiting for the host…') {
  if (isHost()) return '';
  if (state.hostAway) return `<p class="muted center">${esc(nameOf(state.hostId))} (host) dropped out. Waiting for them to come back, or someone else takes over soon…</p>`;
  return `<p class="muted center">${esc(text)}</p>`;
}

const ROUND_LABELS = {
  choice: 'Your choice',
  vote_player: 'Group vote',
  predict: 'Prediction',
  secret: 'Secret decisions',
};

// ---------- screens ----------

function renderHome() {
  const code = new URLSearchParams(location.search).get('code') || '';
  const last = readStore(localStorage);
  return `
    ${last ? `<div class="card highlight stack"><p>Were you in room <strong>${esc(last.code)}</strong>${last.name ? ` as <strong>${esc(last.name)}</strong>` : ''}?</p><button class="primary" data-action="rejoin">Rejoin that game</button></div>` : ''}
    <h1>Alternate Universe</h1>
    <p class="muted">A party game for friends. An AI Game Master drops your group into another world, then asks what you really think of each other.</p>
    <div class="card stack">
      <input id="name" placeholder="Your name" maxlength="20" autocomplete="off">
    </div>
    <div class="card stack">
      <h3>Join a room</h3>
      <input id="code" class="code" placeholder="CODE" maxlength="4" autocomplete="off" value="${esc(code)}">
      <button class="primary" data-action="join">Join</button>
    </div>
    <div class="card stack">
      <h3>Or start a new one</h3>
      <button data-action="create">Create a room</button>
    </div>`;
}

function renderLobby() {
  const link = lanUrl ? `${lanUrl}/?code=${state.code}` : `${location.origin}/?code=${state.code}`;
  const enough = state.players.length >= state.minPlayers;
  return `
    <p class="tag center">Room code</p>
    <div class="big-code">${esc(state.code)}</div>
    <p class="center small muted">Friends join at <strong>${esc(link)}</strong></p>
    <h2>Players (${state.players.length})</h2>
    <div>${state.players.map((p) => `<span class="pill ${p.connected ? '' : 'off'}">${esc(p.name)}${p.id === state.hostId ? ' 👑' : ''}</span>`).join('')}</div>
    ${enough ? '' : `<p class="muted">Need at least ${state.minPlayers} players to start.</p>`}
    ${hostBar(`<button class="primary" data-action="start" ${enough ? '' : 'disabled'}>Everyone's in, start</button>`)}
    ${waitingForHost('Waiting for the host to start…')}`;
}

function renderWorld() {
  const votes = state.worldVotes || {};
  const mine = votes[state.you];
  const count = (id) => Object.values(votes).filter((v) => v === id).length;
  return `
    <h1>Pick a world</h1>
    <p class="muted">Everyone votes. The host locks it in.</p>
    <div class="stack">
      ${state.worlds.map((w) => `
        <button class="${mine === w.id ? 'selected' : ''}" data-action="voteWorld" data-value="${esc(w.id)}">
          <strong>${esc(w.emoji)} ${esc(w.name)}</strong>${count(w.id) ? ` <span class="pill">${count(w.id)} vote${count(w.id) > 1 ? 's' : ''}</span>` : ''}<br>
          <span class="muted small">${esc(w.tagline)}</span>
        </button>`).join('')}
    </div>
    ${hostBar(`<button class="primary" data-action="lockWorld" ${Object.keys(votes).length ? '' : 'disabled'}>Lock in the top world</button>`)}`;
}

function renderQuiz() {
  const { questions, yourAnswers, doneIds } = state.quiz;
  const answered = Object.keys(yourAnswers).length;
  const waiting = state.players.filter((p) => p.connected && !doneIds.includes(p.id));
  return `
    <p class="tag">${esc(state.world.emoji)} ${esc(state.world.name)} · Casting</p>
    <h1>Who's who?</h1>
    <p class="muted">Before the Game Master hands out roles: who in this group fits each description? Your votes decide everyone's role. You can vote for yourself.</p>
    ${questions.map((q, i) => `
      <div class="card ${q.id in yourAnswers ? '' : 'highlight'}">
        <p class="tag">${i + 1} of ${questions.length}</p>
        <p><strong>${esc(q.question)}</strong></p>
        <div class="choices">${state.players.map((p) => `<button class="chip ${yourAnswers[q.id] === p.id ? 'selected' : ''}" data-action="quizVote" data-trait="${esc(q.id)}" data-value="${esc(p.id)}">${esc(p.name)}${p.id === state.you ? ' <span class="muted">(you)</span>' : ''}</button>`).join('')}</div>
      </div>`).join('')}
    <p class="muted small center">${answered === questions.length ? 'All done. You can still change your votes until everyone finishes.' : `${answered} of ${questions.length} answered`}</p>
    <p class="small">${waiting.length ? `Still voting: ${waiting.map((p) => `<span class="pill">${esc(p.name)}</span>`).join('')}` : ''}</p>
    ${hostBar(`<button data-action="forceQuiz">Cast roles now (don't wait)</button>`)}`;
}

// "The group voted you: Gets things done (3 of 4 votes)"
function traitLine(pid) {
  const t = state.traits && state.traits[pid];
  if (!t) return '';
  return t.votes
    ? `🗳️ The group says: <strong>${esc(t.label)}</strong> <span class="muted">(${t.votes} of ${t.of} votes)</span>`
    : `🗳️ The group couldn't pin ${pid === state.you ? 'you' : 'them'} down, so: <strong>${esc(t.label)}</strong>`;
}

function renderLoading() {
  return `<div class="spinner"></div><p class="center">${esc(state.loadingText || 'Loading…')}</p>`;
}

function renderRoles() {
  const { cast } = state;
  const mine = cast.roles[state.you];
  const rels = cast.relationships;
  return `
    <p class="tag">${esc(state.world.emoji)} ${esc(state.world.name)}</p>
    <p class="scene">${esc(cast.intro)}</p>
    <div class="card highlight">
      <p class="small">${traitLine(state.you)}</p>
      <p class="tag">So you are</p>
      <h2 style="margin-top:4px">${esc(mine.title)}</h2>
      <p>${esc(mine.blurb)}</p>
    </div>
    <p class="muted small">Take turns reading your role out loud.</p>
    <h2>The cast</h2>
    ${state.players.filter((p) => p.id !== state.you).map((p) => `
      <div class="card"><strong>${esc(p.name)}</strong>: ${esc(cast.roles[p.id].title)}<br><span class="muted small">${esc(cast.roles[p.id].blurb)}</span>${traitLine(p.id) ? `<p class="small" style="margin-bottom:0">${traitLine(p.id)}</p>` : ''}</div>`).join('')}
    ${rels.length ? `<h2>Relationships</h2>${rels.map((r) => `<div class="card ${r.from === state.you || r.to === state.you ? 'highlight' : ''}">${esc(r.text)}</div>`).join('')}` : ''}
    ${hostBar('<button class="primary" data-action="next">Start round 1</button>')}
    ${waitingForHost()}`;
}

function roundHeader(r) {
  const reader = r.readerId === state.you
    ? '📣 <strong>You</strong> read this one out loud!'
    : `📣 <strong>${esc(nameOf(r.readerId))}</strong> reads this one out loud`;
  if (r.type === 'secret') {
    return `
      <p class="tag">Chapter ${r.number} of ${state.totalRounds} · ${esc(r.title)}</p>
      ${r.previously.length ? `<div class="card"><p class="tag">Because of your last choices</p>${r.previously.map((o) => `<p class="small">→ ${esc(o)}</p>`).join('')}</div>` : ''}
      <div class="reader">${reader}</div>
      <p class="scene">${esc(r.scene)}</p>`;
  }
  return `
    <p class="tag">Round ${r.number} of ${state.totalRounds} · ${esc(ROUND_LABELS[r.type] || r.type)}</p>
    <div class="reader">${reader}</div>
    <p class="scene">${esc(r.scene)}</p>
    <p class="prompt">${esc(r.prompt)}</p>`;
}

// Your private brief: only you see this until the reveal.
function renderSecretAnswering(r) {
  if (!r.brief) return '<p class="muted">You joined after this chapter was written. Sit this one out.</p>';
  return `
    <div class="card secret">
      <p class="tag">🤫 Only you know this. Don't show your screen.</p>
      <p>${esc(r.brief.secret)}</p>
    </div>
    <p class="prompt">${esc(r.brief.prompt)}</p>
    <div class="stack">
      ${r.options.map((o) => `<button class="${r.yourAnswer === o.id ? 'selected' : ''}" data-action="answer" data-value="${esc(o.id)}">${esc(o.text)}${r.brief.pickPlayer && o.id === state.you ? ' <span class="muted">(you)</span>' : ''}</button>`).join('')}
    </div>
    <p class="small" style="margin-top:14px">Why? <span class="muted">(optional, shown to everyone at the reveal)</span></p>
    <input id="reason" data-keep maxlength="120" placeholder="Because…" autocomplete="off">`;
}

function renderAnswering() {
  const r = state.round;
  const waiting = state.players.filter((p) => p.connected && !r.answeredIds.includes(p.id));
  let instruction = '';
  if (r.type === 'predict') {
    instruction = r.targetId === state.you
      ? `<div class="card highlight">🎯 <strong>This one's about you.</strong> Pick what you'd honestly do. Everyone else is guessing your answer.</div>`
      : `<div class="card">🔮 Predict what <strong>${esc(nameOf(r.targetId))}</strong> will pick. They're answering for real.</div>`;
  } else if (r.type === 'vote_player') {
    instruction = '<p class="muted small">Vote for anyone, even yourself.</p>';
  }
  if (r.type === 'secret') {
    return `
      ${roundHeader(r)}
      ${renderSecretAnswering(r)}
      <p class="muted small center">${r.yourAnswer ? 'Locked in. You can still change it until everyone has decided.' : ''}</p>
      <p class="small">${waiting.length ? `Still deciding: ${waiting.map((p) => `<span class="pill">${esc(p.name)}</span>`).join('')}` : ''}</p>
      ${hostBar(`<button data-action="forceReveal">Reveal now (don't wait)</button>`)}`;
  }
  return `
    ${roundHeader(r)}
    ${instruction}
    <div class="stack">
      ${r.options.map((o) => `<button class="${r.yourAnswer === o.id ? 'selected' : ''}" data-action="answer" data-value="${esc(o.id)}">${esc(o.text)}${r.type === 'vote_player' && o.id === state.you ? ' <span class="muted">(you)</span>' : ''}</button>`).join('')}
    </div>
    <p class="muted small center">${r.yourAnswer ? 'Locked in. You can still change it until everyone has answered.' : ''}</p>
    <p class="small">${waiting.length ? `Waiting for: ${waiting.map((p) => `<span class="pill">${esc(p.name)}</span>`).join('')}` : ''}</p>
    ${hostBar(`<button data-action="forceReveal">Reveal now (don't wait)</button>`)}`;
}

function renderResult(r) {
  const res = r.result;
  if (r.type === 'choice') {
    const total = Math.max(1, Object.keys(r.answers).length);
    return res.byOption.map((o) => `
      <div class="card">
        <strong>${esc(o.text)}</strong>
        <div class="bar" style="width:${Math.max(2, (o.playerIds.length / total) * 100)}%"></div>
        <div class="names">${o.playerIds.length ? esc(namesOf(o.playerIds)) : 'nobody'}</div>
      </div>`).join('');
  }
  if (r.type === 'vote_player') {
    const total = Math.max(1, r.result.tally.reduce((sum, t) => sum + t.count, 0));
    const votersFor = (id) => (r.answers ? Object.keys(r.answers).filter((v) => r.answers[v] === id) : []);
    return `
      ${r.result.winners.length ? `<p class="center">The group has spoken:</p><p class="big-code" style="letter-spacing:0;font-size:2rem">${esc(namesOf(r.result.winners))}</p>` : ''}
      ${r.result.tally.filter((t) => t.count > 0).map((t) => `
        <div class="card ${r.result.winners.includes(t.playerId) ? 'highlight' : ''}">
          <strong>${esc(nameOf(t.playerId))}</strong> · ${t.count} vote${t.count === 1 ? '' : 's'}
          <div class="bar" style="width:${(t.count / total) * 100}%"></div>
          ${r.answers ? `<div class="names">voted by ${esc(namesOf(votersFor(t.playerId)))}</div>` : ''}
        </div>`).join('')}
      ${r.answers ? '' : `<p class="muted small center">Votes are anonymous… unless the host reveals them.</p>`}`;
  }
  if (r.type === 'predict') {
    const target = nameOf(r.targetId);
    const { actual, guesserIds, correctIds } = r.result;
    if (!actual) return `<div class="card">${esc(target)} didn't answer in time, so nobody wins this one.</div>`;
    const optText = (id) => (r.options.find((o) => o.id === id) || { text: '?' }).text;
    const verdict = correctIds.length === 0 ? 'Nobody saw that coming.'
      : correctIds.length === guesserIds.length ? `Everyone called it. ${target} is an open book.`
        : `${correctIds.length} of ${guesserIds.length} called it.`;
    return `
      <div class="card highlight center">
        <p class="tag">${esc(target)} actually chose</p>
        <p class="prompt" style="margin:6px 0">${esc(optText(actual))}</p>
        <p>${esc(verdict)}</p>
      </div>
      ${guesserIds.map((pid) => `
        <div class="card">
          ${correctIds.includes(pid) ? '✅' : '❌'} <strong>${esc(nameOf(pid))}</strong>
          <span class="names">guessed "${esc(optText(r.answers[pid]))}"</span>
        </div>`).join('')}`;
  }
  return '';
}

function answerLabel(r, pid) {
  const v = r.answers[pid];
  const opt = (id) => (r.options.find((o) => o.id === id) || { text: '?' }).text;
  if (r.type === 'vote_player') return v === pid ? 'voted for themselves 👀' : `voted for ${nameOf(v)}`;
  if (r.type === 'predict') return pid === r.targetId ? `chose "${opt(v)}"` : `guessed "${opt(v)}"`;
  return `chose "${opt(v)}"`;
}

// One card per answer. Tap an emoji to react to someone (tap again to undo).
function renderReactions(r) {
  if (!r.answers) return '';
  const ids = Object.keys(r.answers);
  if (!ids.length) return '';
  // Your own card last, so the others are what you see first.
  ids.sort((a, b) => (a === state.you) - (b === state.you));
  return `
    <h2>React</h2>
    ${ids.map((pid) => `<div class="card">
        <strong>${pid === state.you ? 'You' : esc(nameOf(pid))}</strong> <span class="names">${esc(answerLabel(r, pid))}</span>
        ${emojiRow(r, pid)}
      </div>`).join('')}`;
}

function emojiRow(r, pid) {
  const byReactor = (r.reactions && r.reactions[pid]) || {};
  const count = (e) => Object.values(byReactor).filter((x) => x === e).length;
  const yours = byReactor[state.you];
  const own = pid === state.you;
  const buttons = r.reactionEmojis.map((e) => {
    const c = count(e);
    if (own) return c ? `<span class="pill">${e} ${c}</span>` : '';
    return `<button class="emoji ${yours === e ? 'selected' : ''}" data-action="react" data-target="${esc(pid)}" data-value="${e}">${e}${c ? `<small>${c}</small>` : ''}</button>`;
  }).join('');
  return `<div class="emoji-row">${buttons || (own ? '<span class="muted small">No reactions yet</span>' : '')}</div>`;
}

// Secret reveal: one card per player, newest last, each with what they knew, did, why, and what happened.
function renderSecretReveal(r) {
  const cards = r.reveals.map((x, i) => `
    <div class="card reveal-card ${i === r.reveals.length - 1 ? 'highlight' : ''}">
      <p class="tag">${x.playerId === state.you ? 'You' : esc(nameOf(x.playerId))} · ${esc(state.cast.roles[x.playerId].title)}</p>
      <p class="small">🤫 <em>${esc(x.secret)}</em></p>
      <p class="small muted">${esc(x.prompt)}</p>
      ${x.answered ? `<p class="prompt" style="margin:6px 0">${esc(x.choice)}</p>` : '<p><strong>Didn\'t decide in time.</strong></p>'}
      ${x.reason ? `<p>💬 "${esc(x.reason)}"</p>` : ''}
      ${x.outcome ? `<p class="small">→ ${esc(x.outcome)}</p>` : ''}
      ${x.answered ? emojiRow(r, x.playerId) : ''}
    </div>`).join('');
  const next = r.nextRevealId
    ? `<p class="muted center">${r.reveals.length ? 'Next up' : 'First up'}: <strong>${esc(r.nextRevealId === state.you ? 'you' : nameOf(r.nextRevealId))}</strong>. Ask them why before you react.</p>`
    : '';
  return cards + next;
}

function renderReveal() {
  const r = state.round;
  if (r.type === 'secret') {
    return `
      <p class="tag">Chapter ${r.number} of ${state.totalRounds} · ${esc(r.title)} · The reveal</p>
      <p class="scene">${esc(r.scene)}</p>
      ${renderSecretReveal(r)}
      ${hostBar(r.allRevealed
        ? `<button class="primary" data-action="next">${r.isLast ? 'See the recap' : 'Next chapter'}</button>`
        : `<button class="primary" data-action="revealNext">Reveal ${esc(r.nextRevealId === state.you ? 'your' : `${nameOf(r.nextRevealId)}'s`)} decision</button>`)}
      ${waitingForHost()}`;
  }
  return `
    <p class="tag">Round ${r.number} of ${state.totalRounds} · Results</p>
    <p class="prompt">${esc(r.prompt)}</p>
    ${renderResult(r)}
    ${renderReactions(r)}
    ${hostBar(`${r.type === 'vote_player' && !r.votersRevealed ? '<button data-action="revealVoters">Reveal who voted for whom 👀</button>' : ''}
      <button class="primary" data-action="next">${r.isLast ? 'See the recap' : 'Next round'}</button>`)}
    ${waitingForHost()}`;
}

function renderRecap() {
  const { stats, gm } = state.recap;
  return `
    <p class="tag">${esc(state.world.emoji)} ${esc(state.world.name)} · The end</p>
    <h1>Recap</h1>
    ${gm.epilogue ? `<p class="scene">${esc(gm.epilogue)}</p>` : ''}
    <h2>Who you were</h2>
    ${state.players.map((p) => {
      const t = gm.titles[p.id];
      const awards = stats.awards.filter((a) => a.playerIds.includes(p.id));
      return `<div class="card ${p.id === state.you ? 'highlight' : ''}">
        <strong>${esc(p.name)}</strong> <span class="muted small">(${esc(state.cast.roles[p.id].title)})</span>
        ${state.traits ? `<br><span class="small muted">${esc(state.traits[p.id].label)}</span>` : ''}
        ${stats.signature[p.id] ? `<span style="float:right" title="Most-received reaction">${stats.signature[p.id].emoji}×${stats.signature[p.id].count}</span>` : ''}
        ${t ? `<h3 style="margin:6px 0 2px">🏆 ${esc(t.title)}</h3>${t.reason ? `<p class="small">${esc(t.reason)}</p>` : ''}` : ''}
        ${stats.seenAs[p.id].map((v) => `<p class="small">🗳️ ${esc(v.prompt)} <strong>${v.votes}/${v.of}</strong></p>`).join('')}
        ${awards.map((a) => `<p class="small"><span class="pill">${esc(a.label)}</span> ${esc(a.detail)}</p>`).join('')}
      </div>`;
    }).join('')}
    ${gm.memories.length ? `<h2>Memories</h2>${gm.memories.map((m) => `<div class="card">💬 ${esc(m)}</div>`).join('')}` : ''}
    <h2>Key moments</h2>
    ${stats.moments.map((m) => `<div class="card"><p class="tag">${m.type === 'secret' ? 'Chapter' : 'Round'} ${m.round}</p><strong>${esc(m.prompt)}</strong>${m.lines ? m.lines.map((l) => `<p class="small">→ ${esc(l)}</p>`).join('') : `<p class="small">${esc(m.outcome)}</p>`}</div>`).join('')}
    ${hostBar('<button class="primary" data-action="playAgain">Play again (same group)</button>')}`;
}

const SCREENS = {
  lobby: renderLobby,
  world: renderWorld,
  quiz: renderQuiz,
  loading: renderLoading,
  roles: renderRoles,
  answering: renderAnswering,
  reveal: renderReveal,
  recap: renderRecap,
};

function render() {
  if (!state) {
    $app.innerHTML = renderHome();
    return;
  }
  // State pushes re-render the whole screen; keep whatever the player is typing.
  const kept = [...document.querySelectorAll('[data-keep]')].map((el) => ({ id: el.id, value: el.value, focused: el === document.activeElement, pos: el.selectionStart }));
  const screen = SCREENS[state.phase];
  const footer = `<div class="footer">Room ${esc(state.code)} · you are ${esc(me() ? me().name : '?')}${state.gmSource ? ` · GM: ${esc(state.gmSource)}` : ''}
    <br><button class="link" data-action="leave">Leave game</button></div>`;
  $app.innerHTML = (screen ? screen() : `<p>Unknown phase: ${esc(state.phase)}</p>`) + footer;
  for (const k of kept) {
    const el = document.getElementById(k.id);
    if (!el) continue;
    el.value = k.value;
    if (k.focused) { el.focus(); el.setSelectionRange(k.pos, k.pos); }
  }
  // Bring each newly revealed decision into view (it's added at the bottom).
  const revealKey = state.phase === 'reveal' && state.round && state.round.reveals ? `${state.round.number}:${state.round.reveals.length}` : null;
  if (revealKey && revealKey !== render.lastReveal && state.round.reveals.length) {
    const cards = $app.querySelectorAll('.reveal-card');
    cards[cards.length - 1].scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  render.lastReveal = revealKey;
  // First render of a secret round: prefill the reason you already sent (e.g. after a reload).
  const reason = document.getElementById('reason');
  if (reason && !kept.some((k) => k.id === 'reason') && state.round) reason.value = state.round.yourReason || '';
}

// ---------- input ----------

const ACTIONS = {
  create() {
    send('create', { name: document.getElementById('name').value });
  },
  join() {
    send('join', { name: document.getElementById('name').value, code: document.getElementById('code').value });
  },
  rejoin() {
    resume(readStore(localStorage));
  },
  leave() {
    if (!confirm('Leave this game? You can rejoin it from the home screen on this device.')) return;
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
    location.href = '/';
  },
  start: () => send('start'),
  voteWorld: (v) => send('voteWorld', { worldId: v }),
  lockWorld: () => send('lockWorld'),
  next: () => send('next'),
  answer: (v) => send('answer', { value: v, reason: reasonText() }),
  quizVote: (v, btn) => send('quizAnswer', { traitId: btn.dataset.trait, playerId: v }),
  forceQuiz: () => send('forceQuiz'),
  revealNext: () => send('revealNext'),
  react: (v, btn) => send('react', { targetId: btn.dataset.target, emoji: v }),
  forceReveal: () => send('forceReveal'),
  revealVoters: () => send('revealVoters'),
  playAgain: () => send('playAgain'),
};

function reasonText() {
  const el = document.getElementById('reason');
  return el ? el.value : undefined;
}

// Editing your reason after choosing re-sends the answer so the reason is saved.
document.addEventListener('change', (e) => {
  if (e.target.id === 'reason' && state && state.round && state.round.yourAnswer) {
    send('answer', { value: state.round.yourAnswer, reason: e.target.value });
  }
});

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn || btn.disabled) return;
  const fn = ACTIONS[btn.dataset.action];
  if (fn) fn(btn.dataset.value, btn);
});
