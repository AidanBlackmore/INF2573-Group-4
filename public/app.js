'use strict';
const socket = io();
const app = document.querySelector('#app');
const params = new URLSearchParams(location.search);
let entrance = params.has('room') ? 'join' : 'title', publicTab = 'Story';
let state, tab = 'Now', connected = false, busy = false, lan = location.origin;
let recapIndex = 0, recapPaused = false, recapFinished = false, recapElapsed = 0;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const read = (key, storage = sessionStorage) => { try { return storage.getItem(key); } catch { return null; } };
const save = (key, value, storage = sessionStorage) => { try { storage.setItem(key, value); } catch { toast('This browser cannot save locally. Keep this tab open.'); } };
let credential; try { credential = JSON.parse(read('last-light-session')); } catch { credential = null; }
const btn = (text, type, value = '', disabled = false, cls = '') => `<button class="${cls}" data-action="${type}" data-value="${esc(value)}" ${disabled ? 'disabled' : ''}>${text}</button>`;
function toast(message) { const el = document.querySelector('#toast'); el.textContent = message; el.hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => el.hidden = true, 6000); }
function send(event, payload = {}) {
  if (!connected) { toast('Connection lost. Your saved actions will return when connected.'); return; }
  if (busy) return;
  busy = true;
  socket.timeout(6000).emit(event, payload, (error, response) => { busy = false; if (error || !response?.ok) toast(error ? 'No response yet. Reconnect and check your saved action before trying again.' : response.error); });
}
function act(type, data = {}) { send('action', { type, round: state.round, stage: state.stage, ...data }); }
function header() { return `<header><a class="brand" href="/">THE GATHERING <span>Last Light at Rain House</span></a><span class="pill" id="connection">${connected ? '● Connected' : '○ Reconnecting'}</span></header>`; }
function paperize() {
  document.querySelectorAll('input,select').forEach(el => { if(el.parentElement.classList.contains('field-shell')) return; const shell=document.createElement('span');shell.className='field-shell';el.before(shell);shell.append(el); });
  document.querySelectorAll('.card, button, .title-paper, .banner, .floor-plan, .field-shell').forEach(el => {
    if (el.querySelector(':scope > .paper-shape')) return;
    const paper = document.createElement('span'); paper.className = 'paper-shape'; paper.setAttribute('aria-hidden','true');
    paper.innerHTML = '<i></i>'.repeat(9); el.prepend(paper);
  });
}
function welcome() {
  document.body.dataset.backdrop = entrance === 'title' ? 'title' : 'phone'; app.className = 'entrance';
  if (entrance === 'title') {
    app.innerHTML = `<div class="title-screen"><div class="title-paper"><h1>THE GATHERING</h1><p>LAST LIGHT AT RAIN HOUSE</p><img class="wax-seal" src="/assets/figma/WaxSeal.svg" alt=""></div><div class="title-actions">${btn('Start Game','entrance','join')}${btn('How to Play','entrance','help')}</div><p class="title-footnote">4–6 players · One shared screen · Your own phones</p></div>`;
  } else if (entrance === 'help') {
    app.innerHTML = `<section class="card entry-card"><h1>An invitation. A blackout. A secret.</h1><p>Alex has invited you back to Rain House. Before dinner is over, the lights will go out—and one of you will make sure he never leaves.</p><ol><li>Join with your own name. Read your fictional identity and what you stand to lose.</li><li>Discuss the sealed letter, then vote privately. Search it with a shared die roll.</li><li>In the blackout, choose where to search. The murderer secretly chooses a room and a weapon.</li><li>Discover the crime, choose a search priority, and compare your different clues.</li><li>Verify records, decide how much of the archive to open, and connect the door code to a name.</li><li>Accuse independently. The ending reveals the evidence chain and your group’s story.</li></ol><p><strong>Every shared roll:</strong> 1–2 keeps the guaranteed findings; 3–5 adds one clue; 6 adds two. No roll stops the story.</p><p>Speaking turns happen during group decisions. You can pass. No one is eliminated and no acting is required.</p>${btn('Join the Case','entrance','join')}${btn('Back','entrance','title')}</section>`;
  } else {
    app.innerHTML = `<section class="card entry-card"><h1>Join the Case</h1><form id="entry"><label>ROOM CODE<input name="code" class="code" maxlength="4" value="${esc(params.get('room') || '')}" placeholder="Enter code" autocomplete="off"></label><label>YOUR NAME<input name="name" maxlength="24" autocomplete="given-name" placeholder="Your name" required></label><p class="muted">An invitation is waiting. Bring your name; we’ll give you a secret.</p><div class="entry-actions"><button name="mode" value="join">Enter</button><button name="mode" value="create">Host a new game</button></div></form><details><summary>Recover my seat</summary><form id="recovery"><label>Room code<input name="code" maxlength="4" required></label><label>Private recovery credential<input name="token" required autocomplete="off"></label><button>Rejoin</button></form></details>${btn('How to Play','entrance','help','', 'quiet')}</section>`;
  }
  paperize();
}
function names() { return state.players.map((p,i) => `<span class="pill ${p.connected ? '' : 'off'}"><img class="pin" src="/assets/figma/pin${i || ''}.svg" alt="">${esc(p.name)}${p.id === state.hostId ? ' · Host' : ''}${!p.connected ? ' · Away' : ''}</span>`).join(''); }
const playerName = id => state.players.find(p => p.id === id)?.name || 'Not enough evidence';
function board() {
  return `<section class="evidence"><div class="section-heading"><h2>Shared evidence</h2><span class="muted">${state.board.length} records</span></div><p class="muted small">Official evidence is accurate. Published cards stay here.</p><div class="board-grid">${['People','Rooms','Objects','Timeline'].map(category => `<section><h3>${category}</h3>${state.board.filter(c => c.category === category).map(c => cardHTML(c)).join('') || '<p class="empty">No evidence shared yet.</p>'}</section>`).join('')}</div>${state.statements.length ? `<h3>Unverified statements</h3>${state.statements.map(c => `<article class="card claim"><div class="tag">Unverified statement · ${esc(c.name)}</div><p>${esc(c.text)}</p></article>`).join('')}` : ''}</section>`;
}
function cardHTML(c, share = false) { return `<article class="card clue"><div class="tag">${esc(c.id)} · ${esc(c.category)}</div><h3>${esc(c.title)}</h3><p class="preline">${esc(c.text)}</p>${c.sharedBy ? `<p class="muted small">Shared by ${esc(c.sharedBy)}</p>` : ''}${share ? btn(state.board.some(x => x.id === c.id) ? 'On the shared board ✓' : 'Share on screen', 'share', c.id, state.stage === 'ending' || state.board.some(x => x.id === c.id)) : ''}</article>`; }
function options(values, selected, empty = false) { return `${empty ? '<option value="">Not enough evidence</option>' : ''}${values.map(v => { const [value, label] = Array.isArray(v) ? v : [v,v]; return `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(label)}</option>`; }).join('')}`; }
function select(name, label, values, selected, empty = false) { return `<label>${label}<select name="${name}">${options(values, selected, empty)}</select></label>`; }
function lobby() {
  const base = location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? lan : location.origin;
  return `<h1 class="banner">The Gathering</h1><div class="lobby-grid"><section class="card join-card"><h2>Join the Case</h2><img class="qr-code" src="/join-qr?room=${state.code}" alt="Scan to join this room"><div class="big-code">${esc(state.code)}</div><p>Scan with your phone, or open:</p><a class="join-url" href="${esc(base)}/?room=${state.code}">${esc(base)}/?room=${state.code}</a><p class="small muted">Use the same Wi-Fi. Keep private phones off the projector.</p></section><section class="card guest-card"><h2>Detectives</h2><p class="muted">${state.players.length} / 6 have arrived · minimum 4</p><div class="guest-list">${names()}</div><p class="handwriting">Everyone has something to lose.</p>${state.me ? '<p><a target="_blank" rel="noopener" href="/?screen='+state.code+'">Open the shared screen ↗</a></p>' : '<p>Start the night from the host’s phone.</p>'}</section></div>${state.me?.id === state.hostId ? btn('Begin the Night', 'start', '', state.players.length < 4, 'primary begin-night') : '<p class="center outside-note">Waiting for the host to begin.</p>'}<details class="card lobby-guide"><summary>Before the first candle burns out</summary><p>Read your short fictional identity when the host begins. You can speak naturally, pass your turn, and keep clues private. Your notebook never enters the recap. No one is eliminated.</p><p>Guests win if a strict majority of innocent guests identifies the murderer, weapon, and room. “Not enough evidence” is always available.</p></details>`;
}
function houseMap() {
  return `<h1 class="banner">Rain House</h1><section class="floor-plan"><div class="map-rooms">${state.house.map((room,i)=>`<div class="map-room room-${i} ${state.result?.room===room?'crime-room':''}"><h2>${esc(room)}</h2>${state.result?.room===room ? '<p>The crime happened here</p>' : ''}</div>`).join('')}</div><p class="map-caption">${state.result ? 'The final evidence identifies the scene. No player movement is inferred from this map.' : 'A guide to the house. Search choices are private; the map does not reveal anyone’s whereabouts.'}</p></section>`;
}
function publicDecision() {
  const d=state.decision;
  if(!d || !['speaking','vote'].includes(state.stage))return '';
  return `<section class="card"><h2>${esc(d.question)}</h2><p>${esc(d.prompt)}</p><div class="public-options"><p><strong>A · ${esc(d.A)}</strong><br>${esc(d.effectA)}</p><p><strong>B · ${esc(d.B)}</strong><br>${esc(d.effectB)}</p><p>No preference is available.</p></div><p>${state.completed} / ${state.players.length} choices saved. Vote privately on your phone; results appear together.</p></section>`;
}
function objective() {
  const role = state.me.role;
  return `<section class="card secret"><div class="tag">Your invitation · private</div><h2>${esc(role.title)}</h2><p>${esc(role.relationship)}</p><h3>What you came here carrying</h3><p>${esc(role.secret)}</p><h3>What Alex could take from you</h3><p>${esc(role.motive)}</p><h3>Your objective</h3>${state.me.objective === 'murderer' ? '<p>Tonight, you are the one who decides Alex will not leave this house alive. Keep the others from connecting your name to the room and the weapon. In the blackout round, choose both privately.</p><p>You may mislead in conversation or keep a clue to yourself. Official records cannot be changed.</p>' : '<p>You have a reason to fear Alex, but you did not kill him. Find the person who did. Your history explains why you came; the evidence must explain what happened in the dark.</p>'}<p class="muted">This is a fictional identity, not a claim about you. Speak naturally; you do not need to perform a character.</p>${state.me.selection?.room && state.round >= 3 ? `<p>Your locked choices: ${esc(state.me.selection.room)} · ${esc(state.me.selection.weapon)}</p>` : ''}</section>`;
}
function cast() {
  return `<details class="card"><summary>The people at Alex’s table</summary>${state.players.map(p => `<h3>${esc(p.name)} · ${esc(p.roleTitle)}</h3><p>${esc(p.introduction)}</p>`).join('')}</details>${state.me && state.round === 1 ? '<p class="muted">Before choosing, open <strong>My objective</strong> to read your invitation and what Alex knows about you.</p>' : ''}`;
}
function dicePreview() {
  const rules = state.diceRules;
  return `<section class="card"><div class="tag">One search · one shared roll</div><h2>${esc(rules.action)}</h2><p>${esc(rules.guaranteed)}</p>${rules.bands.map(b => `<p><strong>${b.range}</strong> — ${esc(b.text)}</p>`).join('')}<p class="muted">${esc(playerName(state.rollerId))} searches for the group. Private rewards can be shared afterwards.</p></section>`;
}
function diceResult() {
  const d = state.dice[state.round];
  return `<section class="card highlight"><div class="tag">${esc(d.action)} · ${esc(d.roller)}</div><h2>Rolled ${d.value} · ${d.extraCount} extra ${d.extraCount === 1 ? 'clue' : 'clues'}</h2><p>${esc(d.text)}</p>${d.rewards.length ? `<h3>What changed</h3>${d.rewards.map(x => `<p><strong>${esc(x.title)}</strong><br>${esc(x.recipient)} → ${esc(x.destination)}</p>`).join('')}` : '<p>No bonus this time. Your guaranteed evidence remains available; continue with the discussion.</p>'}${state.me && d.rewards.some(x=>x.recipient===state.me.name) ? '<button data-tab="My clues">Read my new clues</button>' : ''}</section>`;
}
function verification() {
  const me = state.me;
  const extra = Boolean(me.submission && me.extraVerification);
  if (me.submission && !extra) return '<p class="saved">✓ Your verification is saved in My clues.</p>';
  return `<section class="card"><h2>${extra ? 'Your extra envelope follow-up' : 'Choose a record to verify'}</h2><p>Everyone gets their own copy. Another player cannot block your access.</p>${state.round === 4 ? '<p class="muted">Guest register: available next round.</p>' : '<p class="highlight-text">The guest register is now available. Combine it with the door log.</p>'}<div class="stack">${[['K2','Check the timing'],['K3','Inspect the door log'],...(state.round === 5 ? [['K4','Read the guest register']] : []),['K5','Examine scene traces'],['K6','Check the objects'],['pass','Pass — receive a missing record']].map(([k,label]) => btn(label, extra ? 'verifyExtra' : 'verify', k)).join('')}</div></section>`;
}
function controls() {
  if (!state.me) return '<p class="muted">Make your private choices on your phone.</p>';
  const me = state.me;
  if (state.stage === 'briefing') return objective() + btn(me.submission ? 'Ready · waiting for the table' : 'I’ve read my invitation', 'ready', '', Boolean(me.submission), 'primary');
  if (state.stage === 'speaking' || state.stage === 'vote') {
    const d = state.decision;
    const speaking = state.stage === 'speaking' ? (state.speaker.id === me.id ? btn('Finish my turn / Pass', 'pass', '', false, 'primary') : '<p class="muted">Listen, weigh the choice, and vote whenever you are ready.</p>') : '';
    return `${speaking}<section class="card"><h2>${esc(d.question)}</h2><p>${esc(d.prompt)}</p><div class="stack">${[['A',d.A],['B',d.B],['N','No preference']].map(([k,label]) => btn(label + (me.submission === k ? ' ✓ Saved privately' : ''), 'vote', k, false, me.submission === k ? 'selected' : '')).join('')}</div><p><strong>If A:</strong> ${esc(d.effectA)}</p><p><strong>If B:</strong> ${esc(d.effectB)}</p><p class="small muted">Vote while the discussion is happening. You can change your mind until the host closes voting after the speaking turns. A needs more votes than B; ties choose B.</p></section>`;
  }
  if (state.round === 2 && state.stage === 'action') return `<form id="search" class="card"><h2>Where will you look first?</h2>${select('search','Your search after the lights return',[...state.house,'Observe'],me.submission?.search)}${me.objective === 'murderer' ? `<div class="secret-fields"><h3>Your secret choices</h3>${select('room','Where the crime happens',state.rooms,me.selection?.room)}${select('weapon','What was used',state.weapons,me.selection?.weapon)}</div>` : ''}<button class="primary">${me.submission ? 'Update saved choices' : 'Save choices privately'}</button><p class="muted small">Choices lock when the round closes.</p></form>`;
  if ((state.round === 4 && state.stage === 'action') || state.stage === 'verify') return verification();
  if (state.stage === 'dice') return state.rollerId === me.id ? btn('Search now · roll the die', 'roll', '', false, 'primary') : `<p class="muted">Waiting for ${esc(playerName(state.rollerId))} to search.</p>`;
  if (state.stage === 'accuse') return `<form id="accusation" class="card"><h2>Your independent accusation</h2><p>Choose for yourself. No partial results are revealed.</p>${select('murderer','Who caused Alex’s death?',state.players.map(p => [p.id,p.name]),me.submission?.murderer,true)}${select('weapon','What was used?',state.weapons,me.submission?.weapon,true)}${select('room','Where did it happen?',state.rooms,me.submission?.room,true)}<button class="primary">${me.submission ? 'Update my ballot' : 'Submit my ballot'}</button><p class="muted small">Revise until voting closes. Missing answers default to Not enough evidence.</p></form>`;
  return '<p class="muted">Time to talk. Share clues, connect evidence, or ask a question. Answering is optional.</p>';
}
function statement() { return `<details class="card"><summary>Add an unverified statement · optional</summary><form id="statement"><label>Choose a statement<select name="statement">${state.house.map(x=>`<option value="sound|${esc(x)}">I think the sound came from the ${esc(x)}.</option>`).join('')}${state.weapons.map(x=>`<option value="object|${esc(x)}">Someone may have handled the ${esc(x)} before dinner.</option>`).join('')}${state.players.map(p=>`<option value="doubt|${p.id}">I’m not convinced this proves ${esc(p.name)} did it.</option>`).join('')}</select></label><button>Publish as an unverified statement</button><p class="small muted">One statement per player. Spoken discussion is unrestricted.</p></form></details>`; }
function hostControls() {
  if (state.me?.id !== state.hostId || state.stage === 'ending') return '';
  const labels = {briefing:'Everyone has read their invitation · begin the discussion',speaking:'Advance speaking turn',vote:'Close voting and reveal the result',dice:'Roll for the absent player',action:'Resolve actions and continue',verify:'Finish verification',discussion:state.round === 6 ? 'Open private accusations' : 'Begin the next round',accuse:'Close ballots and reveal the truth'};
  return `<section class="card host"><h3>You’re hosting · next step</h3><p>${state.completed}/${state.players.length} choices saved.</p><p class="small">Continue when the group is ready. Missing votes become No preference; searches become Observe; verifications receive a missing record; accusations become Not enough evidence. Missing murderer choices are random.</p>${btn(labels[state.stage] || 'Continue', 'next', '', false, 'primary')}</section>`;
}
function ending() {
  const r = state.result;
  return `<section class="card highlight"><div class="tag">The truth at Rain House</div><h2>${esc(r.murdererName)} · ${esc(r.room)} · ${esc(r.weapon)}</h2><p>${esc(r.murdererName)} arranged the blackout and drew Alex away from dinner.</p><blockquote>${esc(r.confession)}</blockquote><p>The sale gave everyone a reason to fear Alex. It was the time, the door record, and the matching object—not the strongest grudge—that identified the killer.</p><details><summary>What everyone had to lose</summary>${r.motives.map(m=>`<p><strong>${esc(m.name)} · ${esc(m.title)}</strong><br>${esc(m.motive)}</p>`).join('')}</details><p><strong>K1</strong> identifies the room. <strong>K2 + K3 + K4</strong> connect the incident time to one guest code and its owner. <strong>K5 + K6</strong> match the recovered trace to the weapon.</p><p>There was no accomplice, hidden entrance, transferred card, remote mechanism, or moved body. Earlier handling of an object was not proof of guilt.</p><h3>${r.guestsWin ? 'The guests connected the evidence.' : 'The murderer kept the pieces apart.'}</h3><p>${r.correct} correct guest ballots; ${r.needed} required. The murderer’s ballot does not count.</p></section><details class="card"><summary>Reveal all final ballots</summary>${r.ballots.map(b=>`<p><strong>${esc(b.name)}</strong><br>${esc(playerName(b.murderer))} · ${esc(b.weapon || 'Not enough evidence')} · ${esc(b.room || 'Not enough evidence')}</p>`).join('')}</details><section class="card"><div class="tag">Your evening, remembered</div><h2>The night you made</h2><div id="recap-window" class="recap-window" aria-live="polite"></div><div class="row">${btn(recapPaused ? 'Resume' : 'Pause','recapPause')}${btn('Skip','recapSkip')}${btn('Read again','recapAgain')}</div><details><summary>Read the complete recap</summary>${state.recap.map(x=>`<p>${esc(x)}</p>`).join('')}</details></section><p class="muted">Did anyone’s explanation make you see a choice differently? Talk about it if you want—or start another game.</p>${btn('Return to the entrance', 'leave')}`;
}
function scenePanel(publicScreen) {
  const storyText = `<p class="scene preline">${esc(state.scene)}</p>`;
  return `<section class="card scene-card"><div class="tag">Chapter ${state.round} of 6</div><h1>${esc(state.title)}</h1>${publicScreen ? storyText : `<details><summary>Read this chapter</summary>${storyText}</details>`}</section>`;
}
function render() {
  if (!state) return welcome();
  const publicScreen = !state.me;
  app.className = publicScreen ? 'shared-screen' : 'phone';
  document.body.dataset.backdrop = !publicScreen ? 'phone' : !state.round ? 'lobby' : publicTab === 'Evidence' ? 'evidence' : publicTab === 'House' ? 'map' : state.stage === 'ending' ? 'ending' : state.round === 2 ? 'blackout' : ['speaking','vote','accuse'].includes(state.stage) ? 'vote' : 'map';
  let body;
  if (!state.round) body = lobby();
  else if (publicScreen && publicTab === 'Evidence') body = board();
  else if (publicScreen && publicTab === 'House') body = houseMap();
  else if (publicScreen && publicTab === 'Guests') body = '<h1 class="banner">The Suspects</h1><div class="cast-grid">'+state.players.map((p,i)=>`<section class="card"><img class="pin" src="/assets/figma/pin${i||''}.svg" alt=""><h2>${esc(p.name)}</h2><h3>${esc(p.roleTitle)}</h3><p>${esc(p.introduction)}</p></section>`).join('')+'</div>';
  else if (tab === 'Notebook' && state.me) body = `<section class="card"><h2>Your private notebook</h2><p class="muted">Optional. Saved only in this browser. Never sent to the server or included in the recap.</p><label>Suspicions, connections, questions<textarea id="notes" rows="14" placeholder="What connects? What is still missing?"></textarea></label><span id="note-status" class="small muted">Saved on this device</span></section>`;
  else if (tab === 'My objective' && state.me) body = objective();
  else if (tab === 'My clues' && state.me) body = `<h2>Evidence you helped examine</h2><p class="muted">These official reports do not imply you searched the scene.</p>${state.me.searchResult ? `<div class="card"><div class="tag">Your search result</div><p>${esc(state.me.searchResult)}</p></div>` : ''}${state.me.clues.map(c=>cardHTML(c,true)).join('') || '<p class="empty">Your first reports arrive when Alex is found. A lucky envelope search may reveal something earlier.</p>'}`;
  else body = state.stage === 'ending' ? ending() + board() : `${scenePanel(publicScreen)}${state.stage === 'briefing' && state.me ? '' : cast()}${state.speaker ? `<section class="card highlight"><div class="tag">Turn ${state.speaker.position} of ${state.players.length}</div><h2>${esc(playerName(state.speaker.id))}, your turn.</h2><p>${esc(state.decision.prompt)}</p><strong class="timer" data-until="${state.speaker.until}"></strong><p class="muted">Passing is fine.</p></section>` : ''}${state.stage === 'discussion' || state.stage === 'accuse' ? `<p class="muted">Suggested ${state.stage === 'accuse' ? 'ballot' : 'discussion'} time <strong class="timer" data-until="${state.discussionUntil}"></strong> · The host controls pacing.</p>` : ''}${state.tally ? `<section class="card"><h3>You chose: ${esc(state.decision[state.decisions[state.round]])}</h3><p>${esc(state.decisions[state.round] === 'A' ? state.decision.effectA : state.decision.effectB)}</p><p>A: ${state.tally.A} · B: ${state.tally.B} · No preference: ${state.tally.N}</p></section>` : ''}${state.stage === 'dice' ? dicePreview() : ''}${state.dice[state.round] ? diceResult() : ''}${publicScreen ? publicDecision() : controls()}${state.round === 4 && state.me && !state.statements.some(x=>x.playerId===state.me.id) ? statement() : ''}${hostControls()}${publicScreen ? '' : `<details class="public-evidence"><summary>Shared evidence · ${state.board.length} records</summary>${board()}</details>`}`;
  const focus = document.activeElement; const focusName = focus?.name; const formId = focus?.form?.id;
  const draft = formId && document.getElementById(formId) ? Object.fromEntries(new FormData(document.getElementById(formId))) : null;
  app.innerHTML = `${header()}<div class="session-bar"><span>RAIN HOUSE / ${state.code}</span><span>${publicScreen ? 'Shared screen · public information only' : esc(state.me.name) + ' · private phone'}</span></div>${state.round ? `<div class="round-track" aria-label="Round ${state.round} of 6">${['Envelope','Blackout','Discovery','Investigation','Archive','Accusation'].map((x,i)=>`<span class="${i+1===state.round?'current':i+1<state.round?'complete':''}">${i+1}<small>${x}</small></span>`).join('')}</div>` : ''}${publicScreen && state.round ? `<nav aria-label="Shared screen views">${['Story','Evidence','House','Guests'].map(x=>`<button data-public-tab="${x}" aria-current="${publicTab===x?'page':'false'}" class="${publicTab===x?'selected':''}">${x}</button>`).join('')}</nav>` : ''}${state.me && state.round ? `<nav aria-label="Phone tabs">${['Now','My clues','Notebook','My objective'].map(x=>`<button data-tab="${x}" aria-current="${tab === x ? 'page' : 'false'}" class="${tab===x?'selected':''}">${x}${x==='My clues' ? ` (${state.me.clues.length})` : ''}</button>`).join('')}</nav>` : ''}<div class="content">${state.round && ['briefing','speaking','vote','action','verify','accuse'].includes(state.stage) ? `<p class="muted small" role="status">${state.completed} of ${state.players.length} actions saved privately</p>` : ''}${body}</div><footer class="footer">${names()}${state.me ? `<details><summary>Private recovery credential</summary><p>Keep this secret. It restores access to your phone if this tab is lost.</p><code>${esc(credential?.token)}</code></details>` : ''}<p>No elimination · No acting · No personal disclosures</p></footer>`;
  if (draft && document.getElementById(formId)) { for (const [name,value] of Object.entries(draft)) { const input = document.getElementById(formId).elements.namedItem(name); if(input) input.value=value; } document.getElementById(formId).elements.namedItem(focusName)?.focus(); }
  const notes = document.querySelector('#notes'); if (notes) notes.value = read(noteKey(), localStorage) || '';
  paperize(); updateTimers(); updateRecap();
}
function noteKey() { return `last-light-notes:${state.gameId}:${state.me.id}`; }
function updateTimers() { document.querySelectorAll('.timer').forEach(el => { const seconds=Math.max(0,Math.ceil((Number(el.dataset.until)-Date.now())/1000)); el.textContent=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`; }); }
function updateRecap() { const el=document.querySelector('#recap-window'); if(el && state?.recap) { el.innerHTML=recapFinished ? state.recap.map(x=>`<p>${esc(x)}</p>`).join('') : `<p class="recap-line">${esc(state.recap[recapIndex])}</p><small>${recapIndex+1} / ${state.recap.length}</small>`; el.classList.toggle('finished',recapFinished); } }
setInterval(()=>{updateTimers(); if(state?.stage==='ending' && !recapPaused && !recapFinished && tab==='Now') { recapElapsed++; if(recapElapsed>=8) { recapElapsed=0; recapIndex++; if(recapIndex>=state.recap.length) recapFinished=true; updateRecap(); } }},1000);
app.addEventListener('input', e=>{ if(e.target.id==='notes') save(noteKey(),e.target.value,localStorage); });
app.addEventListener('submit', e=>{
  e.preventDefault(); const d=Object.fromEntries(new FormData(e.target));
  if(e.target.id==='entry') send(e.submitter.value,{name:d.name,code:d.code});
  if(e.target.id==='recovery') send('resume',d);
  if(e.target.id==='search') act('search',d);
  if(e.target.id==='accusation') act('accuse',d);
  if(e.target.id==='statement') { const [kind,value]=d.statement.split('|'); act('statement',{kind,value}); }
});
app.addEventListener('click', e=>{
  const b=e.target.closest('button'); if(!b)return;
  if(b.dataset.publicTab){publicTab=b.dataset.publicTab;render();return;}
  if(b.dataset.tab){tab=b.dataset.tab;render();return;}
  const type=b.dataset.action, value=b.dataset.value; if(!type)return;
  if(type==='entrance'){entrance=value;welcome();return;}
  if(type==='leave'){sessionStorage.removeItem('last-light-session'); location.href='/';return;}
  if(type==='recapPause'){recapPaused=!recapPaused;b.textContent=recapPaused?'Resume':'Pause';paperize();return;}
  if(type==='recapSkip'){recapFinished=true;updateRecap();return;}
  if(type==='recapAgain'){recapIndex=0;recapElapsed=0;recapPaused=false;recapFinished=false;render();return;}
  if(type==='verifyExtra') act('verify',{value,extra:true}); else act(type,{value});
});
socket.on('connect',()=>{
  connected=true;
  if(params.get('screen')) send('watch',{code:params.get('screen')});
  else if(credential) { busy=false; socket.emit('resume',credential, response=>{if(!response.ok){credential=null;sessionStorage.removeItem('last-light-session');state=null;welcome();toast(response.error);}}); }
  else welcome();
});
socket.on('joined',data=>{credential=data;save('last-light-session',JSON.stringify(data));});
socket.on('state',s=>{const moved=state && (state.round!==s.round || state.stage!==s.stage);state=s;if(moved)publicTab='Story';render();if(moved && tab==='Now')window.scrollTo({top:0,behavior:'instant'});});
socket.on('disconnect',reason=>{connected=false;busy=false;const el=document.querySelector('#connection');if(el)el.textContent='○ Reconnecting'; if(reason==='io server disconnect')toast('This identity was opened in another tab. Use a different player name here or reopen to rejoin.');});
fetch('/info').then(r=>r.json()).then(info=>{lan=info.urls[0] || location.origin;if(state?.round===0)render();}).catch(()=>{});
welcome();
