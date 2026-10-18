'use strict';
// Runs against a running server. Uses only information actually sent to each phone.
const { io } = require('socket.io-client');
const assert = require('node:assert/strict');
const url = process.env.TEST_URL || 'http://localhost:3000';
const demo = process.argv[2] === 'demo';
const count = demo ? 1 : Number(process.argv[2] || 4);
if (!demo && ![4,5,6].includes(count)) throw new Error('Choose 4, 5, or 6 players.');
const clients = [];
async function connect() {
  const socket = io(url, { transports: ['websocket'], reconnection: false });
  const c = {socket}; clients.push(c);
  socket.on('state', s => c.state = s); socket.on('joined', d => c.credential = d);
  await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);});return c;
}
function emit(c,event,data={}) { return new Promise((resolve,reject)=>c.socket.timeout(5000).emit(event,data,(err,res)=>err||!res.ok?reject(err||new Error(res.error)):resolve(res))); }
function action(c,type,data={}) { return emit(c,'action',{type,round:c.state.round,stage:c.state.stage,...data}); }
async function waitFor(fn) { const end=Date.now()+5000;while(!fn()){if(Date.now()>end)throw new Error('State did not arrive');await new Promise(r=>setTimeout(r,10));} }
(async()=>{
  const host=await connect();await emit(host,'create',{name:'Ada'});await waitFor(()=>host.state);
  const code=host.state.code;
  for(let i=1;i<count;i++){const c=await connect();await emit(c,'join',{code,name:`Guest ${i}`});}
  const watcher=await connect();await emit(watcher,'watch',{code});
  const phones=clients.slice(0,count);
  await action(host,demo ? 'demoStart' : 'start');
  let steps=0;
  while(host.state.stage!=='ending') {
    if(++steps>100)throw new Error('Game did not finish');
    const s=host.state;
    if(s.stage==='vote')for(const c of phones)await action(c,'vote',{value:'B'});
    if(s.round===2&&s.stage==='action')for(const c of phones)await action(c,'search',{search:'Study',...(c.state.me.objective==='murderer'?{room:'Library',weapon:'Curtain cord'}:{})});
    if((s.round===4&&s.stage==='action')||s.stage==='verify')for(const c of phones)await action(c,'verify',{value:s.round===5?'K4':'K3'});
    if(s.stage==='accuse') {
      const murderer=phones.find(c=>c.state.me.objective==='murderer')?.state.me.id || '';
      for(const c of phones)await action(c,'accuse',{murderer,room:'Library',weapon:'Curtain cord'});
      assert.equal(watcher.state.result,undefined);
    }
    if(s.round>=3&&s.stage!=='ending')for(const c of phones)if(c.state.me.clues[0])await action(c,'share',{value:c.state.me.clues[0].id});
    assert.equal(watcher.state.me,undefined);assert.equal(watcher.state.solution,undefined);assert.equal(watcher.state.codes,undefined);
    await action(host,'next');
  }
  if (!demo) { assert.equal(host.state.result.guestsWin,true); assert.equal(host.state.result.correct,count-1); }
  else { assert.equal(host.state.players.filter(p=>p.bot).length,3); assert.equal(host.state.result.ballots.length,4); }
  const recovering=phones[demo ? 0 : 1];
  const saved=recovering.credential, pid=recovering.state.me.id;
  recovering.socket.disconnect();const restored=await connect();await emit(restored,'resume',saved);await waitFor(()=>restored.state);
  assert.equal(restored.state.me.id,pid);assert.equal(restored.state.stage,'ending');assert.ok(restored.state.me.clues.length);
  const invalid=await connect();await assert.rejects(emit(invalid,'resume',{code,token:'invalid'}));
  await assert.rejects(emit(watcher,'action',{type:'next',round:6,stage:'ending'}));
  console.log(`PASS: ${count} private phones + shared screen; six rounds, three dice, evidence sharing, final ballots, reconnect, and authorization.`);
})().catch(err=>{console.error(err);process.exitCode=1;}).finally(()=>clients.forEach(c=>c.socket.disconnect()));
