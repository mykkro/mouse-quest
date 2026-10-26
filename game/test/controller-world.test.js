import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, RAT_RADIUS, top } from '../collision.js';
import { level } from '../level.js';
import { makeRig } from '../../models/rat/viewer/test/rig.js';

const near = (actual, expected, tol, msg) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${msg}: ${actual} not within ${tol} of ${expected}`);
const floor = { x: 0, y: -0.1, z: 0, w: 0.2, h: 0.1, d: 1 };        // top 0, z -0.5..0.5
const lower = { x: 0, y: -0.3, z: 1, w: 0.2, h: 0.1, d: 1 };        // top -0.2, z 0.5..1.5
const wall = { x: 0, y: -0.1, z: 0.35, w: 0.4, h: 0.4, d: 0.1 };    // top 0.3, front face z 0.3
const tall = { x: 0, y: -0.1, z: 0.35, w: 0.4, h: 0.6, d: 0.1 };    // top 0.5, front face z 0.3
const step = { x: 0, y: -0.1, z: 0.55, w: 0.2, h: 0.2, d: 0.5 };    // top 0.1, z 0.3..0.8

test('walking off the end of a block falls', () => {
  const { rat, c, until, step: run } = makeRig(makeWorld([floor]));
  c.press('KeyW');
  until(() => c.state === 'air', 5);
  near(rat.position.z, 0.5, 0.01, 'leaves at the edge');
  run(1);
  assert.ok(rat.position.y < -0.3, `still falling: y ${rat.position.y}`);
});

test('walking off onto a lower block lands on it', () => {
  const { rat, c, until } = makeRig(makeWorld([floor, lower]));
  c.press('KeyW');
  until(() => c.state === 'land', 5);
  assert.equal(rat.position.y, top(lower)); // -0.3 + 0.1 in floating point, not the literal -0.2
});

test('a wall stops a walking rat before its nose enters', () => {
  const { rat, c, step: run } = makeRig(makeWorld([floor, wall]));
  c.press('KeyW'); run(2);
  assert.equal(c.state, 'walk');
  near(rat.position.z, 0.3 - RAT_RADIUS - .12, 0.005, 'stops at the wall');
  assert.equal(rat.position.y, 0);
});

test('a moving leap lands on a 10 cm step', () => {
  const { rat, c, step: run, until } = makeRig(makeWorld([floor, step]));
  c.press('KeyW'); run(0.4); c.press('Space');
  until(() => c.state === 'land', 2);
  assert.equal(rat.position.y, 0.1);
  assert.ok(rat.position.z > 0.3);
});

test('a leap into a wall too high to clear drops back in front of it', () => {
  const { rat, c, step: run, until } = makeRig(makeWorld([floor, tall]));
  c.press('KeyW'); run(0.4); c.press('Space');
  until(() => c.state === 'land', 2);
  assert.equal(rat.position.y, 0);
  assert.ok(rat.position.z <= 0.3 - RAT_RADIUS - .12 + 1e-9, `z ${rat.position.z}`);
});

test('at a 0.1 s frame step a leap still lands on the step (no tunnelling)', () => {
  const { rat, c, step: run, until } = makeRig(makeWorld([floor, step]));
  c.press('KeyW'); run(0.4, 0.1); c.press('Space');
  until(() => c.state === 'land', 2, 0.1);
  assert.equal(rat.position.y, 0.1);
});

test('a leap that falls just short of a stair drops back in front of it, not through it', () => {
  const { rat, c, until } = makeRig(makeWorld(level.boxes));
  Object.assign(rat.position, { x: 1.29, y: 0, z: 2.95 }); // zig-zag beam 3, facing the stairs
  rat.rotation.y = Math.PI / 2;
  c.press('KeyW'); c.press('Space');
  let lowest = 0;
  until(() => { lowest = Math.min(lowest, rat.position.y); return c.state === 'land' || rat.position.y < level.killY; }, 3);
  assert.ok(lowest >= level.killY, `sank to y ${lowest}`);
  assert.equal(c.state, 'land');
  assert.equal(rat.position.y, 0, 'back on pad 4');
});

test('reset after falling leaves the rat standing still where it is placed', () => {
  const { rat, c, step: run, until } = makeRig(makeWorld([floor]));
  c.press('KeyW');
  until(() => c.state === 'air', 5);
  run(0.3);
  Object.assign(rat.position, { x: 0, y: 0, z: 0 });
  rat.rotation.y = 0;
  c.reset();
  run(0.5);
  assert.equal(c.state, 'idle');
  assert.deepEqual([rat.position.x, rat.position.y, rat.position.z], [0, 0, 0]);
});

import { levels } from '../level.js';
import { canTurn, groundHeight } from '../collision.js';

test('walk up and down the pantry ramp without jumping or falling', () => {
  const l = levels[3];
  const {rat,c,step:run} = makeRig(makeWorld(l.boxes));
  Object.assign(rat.position,{x:1.1,y:.57,z:1.4});
  c.press('KeyW'); run(5.4);
  near(rat.position.z,2.75,.025,'crossed ramp onto upper shelf');
  near(rat.position.y,.75,.001,'upper shelf height');
  assert.equal(c.state,'walk');
  c.releaseAll(); rat.rotation.y = Math.PI;
  c.press('KeyW'); run(5.4);
  near(rat.position.y,.57,.001,'returned to lower shelf');
  assert.equal(c.state,'walk');
});

test('rooftop ramp joins both platforms without a blocking lip', () => {
  const l=levels[2]; const {rat,c,step:run}=makeRig(makeWorld(l.boxes));
  rat.position.z=.28; c.press('KeyW'); run(1.8);
  assert.ok(rat.position.z>.65, `stuck at ${rat.position.z}`);
  near(rat.position.y,.1,.001,'walked onto roof');
  assert.equal(c.state,'walk');
});

test('glue slows travel and clearing the patch restores normal speed', () => {
  const ground = {...floor,w:2,d:10};
  const patch={x:0,z:0,w:1,d:.3,top:0,effect:'glue'};
  const {rat,c,step:run}=makeRig(makeWorld([ground],[patch]));
  c.press('KeyW');run(1);
  near(rat.position.z,.25*.35,.001,'slowed in glue');
  rat.position.z=.5;run(1);
  near(rat.position.z,.75,.001,'normal speed outside patch');
});

test('slippery ground retains momentum after release and then slows', () => {
  const {rat,c,step:run}=makeRig(makeWorld([{...floor,w:5,d:20,effect:'slip'}]));
  c.press('KeyW');run(1);c.releaseAll();const z=rat.position.z;
  run(.3); assert.ok(rat.position.z-z>.025,'coasts after release');
  const initial=c.speed;run(2);assert.ok(c.speed>initial*.3,'low grip retains substantial speed after two seconds');
  run(6);assert.ok(c.speed<initial*.02,'friction eventually stops sliding');
  c.reset();assert.equal(c.speed,0);const stopped=rat.position.z;run(.2);
  assert.equal(rat.position.z,stopped,'restart clears drift');
});

test('turning cannot sweep the nose into a wall but can turn away', () => {
  const obstacle={x:.08,z:0,w:.04,d:1,y:-.1,h:.4};
  assert.equal(canTurn([obstacle],{x:0,y:0,z:0},0,Math.PI/2),false);
  assert.equal(canTurn([obstacle],{x:0,y:0,z:0},0,-Math.PI/2),true);
});


test('slopes above the walk limit cannot be climbed by holding forward', () => {
  const ramp={x:0,z:1,w:1,d:1,y:.4,h:.1,slopeZ:1};
  const {rat,c,step:run}=makeRig(makeWorld([{...floor,w:1},ramp]));
  c.press('KeyW');run(5);
  assert.ok(rat.position.z<.55, `climbed steep slope to ${rat.position.z}`);
});


test('a leap close to the first stair resumes after the rising nose clears its edge', () => {
  const {rat,c,step:run,until}=makeRig(makeWorld(level.boxes));
  Object.assign(rat.position,{x:1.66,y:0,z:2.95});rat.rotation.y=Math.PI/2;
  c.press('KeyW');c.press('Space');until(()=>c.state==='land',2);
  assert.ok(rat.position.y>=.1-1e-9, `did not climb stair: ${rat.position.y}`);
});

for (const index of [6,7]) {
  test(`${levels[index].id}: catch floor permits recovery instead of death`, () => {
    const l=levels[index];const {rat,c,until}=makeRig(makeWorld(l.boxes,l.patches));
    Object.assign(rat.position,{x:2.8,y:3,z:2.8});
    until(()=>c.state==='land',3);
    near(rat.position.y,-.45,.001,'landed on bottom catch floor');
    assert.ok(rat.position.y>l.killY);
    Object.assign(rat.position,{x:l.start.x,y:-.45,z:l.tower.recovery.z});c.reset();
    c.press('KeyW');until(()=>rat.position.z>l.start.z-.1,12);
    near(rat.position.y,0,.001,'recovery ramp rejoins start');
  });
}

test('falling beside the upper spiral catches a lower overlapping ramp', () => {
  const l=levels[6];const {rat,c,until}=makeRig(makeWorld(l.boxes,l.patches));
  Object.assign(rat.position,{x:-1.46,z:0,y:5.1});
  const lowerTop=groundHeight(l.boxes,rat.position.x,rat.position.z,3);
  until(()=>c.state==='land',3);
  near(rat.position.y,lowerTop,.001,'landed one lap below');
  assert.ok(rat.position.y>2 && rat.position.y<3);
});

test('all spiral ramp junctions can be walked through, including lap transitions', () => {
  const l=levels[6];const world=makeWorld(l.boxes);
  for(let i=1;i<l.route.length;i++) {
    const a=l.route[i-1],b=l.route[i];
    const {rat,c,until}=makeRig(world);
    Object.assign(rat.position,{x:a.x,y:a.y+a.h,z:a.z});
    rat.rotation.y=Math.atan2(b.x-a.x,b.z-a.z);
    c.press('KeyW');
    until(()=>Math.hypot(rat.position.x-b.x,rat.position.z-b.z)<.025,12);
    near(rat.position.y,b.y+b.h,.01,`junction ${i}`);
  }
});

test('each broken bridge in the sky maze can be leapt on its own storey', () => {
  const l=levels[7];
  const takeoffs=l.route.filter(b=>b.x===0 && b.z>0 && b.z<.9 && b.slopeZ>0);
  assert.equal(takeoffs.length,4);
  for(const a of takeoffs) {
    const {rat,c,until}=makeRig(makeWorld(l.boxes,l.patches));
    Object.assign(rat.position,{x:a.x,y:a.y+a.h,z:a.z});
    c.press('KeyW');c.press('Space');until(()=>c.state==='land',3);
    assert.ok(rat.position.z>a.z+.25,'cleared the broken section');
    assert.ok(rat.position.y>a.y+a.h,'landed on ascending walkway on the same storey');
  }
});

test('labyrinth void shaft causes a fatal fall, while lower junctions catch other falls', () => {
  const l=levels[8];
  const fatal=makeRig(makeWorld(l.boxes,l.patches));
  Object.assign(fatal.rat.position,{x:0,z:0,y:3.6});
  fatal.until(()=>fatal.rat.position.y<l.killY,3);
  assert.equal(fatal.c.state,'air');
  const recover=makeRig(makeWorld(l.boxes,l.patches));
  Object.assign(recover.rat.position,{x:-2.6,z:-2.6,y:2});
  recover.until(()=>recover.c.state==='land',3);
  near(recover.rat.position.y,1.2,.001,'caught the junction on the next deck down');
});

test('labyrinth broken bridges and crate hurdles can be jumped on each deck', () => {
  const l=levels[8];
  for(const deck of l.maze.decks) {
    const broken=l.maze.bridges.find(b=>b.y===deck.y);
    const hurdles=l.maze.obstacles.filter(b=>Math.abs(b.y-deck.y)<1e-9);
    for(const target of [broken,...hurdles]) {
      const a=target.a ?? {x:target.x-(target.w<target.d?.65:0),z:target.z-(target.d<target.w?.65:0)};
      const b=target.b ?? {x:target.x+(target.w<target.d?.65:0),z:target.z+(target.d<target.w?.65:0)};
      const len=Math.hypot(b.x-a.x,b.z-a.z),ux=(b.x-a.x)/len,uz=(b.z-a.z)/len;
      const {rat,c,until}=makeRig(makeWorld(l.boxes));
      Object.assign(rat.position,{x:a.x+ux*.28,z:a.z+uz*.28,y:deck.y});rat.rotation.y=Math.atan2(ux,uz);
      c.press('KeyW');c.press('Space');until(()=>c.state==='land',3);
      assert.ok((rat.position.x-a.x)*ux+(rat.position.z-a.z)*uz>.78,'cleared obstacle instead of hitting its face');
      near(rat.position.y,deck.y,.001,'landed on the same deck');
    }
  }
});

test('labyrinth switchback ramp junctions connect each deck without jumping', () => {
  const l=levels[8];
  for(let i=1;i<l.route.length;i++) {
    const a=l.route[i-1],b=l.route[i];
    if(!a.slopeX&&!a.slopeZ&&!b.slopeX&&!b.slopeZ)continue;
    const {rat,c,until}=makeRig(makeWorld(l.boxes,l.patches));
    Object.assign(rat.position,{x:a.x,y:a.y+a.h,z:a.z});
    rat.rotation.y=Math.atan2(b.x-a.x,b.z-a.z);c.press('KeyW');
    until(()=>Math.hypot(rat.position.x-b.x,rat.position.z-b.z)<.025,12);
    near(rat.position.y,b.y+b.h,.015,`switchback junction ${i}`);
  }
});
