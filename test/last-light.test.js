'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const g = require('../server/last-light');
function setup(n=4) { const {room:r}=g.createRoom('Ada'); for(let i=1;i<n;i++)g.joinRoom(r.code,`Guest ${i}`);return r; }
function act(r,p,type,data={}) { g.action(r,p,type,{round:r.round,stage:r.stage,...data}); }
function host(r) { act(r,r.hostId,'next'); }
function start(r) { act(r,r.hostId,'start'); assert.equal(r.stage,'briefing'); host(r); }
function speaking(r) { while(r.stage==='speaking')host(r); }
function round2(r,room='Study',weapon='Brass candlestick') {
  start(r);speaking(r);host(r);host(r);host(r);
  assert.equal(r.round,2);
  for(const p of r.players)act(r,p.id,'search',{search:'Foyer',room,weapon});
  host(r);assert.equal(r.round,3);
}
function reach(r, round, stage) { for(let i=0;i<80;i++){if(r.round===round&&r.stage===stage)return;host(r);}throw new Error('Target stage not reached'); }
function final(r) { reach(r,6,'accuse'); }
test('all nine room/weapon solutions are consistent; default route finishes; public view has no secrets',()=>{
  for(const room of g.ROOMS)for(const weapon of g.WEAPONS){const r=setup();round2(r,room,weapon);
    const publicView=g.view(r);assert.equal(publicView.me,undefined);assert.equal(publicView.solution,undefined);assert.equal(publicView.codes,undefined);assert.equal(publicView.result,undefined);
    assert.equal(r.board.find(c=>c.id==='K1').text.includes(room),true);
    assert.equal(new Set(r.players.flatMap(p=>p.clues).filter(k=>/^K[2356]$/.test(k))).size,4);
    assert.equal(r.players.filter(p=>p.clues.includes('K5')).length,1);
    assert.notEqual(r.players.find(p=>p.clues.includes('K5')).id,r.players.find(p=>p.clues.includes('K6')).id);
    final(r);for(const p of r.players)act(r,p.id,'accuse',r.solution);host(r);
    assert.equal(r.result.guestsWin,true);assert.equal(r.result.correct,3);assert.equal(r.result.needed,2);assert.equal(r.result.room,room);assert.equal(r.result.weapon,weapon);assert.equal(Object.keys(r.dice).length,3);assert.ok(r.recap.length<=7);
  }
});
test('4–6 players, one murderer, private objectives, host cannot see others’ secrets',()=>{
  for(const n of [4,5,6]){const r=setup(n);start(r);assert.equal(r.players.filter(p=>g.view(r,p.id).me.objective==='murderer').length,1);assert.equal(new Set(Object.values(r.codes)).size,n);for(const p of r.players){const v=g.view(r,p.id);assert.equal(v.players.some(x=>'token'in x||'clues'in x),false);assert.equal(v.solution,undefined);assert.equal(v.codes,undefined);}}
});
test('votes stay private until closed; ties and abstentions choose B; duplicate next is rejected',()=>{
  const r=setup();start(r);speaking(r);act(r,r.players[0].id,'vote',{value:'A'});act(r,r.players[1].id,'vote',{value:'B'});
  assert.equal(g.view(r,r.players[2].id).me.submission,null);assert.equal(g.view(r).tally,null);
  const stamp={round:r.round,stage:r.stage};host(r);assert.equal(r.decisions[1],'B');assert.equal(r.tally.N,2);
  assert.throws(()=>g.action(r,r.hostId,'next',stamp),g.GameError);
});
test('unauthorized actions and malformed payloads cannot change the game',()=>{
  const r=setup();assert.throws(()=>act(r,r.players[1].id,'start'),g.GameError);assert.throws(()=>g.resume(r.code,'wrong'),g.GameError);assert.throws(()=>g.action(r,null,'next',{}),g.GameError);assert.throws(()=>g.action(r,r.hostId,'start',null),g.GameError);
  start(r);assert.throws(()=>g.joinRoom(r.code,'Late guest'),g.GameError);assert.throws(()=>act(r,r.players[1].id,'pass'),g.GameError);
});
test('speaking expires after 20 seconds and rotates its starting speaker',()=>{
  const r=setup();start(r);assert.equal(r.speakers[0],r.players[0].id);r.speakerUntil=Date.now()-1;assert.equal(g.tick(r),true);assert.equal(r.speakerIndex,1);
});
test('clue copies remain available; public sharing is irreversible and idempotent; register unlocks in round 5',()=>{
  const r=setup();round2(r);reach(r,4,'action');assert.equal(r.round,4);
  assert.throws(()=>act(r,r.players[0].id,'verify',{value:'K4'}),g.GameError);
  for(const p of r.players)act(r,p.id,'verify',{value:'K3'});
  assert.equal(r.players.every(p=>p.clues.includes('K3')),true);
  act(r,r.players[0].id,'verify',{value:'K6',extra:true});assert.equal(r.extraVerified,true);
  act(r,r.players[0].id,'share',{value:'K3'});act(r,r.players[0].id,'share',{value:'K3'});assert.equal(r.board.filter(c=>c.id==='K3').length,1);
  reach(r,5,'verify');for(const p of r.players)act(r,p.id,'verify',{value:'K4'});assert.equal(r.players.every(p=>p.clues.includes('K4')),true);
});
test('open-envelope and open-archive branches expose correspondence and verified records',()=>{
  const r=setup();start(r);speaking(r);for(const p of r.players)act(r,p.id,'vote',{value:'A'});host(r);assert.ok(r.board.some(c=>c.id==='letter'));reach(r,4,'action');assert.ok(r.board.some(c=>c.id==='K3'));reach(r,5,'vote');for(const p of r.players)act(r,p.id,'vote',{value:'A'});host(r);assert.ok(r.board.some(c=>c.id==='K4'));assert.ok(r.board.some(c=>c.id==='archive'));
});
test('strict majority excludes murderer ballot, missing ballots lose, solution freezes after blackout',()=>{
  for(const n of [4,5,6]){const r=setup(n);round2(r);const frozen={...r.solution};assert.throws(()=>act(r,r.solution.murderer,'search',{search:'Study',room:'Library',weapon:'Curtain cord'}),g.GameError);assert.deepEqual(r.solution,frozen);final(r);act(r,r.solution.murderer,'accuse',r.solution);host(r);assert.equal(r.result.correct,0);assert.equal(r.result.guestsWin,false);assert.equal(r.result.needed,Math.floor((n-1)/2)+1);}
});
test('dice are server generated, rotate by seat, and cannot be rerolled',()=>{
 const r=setup();start(r);speaking(r);host(r);assert.throws(()=>act(r,r.players[1].id,'roll'),g.GameError);act(r,r.players[0].id,'roll');const value=r.dice[1].value;assert.ok(value>=1&&value<=6);assert.throws(()=>act(r,r.players[0].id,'roll'),g.GameError);assert.equal(r.dice[1].value,value);
});

