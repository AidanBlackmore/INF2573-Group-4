'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const g = require('../server/last-light');
function setup(n=4) { const {room:r}=g.createRoom('Ada'); for(let i=1;i<n;i++)g.joinRoom(r.code,`Guest ${i}`);return r; }
function act(r,p,type,data={}) { g.action(r,p,type,{round:r.round,stage:r.stage,...data}); }
function host(r) { act(r,r.hostId,'next'); }
function speaking(r) { while(r.stage==='speaking')host(r); }
function round2(r,room='Study',weapon='Brass candlestick') {
  act(r,r.hostId,'start');speaking(r);host(r);host(r);host(r);
  assert.equal(r.round,2);
  for(const p of r.players)act(r,p.id,'search',{search:'Foyer',room,weapon});
  host(r);assert.equal(r.round,3);
}
function final(r) { host(r);speaking(r);host(r);host(r);host(r);speaking(r);host(r);host(r);host(r);host(r);host(r);assert.equal(r.stage,'accuse'); }
test('all nine room/weapon solutions are consistent; default route finishes; public view has no secrets',()=>{
  for(const room of g.ROOMS)for(const weapon of g.WEAPONS){const r=setup();round2(r,room,weapon);
    const publicView=g.view(r);assert.equal(publicView.me,undefined);assert.equal(publicView.solution,undefined);assert.equal(publicView.codes,undefined);assert.equal(publicView.result,undefined);
    assert.equal(r.board.find(c=>c.id==='K1').text.includes(room),true);
    assert.equal(new Set(r.players.flatMap(p=>p.clues)).size,4);
    assert.equal(r.players.filter(p=>p.clues.includes('K5')).length,1);
    assert.notEqual(r.players.find(p=>p.clues.includes('K5')).id,r.players.find(p=>p.clues.includes('K6')).id);
    final(r);for(const p of r.players)act(r,p.id,'accuse',r.solution);host(r);
    assert.equal(r.result.guestsWin,true);assert.equal(r.result.correct,3);assert.equal(r.result.needed,2);assert.equal(r.result.room,room);assert.equal(r.result.weapon,weapon);assert.equal(Object.keys(r.dice).length,3);assert.ok(r.recap.length<=7);
  }
});
test('4–6 players, one murderer, private objectives, host cannot see others’ secrets',()=>{
  for(const n of [4,5,6]){const r=setup(n);act(r,r.hostId,'start');assert.equal(r.players.filter(p=>g.view(r,p.id).me.objective==='murderer').length,1);assert.equal(new Set(Object.values(r.codes)).size,n);for(const p of r.players){const v=g.view(r,p.id);assert.equal(v.players.some(x=>'token'in x||'clues'in x),false);assert.equal(v.solution,undefined);assert.equal(v.codes,undefined);}}
});
test('votes stay private until closed; ties and abstentions choose B; duplicate next is rejected',()=>{
  const r=setup();act(r,r.hostId,'start');speaking(r);act(r,r.players[0].id,'vote',{value:'A'});act(r,r.players[1].id,'vote',{value:'B'});
  assert.equal(g.view(r,r.players[2].id).me.submission,null);assert.equal(g.view(r).tally,null);
  const stamp={round:r.round,stage:r.stage};host(r);assert.equal(r.decisions[1],'B');assert.equal(r.tally.N,2);
  assert.throws(()=>g.action(r,r.hostId,'next',stamp),g.GameError);
});
test('unauthorized actions and malformed payloads cannot change the game',()=>{
  const r=setup();assert.throws(()=>act(r,r.players[1].id,'start'),g.GameError);assert.throws(()=>g.resume(r.code,'wrong'),g.GameError);assert.throws(()=>g.action(r,null,'next',{}),g.GameError);assert.throws(()=>g.action(r,r.hostId,'start',null),g.GameError);
  act(r,r.hostId,'start');assert.throws(()=>g.joinRoom(r.code,'Late guest'),g.GameError);assert.throws(()=>act(r,r.players[1].id,'pass'),g.GameError);
});
test('speaking expires after 20 seconds and rotates its starting speaker',()=>{
  const r=setup();act(r,r.hostId,'start');assert.equal(r.speakers[0],r.players[0].id);r.speakerUntil=Date.now()-1;assert.equal(g.tick(r),true);assert.equal(r.speakerIndex,1);
});
test('clue copies remain available; public sharing is irreversible and idempotent; register unlocks in round 5',()=>{
  const r=setup();round2(r);host(r);speaking(r);host(r);assert.equal(r.round,4);
  assert.throws(()=>act(r,r.players[0].id,'verify',{value:'K4'}),g.GameError);
  for(const p of r.players)act(r,p.id,'verify',{value:'K3'});
  assert.equal(r.players.every(p=>p.clues.includes('K3')),true);
  act(r,r.players[0].id,'verify',{value:'K6',extra:true});assert.equal(r.extraVerified,true);
  act(r,r.players[0].id,'share',{value:'K3'});act(r,r.players[0].id,'share',{value:'K3'});assert.equal(r.board.filter(c=>c.id==='K3').length,1);
  host(r);host(r);speaking(r);host(r);for(const p of r.players)act(r,p.id,'verify',{value:'K4'});assert.equal(r.players.every(p=>p.clues.includes('K4')),true);
});
test('open-envelope and open-archive branches expose correspondence and verified records',()=>{
  const r=setup();act(r,r.hostId,'start');speaking(r);for(const p of r.players)act(r,p.id,'vote',{value:'A'});host(r);assert.ok(r.board.some(c=>c.id==='letter'));host(r);host(r);host(r);host(r);speaking(r);host(r);assert.equal(r.round,4);assert.ok(r.board.some(c=>c.id==='K3'));host(r);host(r);speaking(r);for(const p of r.players)act(r,p.id,'vote',{value:'A'});host(r);assert.ok(r.board.some(c=>c.id==='K4'));assert.ok(r.board.some(c=>c.id==='archive'));
});
test('strict majority excludes murderer ballot, missing ballots lose, solution freezes after blackout',()=>{
  for(const n of [4,5,6]){const r=setup(n);round2(r);const frozen={...r.solution};assert.throws(()=>act(r,r.solution.murderer,'search',{search:'Study',room:'Library',weapon:'Curtain cord'}),g.GameError);assert.deepEqual(r.solution,frozen);final(r);act(r,r.solution.murderer,'accuse',r.solution);host(r);assert.equal(r.result.correct,0);assert.equal(r.result.guestsWin,false);assert.equal(r.result.needed,Math.floor((n-1)/2)+1);}
});
test('dice are server generated, rotate by seat, and cannot be rerolled',()=>{
 const r=setup();act(r,r.hostId,'start');speaking(r);host(r);assert.throws(()=>act(r,r.players[1].id,'roll'),g.GameError);act(r,r.players[0].id,'roll');const value=r.dice[1].value;assert.ok(value>=1&&value<=6);assert.throws(()=>act(r,r.players[0].id,'roll'),g.GameError);assert.equal(r.dice[1].value,value);
});
