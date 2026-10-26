// Crossfading clip player for the rat's AnimationActions (no three.js import).
// three.js fades always run 0->1 / 1->0, so a clip re-selected while still fading out would pop;
// these weight ramps start from each action's current weight instead.
export const ONE_SHOTS = new Set(['Jump_Start', 'Jump_Land', 'Turn_L', 'Turn_R', 'Rear_Start', 'Rear_End', 'Death']);

export function createClipPlayer(actions, { loopOnce }) {
  for (const [name, action] of Object.entries(actions)) {
    if (ONE_SHOTS.has(name)) { action.setLoop(loopOnce); action.clampWhenFinished = true; }
  }
  let current = null;
  const ramps = new Map(); // action -> { from, to, t, dur }
  const ramp = (action, to, dur) => ramps.set(action, { from: action.getEffectiveWeight(), to, t: 0, dur });

  function step(dt) {
    for (const [action, r] of ramps) {
      r.t += dt;
      const k = Math.min(1, r.t / r.dur);
      action.setEffectiveWeight(r.from + (r.to - r.from) * k);
      if (k >= 1) { ramps.delete(action); if (r.to === 0) action.stop(); }
    }
  }

  function play(name, fade) {
    const next = actions[name];
    const prev = current;
    if (prev && prev !== next && fade > 0) {
      const finishedHold = ONE_SHOTS.has(name) && next.time >= next.getClip().duration;
      if (next.isRunning() && next.getEffectiveWeight() > 0 && !finishedHold) {
        ramp(next, 1, fade); // still fading out: keep its time, fade back in from where it is
      } else {
        next.reset().setEffectiveWeight(0).play();
        ramps.delete(next);
        ramp(next, 1, fade);
      }
      ramp(prev, 0, fade);
    } else {
      ramps.delete(next);
      next.reset().setEffectiveWeight(1).play();
      if (prev && prev !== next) { ramps.delete(prev); prev.stop(); }
    }
    current = next;
  }

  return { play, step, get current() { return current; } };
}
