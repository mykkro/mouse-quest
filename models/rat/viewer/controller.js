// Keyboard controller for the rat (tank controls), shared by the viewer and the parkour game.
// No three.js import: the rat only needs position {x, y, z} and rotation {y}.
// W/S move along the rat's facing (local +Z), A/D rotate it. Clips stay in place; this code
// moves the object at the clip's speed so planted feet don't slide. Backward walking plays
// Walk reversed at half speed (and moves at half speed) for the same reason.
// Rats are strong jumpers: a standing rat clears ~35 cm, a running one leaps ~1 m.
export const GRAVITY = 9.81;
export const CTRL = { turnRate: 2.1, runTurnRate: 3.0, backScale: 0.5, turnInPlaceScale: 0.5,
                      jumpHeight: 0.35,                   // standing jump, m
                      leapHeight: 0.25,                   // moving jump, m
                      leapSpeed: { walk: 1.2, run: 2.2 }, // forward speed through a moving jump, m/s
                      jumpCut: 0.4,  // releasing Space while rising keeps this fraction of the upward speed
                      landRecover: 0.12, fade: 0.2 };
export const KEYMAP = {
  forward: ['KeyW', 'ArrowUp'], back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], run: ['ShiftLeft', 'ShiftRight'],
  jump: ['Space'], eat: ['KeyE'], rear: ['KeyR'], sniff: ['KeyF'], die: ['KeyX'],
};
export const MAPPED = new Set(Object.values(KEYMAP).flat());
export const launchSpeed = (height) => Math.sqrt(2 * GRAVITY * height);
// Endless flat ground at height 0 with no walls: the viewer's world.
export const FLAT_WORLD = { step: 0.015, groundHeight: () => 0, move: (from, to) => to };

// States in which the keys may pick a new clip; all others wait for a clip to finish.
// 'recover' is a pass-through after a moving landing: the next frame crossfades from Jump_Land.
const FREE = new Set(['idle', 'walk', 'run', 'back', 'turn', 'eat', 'sniff', 'recover']);

