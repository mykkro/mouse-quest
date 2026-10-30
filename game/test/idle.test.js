import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdleDirector, IDLE_DELAY } from '../idle.js';

function rig() {
  const clips=[],events=[];
  const idle=createIdleDirector({play:clip=>clips.push(clip),duration:()=>1,
    onEnter:()=>events.push('enter'),onExit:()=>events.push('exit'),random:()=>0});
  return {idle,clips,events};
}

test('idle waits for uninterrupted inactivity and starts by sniffing',()=>{
  const {idle,clips,events}=rig();
  idle.update(IDLE_DELAY-1,true);assert.equal(idle.active,false);
  idle.wake();idle.update(1,true);assert.equal(idle.active,false);
  idle.update(IDLE_DELAY-1,true);
  assert.equal(idle.active,true);assert.deepEqual(events,['enter']);assert.deepEqual(clips,['Sniff']);
});

test('idle delay measures real time even when rendering caps the simulation step',()=>{
  const {idle}=rig();
  for(let i=0;i<16;i++) idle.update(.05,true,1);
  assert.equal(idle.active,true);
});

test('idle pauses between sniffing and an ordered dance, then returns to idle',()=>{
  const {idle,clips}=rig();idle.update(IDLE_DELAY,true);
  idle.update(1,true);assert.equal(clips.at(-1),'Idle');
  idle.update(4,true);assert.equal(clips.at(-1),'Idle');
  idle.update(1,true);assert.equal(clips.at(-1),'Turn_L');
  for(let i=0;i<9;i++) idle.update(1,true);
  assert.deepEqual(clips,['Sniff','Idle','Turn_L','Turn_R','Rear_Start','Rear_Loop','Rear_End','Turn_R','Turn_L','Idle']);
});

test('input interrupts a dance immediately and cancels its queued clips',()=>{
  const {idle,clips,events}=rig();idle.update(IDLE_DELAY,true);
  idle.update(1,true);idle.update(5,true);assert.equal(clips.at(-1),'Turn_L');
  idle.wake();assert.equal(idle.active,false);assert.equal(clips.at(-1),'Idle');
  idle.update(2,true);assert.equal(clips.at(-1),'Idle');assert.deepEqual(events,['enter','exit']);
  idle.wake();assert.deepEqual(events,['enter','exit'],'waking twice has no extra side effects');
});

test('motion, held input, falling and hidden pages cancel or prevent idle mode',()=>{
  const {idle,events}=rig();
  idle.update(IDLE_DELAY-1,true);idle.update(1,false);idle.update(1,true);
  assert.equal(idle.active,false);
  idle.update(IDLE_DELAY,true);idle.update(.01,false);
  assert.equal(idle.active,false);assert.deepEqual(events,['enter','exit']);
  idle.update(100,false);assert.equal(idle.active,false);
});
