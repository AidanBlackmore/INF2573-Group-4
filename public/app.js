'use strict';
const socket = io();
const app = document.querySelector('#app');
const params = new URLSearchParams(location.search);
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
function header() { return `<header><a class="brand" href="/">ALTERNATE UNIVERSE <span>LAST LIGHT</span></a><span class="pill" id="connection">${connected ? '● Connected' : '○ Reconnecting'}</span></header>`; }
function welcome() {
  app.className = '';
  app.innerHTML = `${header()}<section class="welcome"><div class="tag">A mystery for the people you know</div><h1>Last Light</h1><p class="lead">One house. Six rounds.<br>A truth you uncover together.</p><p class="muted">4–6 friends · 35–45 minutes · No acting required</p></section>
  <section class="card"><h2>Take a seat at Rain House</h2><form id="entry"><label>Your name<input name="name" maxlength="24" autocomplete="given-name" placeholder="What should we call you?" required></label><label>Room code <span class="muted">— to join a friend</span><input name="code" class="code" maxlength="4" value="${esc(params.get('room') || '')}" placeholder="ABCD" autocomplete="off"></label><div class="row"><button name="mode" value="create" class="primary">Create a room</button><button name="mode" value="join">Join room</button></div></form></section>
  <details class="card"><summary>Rejoin with a recovery credential</summary><form id="recovery"><label>Room code<input name="code" maxlength="4" required></label><label>Private recovery credential<input name="token" required autocomplete="off"></label><button>Rejoin</button></form></details>
  <p class="footer">Play as yourself. No elimination. No personal disclosures.<br>One shared screen and one phone per player.</p>`;
}
function names() { return state.players.map(p => `<span class="pill ${p.connected ? '' : 'off'}">${esc(p.name)}${p.id === state.hostId ? ' · Host' : ''}${!p.connected ? ' · Away' : ''}</span>`).join(''); }
const playerName = id => state.players.find(p => p.id === id)?.name || 'Not enough evidence';
function board() {
  return `<section class="evidence"><div class="section-heading"><h2>Shared evidence</h2><span class="muted">${state.board.length} records</span></div><p class="muted small">Official evidence is accurate. Published cards stay here.</p><div class="board-grid">${['People','Rooms','Objects','Timeline'].map(category => `<section><h3>${category}</h3>${state.board.filter(c => c.category === category).map(c => cardHTML(c)).join('') || '<p class="empty">No evidence shared yet.</p>'}</section>`).join('')}</div>${state.statements.length ? `<h3>Unverified statements</h3>${state.statements.map(c => `<article class="card claim"><div class="tag">Unverified statement · ${esc(c.name)}</div><p>${esc(c.text)}</p></article>`).join('')}` : ''}</section>`;
}
function cardHTML(c, share = false) { return `<article class="card clue"><div class="tag">${esc(c.id)} · ${esc(c.category)}</div><h3>${esc(c.title)}</h3><p class="preline">${esc(c.text)}</p>${c.sharedBy ? `<p class="muted small">Shared by ${esc(c.sharedBy)}</p>` : ''}${share ? btn(state.board.some(x => x.id === c.id) ? 'On the shared board ✓' : 'Share on screen', 'share', c.id, state.stage === 'ending' || state.board.some(x => x.id === c.id)) : ''}</article>`; }
function options(values, selected, empty = false) { return `${empty ? '<option value="">Not enough evidence</option>' : ''}${values.map(v => { const [value, label] = Array.isArray(v) ? v : [v,v]; return `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(label)}</option>`; }).join('')}`; }
function select(name, label, values, selected, empty = false) { return `<label>${label}<select name="${name}">${options(values, selected, empty)}</select></label>`; }
function lobby() {
  const base = location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? lan : location.origin;
  return `<section class="card"><div class="tag">Your room code</div><div class="big-code">${esc(state.code)}</div><p class="center">${state.players.length} of 6 guests have arrived</p><div class="center">${names()}</div><p class="muted">Open this address on phones connected to the same Wi-Fi:</p><a class="join-url" href="${esc(base)}/?room=${state.code}">${esc(base)}/?room=${state.code}</a><p><a target="_blank" rel="noopener" href="/?screen=${state.code}">Open the shared screen ↗</a></p><p class="small muted">The shared screen has no private actions or objectives. Keep your phone view off the projector.</p></section><section class="card"><h2>Be yourself. Keep your objective private.</h2><p>Speak normally. Official evidence is accurate; another player’s account may not be. Share clues when you choose. Your notebook stays on your device and never enters the recap.</p><p>You can always pass when invited to speak. Nobody is eliminated. Low dice rolls still advance the story.</p><p>Guests win when a strict majority of innocent guests identifies all three: murderer, weapon, and room. Otherwise the murderer wins. “Not enough evidence” is always available.</p></section>${state.me?.id === state.hostId ? btn('Begin the evening', 'start', '', state.players.length < 4, 'primary') : '<p class="center muted">Waiting for the host to begin with 4–6 players.</p>'}`;
}
function objective() {
  return `<section class="card secret"><div class="tag">Only on your phone</div><h2>Your objective</h2>${state.me.objective === 'murderer' ? '<p>You are responsible for Alex’s death in this game.</p><p>Keep the group from identifying the complete solution. You may mislead in conversation or keep information private. You cannot edit official evidence.</p><p>In Round 2, secretly choose the room and weapon. You do not need to act out anything.</p><h3>Your game-only motive</h3><p>Alex discovered that you diverted money from the house’s community fund. Tonight’s announcement would expose it. This is fictional information, not a claim about you.</p>' : '<p>You did not cause Alex’s death.</p><p>Find out who did, where it happened, and what was used. Share what you find, question what you hear, and decide for yourself.</p>'}<p class="muted">You are playing as yourself. You do not need to act.</p>${state.me.selection?.room && state.round >= 3 ? `<p>Your locked choices: ${esc(state.me.selection.room)} · ${esc(state.me.selection.weapon)}</p>` : ''}</section>`;
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
  if (state.stage === 'speaking') return state.speaker.id === me.id ? btn('Done / Pass', 'pass', '', false, 'primary') : '<p class="muted">Listen to the current speaker. Your turn is coming.</p>';
  if (state.stage === 'vote') return `<section class="card"><h2>Your private decision</h2><p>${state.round === 1 ? 'The receipt may explain Alex’s announcement. The surrounding letter belongs to someone who is not here.' : 'Choose how much of the archive to open. Both routes preserve access to case evidence.'}</p><p class="muted small">A wins only with more votes than B. Ties and all “No preference” choose B. Individual votes are never displayed.</p><div class="stack">${[['A',state.round === 1 ? 'A · Read the whole envelope' : 'A · Open the entire archive'],['B',state.round === 1 ? 'B · Extract only the receipt' : 'B · Targeted access to records'],['N','No preference']].map(([k,label]) => btn(label + (me.submission === k ? ' ✓' : ''), 'vote', k, false, me.submission === k ? 'selected' : '')).join('')}</div><p class="small muted">You may change your vote until the host closes voting.</p></section>`;
  if (state.round === 2 && state.stage === 'action') return `<form id="search" class="card"><h2>Where will you look first?</h2>${select('search','Your search after the lights return',[...state.house,'Observe'],me.submission?.search)}${me.objective === 'murderer' ? `<div class="secret-fields"><h3>Your secret choices</h3>${select('room','Where the crime happens',state.rooms,me.selection?.room)}${select('weapon','What was used',state.weapons,me.selection?.weapon)}</div>` : ''}<button class="primary">${me.submission ? 'Update saved choices' : 'Save choices privately'}</button><p class="muted small">Choices lock when the round closes.</p></form>`;
  if ((state.round === 4 && state.stage === 'action') || state.stage === 'verify') return verification();
  if (state.stage === 'dice') return state.rollerId === me.id ? btn('Roll the shared die', 'roll', '', false, 'primary') : `<p class="muted">${esc(playerName(state.rollerId))} rolls this time.</p>`;
  if (state.stage === 'accuse') return `<form id="accusation" class="card"><h2>Your independent accusation</h2><p>Choose for yourself. No partial results are revealed.</p>${select('murderer','Who caused Alex’s death?',state.players.map(p => [p.id,p.name]),me.submission?.murderer,true)}${select('weapon','What was used?',state.weapons,me.submission?.weapon,true)}${select('room','Where did it happen?',state.rooms,me.submission?.room,true)}<button class="primary">${me.submission ? 'Update my ballot' : 'Submit my ballot'}</button><p class="muted small">Revise until voting closes. Missing answers default to Not enough evidence.</p></form>`;
  return '<p class="muted">Time to talk. Share clues, connect evidence, or ask a question. Answering is optional.</p>';
}
function statement() { return `<details class="card"><summary>Add an unverified statement · optional</summary><form id="statement"><label>Choose a statement<select name="statement">${state.house.map(x=>`<option value="sound|${esc(x)}">I think the sound came from the ${esc(x)}.</option>`).join('')}${state.weapons.map(x=>`<option value="object|${esc(x)}">Someone may have handled the ${esc(x)} before dinner.</option>`).join('')}${state.players.map(p=>`<option value="doubt|${p.id}">I’m not convinced this proves ${esc(p.name)} did it.</option>`).join('')}</select></label><button>Publish as an unverified statement</button><p class="small muted">One statement per player. Spoken discussion is unrestricted.</p></form></details>`; }
function hostControls() {
  if (state.me?.id !== state.hostId || state.stage === 'ending') return '';
  const labels = {speaking:'Advance speaking turn',vote:'Close voting and reveal the result',dice:'Roll for the absent player',action:'Resolve actions and continue',verify:'Finish verification',discussion:state.round === 6 ? 'Open private accusations' : 'Begin the next round',accuse:'Close ballots and reveal the truth'};
  return `<details class="card host"><summary>Host controls · ${state.completed}/${state.players.length} actions saved</summary><p class="small">Continue when the group is ready. Missing votes become No preference; searches become Observe; verifications receive a missing record; accusations become Not enough evidence. Missing murderer choices are random.</p>${btn(labels[state.stage] || 'Continue', 'next', '', false, 'primary')}</details>`;
}
function ending() {
  const r = state.result;
  return `<section class="card highlight"><div class="tag">The truth at Rain House</div><h2>${esc(r.murdererName)} · ${esc(r.room)} · ${esc(r.weapon)}</h2><p>Alex’s planned audit would expose a diverted fund payment. ${esc(r.murdererName)} arranged the blackout and drew Alex into the room.</p><p><strong>K1</strong> identifies the room. <strong>K2 + K3 + K4</strong> connect the incident time to one guest code and its owner. <strong>K5 + K6</strong> match the recovered trace to the weapon.</p><p>There was no accomplice, hidden entrance, transferred card, remote mechanism, or moved body. Earlier handling of an object was not proof of guilt.</p><h3>${r.guestsWin ? 'The guests connected the evidence.' : 'The murderer kept the pieces apart.'}</h3><p>${r.correct} correct guest ballots; ${r.needed} required. The murderer’s ballot does not count.</p></section><details class="card"><summary>Reveal all final ballots</summary>${r.ballots.map(b=>`<p><strong>${esc(b.name)}</strong><br>${esc(playerName(b.murderer))} · ${esc(b.weapon || 'Not enough evidence')} · ${esc(b.room || 'Not enough evidence')}</p>`).join('')}</details><section class="card"><div class="tag">Your evening, remembered</div><h2>The night you made</h2><div id="recap-window" class="recap-window" aria-live="polite"></div><div class="row">${btn(recapPaused ? 'Resume' : 'Pause','recapPause')}${btn('Skip','recapSkip')}${btn('Read again','recapAgain')}</div><details><summary>Read the complete recap</summary>${state.recap.map(x=>`<p>${esc(x)}</p>`).join('')}</details></section><p class="muted">Did anyone’s explanation make you see a choice differently? Talk about it if you want—or start another game.</p>${btn('Return to the entrance', 'leave')}`;
}
function render() {
  if (!state) return welcome();
  const publicScreen = !state.me;
  app.className = publicScreen ? 'shared-screen' : 'phone';
  let body;
  if (!state.round) body = lobby();
  else if (tab === 'Notebook' && state.me) body = `<section class="card"><h2>Your private notebook</h2><p class="muted">Optional. Saved only in this browser. Never sent to the server or included in the recap.</p><label>Suspicions, connections, questions<textarea id="notes" rows="14" placeholder="What connects? What is still missing?"></textarea></label><span id="note-status" class="small muted">Saved on this device</span></section>`;
  else if (tab === 'My objective' && state.me) body = objective();
  else if (tab === 'My clues' && state.me) body = `<h2>Evidence you helped examine</h2><p class="muted">These official reports do not imply you searched the scene.</p>${state.me.searchResult ? `<div class="card"><div class="tag">Your search result</div><p>${esc(state.me.searchResult)}</p></div>` : ''}${state.me.clues.map(c=>cardHTML(c,true)).join('') || '<p class="empty">Your evidence will arrive in Round 3.</p>'}`;
  else body = state.stage === 'ending' ? ending() + board() : `<section class="card scene-card"><div class="tag">Round ${state.round} of 6 · ${esc(state.stage)}</div><h1>${esc(state.title)}</h1><p class="scene">${esc(state.scene)}</p></section>${state.speaker ? `<section class="card highlight"><div class="tag">Turn ${state.speaker.position} of ${state.players.length}</div><h2>${esc(playerName(state.speaker.id))}, your turn.</h2><p>${state.round === 3 ? 'What does your clue establish—and what does it not?' : 'Share an observation, explain a choice, or ask a question.'}</p><strong class="timer" data-until="${state.speaker.until}"></strong><p class="muted">Passing is fine.</p></section>` : ''}${state.stage === 'discussion' || state.stage === 'accuse' ? `<p class="muted">Suggested ${state.stage === 'accuse' ? 'ballot' : 'discussion'} time <strong class="timer" data-until="${state.discussionUntil}"></strong> · The host controls pacing.</p>` : ''}${state.tally ? `<section class="card"><h3>Group choice: ${state.decisions[state.round]}</h3><p>A: ${state.tally.A} · B: ${state.tally.B} · No preference: ${state.tally.N}</p></section>` : ''}${state.dice[state.round] ? `<section class="card"><div class="tag">Shared die · ${esc(state.dice[state.round].roller)}</div><h2>Rolled ${state.dice[state.round].value}</h2><p>${esc(state.dice[state.round].text)}</p></section>` : ''}${controls()}${state.round === 4 && state.me && !state.statements.some(x=>x.playerId===state.me.id) ? statement() : ''}${hostControls()}${board()}`;
  const focus = document.activeElement; const focusName = focus?.name; const formId = focus?.form?.id;
  const draft = formId && document.getElementById(formId) ? Object.fromEntries(new FormData(document.getElementById(formId))) : null;
  app.innerHTML = `${header()}<div class="session-bar"><span>RAIN HOUSE / ${state.code}</span><span>${publicScreen ? 'Shared screen · public information only' : esc(state.me.name) + ' · private phone'}</span></div>${state.round ? `<div class="round-track" aria-label="Round ${state.round} of 6">${['Envelope','Blackout','Discovery','Investigation','Archive','Accusation'].map((x,i)=>`<span class="${i+1===state.round?'current':i+1<state.round?'complete':''}">${i+1}<small>${x}</small></span>`).join('')}</div>` : ''}${state.me && state.round ? `<nav aria-label="Phone tabs">${['Now','My clues','Notebook','My objective'].map(x=>`<button data-tab="${x}" aria-current="${tab === x ? 'page' : 'false'}" class="${tab===x?'selected':''}">${x}${x==='My clues' ? ` (${state.me.clues.length})` : ''}</button>`).join('')}</nav>` : ''}<div class="content">${state.round && ['vote','action','verify','accuse'].includes(state.stage) ? `<p class="muted small" role="status">${state.completed} of ${state.players.length} actions saved privately</p>` : ''}${body}</div><footer class="footer">${names()}${state.me ? `<details><summary>Private recovery credential</summary><p>Keep this secret. It restores access to your phone if this tab is lost.</p><code>${esc(credential?.token)}</code></details>` : ''}<p>No elimination · No acting · No personal disclosures</p></footer>`;
  if (draft && document.getElementById(formId)) { for (const [name,value] of Object.entries(draft)) { const input = document.getElementById(formId).elements.namedItem(name); if(input) input.value=value; } document.getElementById(formId).elements.namedItem(focusName)?.focus(); }
  const notes = document.querySelector('#notes'); if (notes) notes.value = read(noteKey(), localStorage) || '';
  updateTimers(); updateRecap();
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
  if(b.dataset.tab){tab=b.dataset.tab;render();return;}
  const type=b.dataset.action, value=b.dataset.value; if(!type)return;
  if(type==='leave'){sessionStorage.removeItem('last-light-session'); location.href='/';return;}
  if(type==='recapPause'){recapPaused=!recapPaused;b.textContent=recapPaused?'Resume':'Pause';return;}
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
socket.on('state',s=>{const moved=state && (state.round!==s.round || state.stage!==s.stage);state=s;render();if(moved && tab==='Now')window.scrollTo({top:0,behavior:'instant'});});
socket.on('disconnect',reason=>{connected=false;busy=false;const el=document.querySelector('#connection');if(el)el.textContent='○ Reconnecting'; if(reason==='io server disconnect')toast('This identity was opened in another tab. Use a different player name here or reopen to rejoin.');});
fetch('/info').then(r=>r.json()).then(info=>{lan=info.urls[0] || location.origin;if(state?.round===0)render();}).catch(()=>{});
welcome();