export function createController({ rat, actions, speeds, play, current, world = FLAT_WORLD }) {
  const held = new Set();
  const isDown = (action) => KEYMAP[action].some((code) => held.has(code));
  let state = 'idle';
  let speed = 0;       // current forward speed, m/s (negative = backward)
  let airSpeed = 0;    // forward speed locked in at take-off (momentum through the air)
  let vy = 0;
  let driftX = 0, driftZ = 0;
  let jumpCut = false; // upward speed already cut because Space was released
  let stateTime = 0;   // seconds spent in the current state

  function enter(next, clip, timeScale = 1, fade = CTRL.fade) {
    if (next !== state) stateTime = 0;
    state = next;
    actions[clip].setEffectiveTimeScale(timeScale);
    if (current() !== actions[clip]) play(clip, fade); // Walk/back/turn share a clip: only timeScale changes
  }

  // What the movement keys ask for right now; used on the ground and during jumps alike.
  function moveIntent() {
    const fwd = isDown('forward') - isDown('back');
    const turn = isDown('left') - isDown('right');
    const running = fwd > 0 && isDown('run');
    const v = fwd > 0 ? speeds[running ? 'Run' : 'Walk'] : fwd < 0 ? -speeds.Walk * CTRL.backScale : 0;
    return { fwd, turn, running, speed: v };
  }

  // Move d metres along the facing through the world; false if a wall stopped the move.
  function moveDisplacement(dx, dz) {
    const p = rat.position;
    const count = Math.max(1, Math.ceil(Math.hypot(dx,dz)/.008));
    let clear = true;
    for (let i=0;i<count;i++) {
      const to = {x:p.x+dx/count,z:p.z+dz/count};
      const r = world.move({x:p.x,z:p.z},to,p.y,rat.rotation.y);
      if (r.x !== to.x) { driftX = 0; clear = false; }
      if (r.z !== to.z) { driftZ = 0; clear = false; }
      p.x = r.x; p.z = r.z;
      if (state !== 'air') {
        const g = world.groundHeight(p.x,p.z,p.y);
        if (Math.abs(g-p.y) <= world.step) p.y = g;
      }
    }
    return clear;
  }

  function moveForward(d) {
    return moveDisplacement(Math.sin(rat.rotation.y)*d, Math.cos(rat.rotation.y)*d);
  }

  function turn(angle) {
    // Sample the sweep so a quick turn cannot put the nose through a wall.
    const count = Math.max(1,Math.ceil(Math.abs(angle)/.05));
    for(let i=0;i<count;i++) {
      const next = rat.rotation.y + angle/count;
      if (world.canTurn && !world.canTurn(rat.position,rat.rotation.y,next)) break;
      rat.rotation.y = next;
    }
  }

  function steer(m, dt) {
    turn(m.turn * (m.running ? CTRL.runTurnRate : CTRL.turnRate) * dt);
    const surface = world.surface?.(rat.position) ?? {};
    const scale = surface.effect === 'glue' ? .35 : 1;
    const targetX = Math.sin(rat.rotation.y)*m.speed*scale;
    const targetZ = Math.cos(rat.rotation.y)*m.speed*scale;
    if (surface.effect === 'slip') {
      // Low grip: steering and braking take several times longer than dry ground.
      const blend = 1-Math.exp(-.55*dt);
      driftX += (targetX-driftX)*blend;
      driftZ += (targetZ-driftZ)*blend;
      driftX -= (surface.slopeX ?? 0)*1.2*dt;
      driftZ -= (surface.slopeZ ?? 0)*1.2*dt;
    } else { driftX = targetX; driftZ = targetZ; }
    speed = Math.hypot(driftX,driftZ) * (m.fwd < 0 ? -1 : 1);
    moveDisplacement(driftX*dt,driftZ*dt);
    if (surface.effect === 'glue' && current()) current().setEffectiveTimeScale(m.fwd < 0 ? -CTRL.backScale*scale : scale);
  }

  // On the ground: follow small steps, or start falling if the ground dropped away.
  function settle() {
    const p = rat.position;
    const g = world.groundHeight(p.x, p.z, p.y);
    if (g >= p.y - world.step) { p.y = g; return true; }
    vy = 0;
    airSpeed = speed;
    jumpCut = true; // nothing to cut: it walked off an edge
    enter('air', 'Jump_Air', 1, 0.1);
    return false;
  }

  function takeOff() {
    const m = moveIntent();
    if (m.speed > 0) { // forward leap: lower and long
      vy = launchSpeed(CTRL.leapHeight);
      airSpeed = m.running ? CTRL.leapSpeed.run : CTRL.leapSpeed.walk;
    } else {           // standing (or backing) jump: straight up
      vy = launchSpeed(CTRL.jumpHeight);
      airSpeed = m.speed;
    }
    if (world.surface?.(rat.position)?.effect === 'glue') airSpeed *= .65;
    driftX = driftZ = 0;
    jumpCut = false;
    enter('air', 'Jump_Air', 1, 0.1);
  }

  function onPress(code) {
    if (state === 'dead') { enter('idle', 'Idle', 1, 0.3); return; }
    if (!FREE.has(state)) return;
    if (KEYMAP.jump.includes(code)) {
      // Standing jumps crouch first; a moving rat leaves the ground straight away.
      if (moveIntent().speed > 0) takeOff();
      else enter('jump_start', 'Jump_Start', 1, 0.1);
    }
    else if (KEYMAP.rear.includes(code)) enter('rear_start', 'Rear_Start');
    else if (KEYMAP.die.includes(code)) enter('dead', 'Death');
  }

  function clipFinished(name) {
    if (name === 'Jump_Start' && state === 'jump_start') takeOff();
    else if ((name === 'Jump_Land' && state === 'land') || (name === 'Rear_End' && state === 'rear_end')) enter('idle', 'Idle');
    else if (name === 'Rear_Start' && state === 'rear_start') {
      if (isDown('rear')) enter('rear', 'Rear_Loop', 1, 0);
      else enter('rear_end', 'Rear_End', 1, 0);
    }
  }

  function updateAir(m, dt) {
    // Momentum carries the rat; the keys can only turn it. A wall stops the forward motion.
    turn(m.turn * CTRL.turnRate * dt);
    speed = airSpeed;
    if (!moveForward(speed * dt)) {
      speed = 0;
      // A rising nose may brush a stair before clearing it; keep the leap intent
      // until the apex so that contact does not cancel the whole jump.
      if (vy <= 0) airSpeed = 0;
    }
    // Hold Space for the full jump; let go early (or just tap it) for a lower, shorter hop.
    if (!jumpCut && vy > 0 && !isDown('jump')) { vy *= CTRL.jumpCut; jumpCut = true; }
    const p = rat.position;
    const y0 = p.y;
    p.y += vy * dt - 0.5 * GRAVITY * dt * dt; // exact parabola step: same arc at any frame rate
    vy -= GRAVITY * dt;
    const g = world.groundHeight(p.x, p.z, Math.max(y0, p.y)); // surfaces passed this step count
    if (vy <= 0 && p.y <= g) {
      p.y = g; vy = 0;
      if (world.surface?.(p)?.effect === 'slip') {
        // Transfer the actual landing velocity into a boosted slide, even after
        // the player releases movement. Apply once per landing, never per frame.
        const landingSpeed = Math.max(-3.2, Math.min(3.2, speed * 1.25));
        driftX = Math.sin(rat.rotation.y) * landingSpeed;
        driftZ = Math.cos(rat.rotation.y) * landingSpeed;
        speed = landingSpeed;
      }
      enter('land', 'Jump_Land', 1, 0.1);
    }
  }

  function stepUpdate(dt) {
    stateTime += dt;
    const m = moveIntent();
    if (state === 'air') { updateAir(m, dt); return; }
    if (state === 'jump_start' || state === 'land') {
      steer(m, dt); // crouch and landing: the keys drive the rat as on the ground
      if (!settle()) return;
      if (state === 'land' && m.speed !== 0 && stateTime >= CTRL.landRecover) {
        state = 'recover'; // locomotion below picks the clip on the next frame
      }
      return;
    }
    if (state === 'rear' && !isDown('rear')) { enter('rear_end', 'Rear_End', 1, 0.15); return; }
    if (!FREE.has(state)) { speed = 0; return; }

    if (m.fwd > 0) enter(m.running ? 'run' : 'walk', m.running ? 'Run' : 'Walk');
    else if (m.fwd < 0) enter('back', 'Walk', -CTRL.backScale);
    else if (m.turn) enter('turn', 'Walk', CTRL.turnInPlaceScale);
    else if (isDown('eat')) enter('eat', 'Eat');
    else if (isDown('sniff')) enter('sniff', 'Sniff');
    else if (state !== 'idle') enter('idle', 'Idle');
    steer(m, dt);
    settle();
  }

  function update(dt) {
    const count = Math.max(1, Math.ceil(dt / (1/120)));
    for (let i=0;i<count;i++) stepUpdate(dt/count);
  }

  // Back to a calm idle on the spot (the caller places the rat first).
  function reset() {
    held.clear();
    speed = airSpeed = vy = 0;
    driftX = driftZ = 0;
    jumpCut = false;
    state = 'reset';
    enter('idle', 'Idle', 1, 0);
  }

  return {
    press(code) { held.add(code); onPress(code); },
    release(code) { held.delete(code); },
    releaseAll() { held.clear(); },
    clipFinished, update, reset,
    get state() { return state; },
    get speed() { return speed; },
    get hasInput() { return held.size > 0; },
  };
}