test('every guest has a distinct fictional relationship and motive; secrets stay private until discovered',()=>{
  for(const n of [4,5,6]) {
    const r=setup(n);start(r);
    assert.equal(new Set(r.players.map(p=>p.role.title)).size,n);
    for(const p of r.players) {
      const me=g.view(r,p.id).me;assert.ok(me.role.relationship);assert.ok(me.role.secret);assert.ok(me.role.motive);
      assert.equal(me.role.confession,undefined);
      assert.equal(JSON.stringify(g.view(r)).includes(p.role.secret),false);
      assert.equal(JSON.stringify(g.view(r)).includes(p.role.motive),false);
    }
    reach(r,3,'speaking');
    for(const p of r.players) {const clues=g.view(r,p.id).me.clues;assert.equal(clues.filter(c=>c.id.startsWith('M-')).length,1);assert.equal(clues.some(c=>c.id===`M-${p.id}`),false);}
    reach(r,5,'speaking');assert.equal(r.board.filter(c=>c.id.startsWith('M-')).length,n);
    final(r);host(r);assert.equal(r.result.confession,r.players.find(p=>p.id===r.solution.murderer).role.confession);
  }
});
test('all speaking turns are attached to live votes; search vote changes guaranteed evidence',()=>{
  for(const choice of ['A','B']) {
    const r=setup();start(r);
    for(const round of [1,3,5]) {
      reach(r,round,'speaking');assert.ok(g.view(r).decision.question);assert.ok(g.view(r).decision.prompt);
      for(const p of r.players)act(r,p.id,'vote',{value:choice});
      assert.equal(g.view(r).completed,4);assert.equal(g.view(r).tally,null);
      speaking(r);assert.equal(r.stage,'vote');assert.equal(Object.keys(r.submissions).length,4);host(r);
      assert.equal(r.decisions[round],choice);
      if(round===3)assert.ok(r.board.some(c=>c.id===(choice==='A'?'K2':'K6')));
    }
  }
});
test('each dice face has an explicit reward, six grants two extras, low rolls preserve evidence',()=>{
  for(const round of [1,3,5])for(let face=1;face<=6;face++) {
    const r=setup();start(r);reach(r,round,'dice');
    const roller=r.players[(round-1)/2], before=new Set(roller.clues), boardBefore=r.board.map(c=>c.id);
    assert.equal(g.view(r).diceRules.bands.length,3);
    g.roll(r,()=>face);
    const result=r.dice[round];assert.equal(result.extraCount,face===6?2:face>=3?1:0);
    assert.equal(result.rewards.length,result.extraCount);assert.equal(r.stage,'discussion');
    for(const id of boardBefore)assert.ok(r.board.some(c=>c.id===id));
    if(round!==5)assert.equal(roller.clues.filter(id=>!before.has(id)).length,result.extraCount);
    else for(const reward of result.rewards)assert.ok(r.board.some(c=>c.title===reward.title));
    const saved=JSON.stringify(result);g.roll(r,()=>6);assert.equal(JSON.stringify(r.dice[round]),saved);
  }
});

test('identity briefing has no running speaking clock and readiness never becomes a vote',()=>{
  const r=setup();act(r,r.hostId,'start');assert.equal(r.stage,'briefing');assert.equal(r.speakerUntil,null);
  for(const p of r.players)act(r,p.id,'ready');assert.equal(g.view(r).completed,4);
  assert.throws(()=>act(r,r.hostId,'vote',{value:'A'}),g.GameError);
  host(r);assert.equal(r.stage,'speaking');assert.equal(g.view(r).completed,0);assert.ok(r.speakerUntil>Date.now());
});
