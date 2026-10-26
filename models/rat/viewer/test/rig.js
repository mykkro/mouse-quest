// Test rig for the shared controller: a fake rat, fake AnimationActions and a recording play().
import { createController, FLAT_WORLD } from '../controller.js';

const CLIPS = ['Idle', 'Walk', 'Run', 'Jump_Start', 'Jump_Air', 'Jump_Land', 'Eat', 'Sniff',
  'Rear_Start', 'Rear_Loop', 'Rear_End', 'Death'];

export function makeRig(world = FLAT_WORLD) {
  const rat = { position: { x: 0, y: 0, z: 0 }, rotation: { y: 0 } };
  const actions = Object.fromEntries(CLIPS.map((name) => [name, {
    name, timeScale: 1, setEffectiveTimeScale(t) { this.timeScale = t; return this; },
  }]));
  let current = null;
  const played = [];
  const play = (name) => { current = actions[name]; played.push(name); };
  const c = createController({ rat, actions, speeds: { Walk: 0.25, Run: 0.8 }, play, current: () => current, world });
  const step = (seconds, dt = 1 / 60) => { for (let i = 0; i < Math.round(seconds / dt); i++) c.update(dt); };
  const until = (pred, maxSeconds, dt = 1 / 60) => {
    for (let t = 0; t < maxSeconds; t += dt) { if (pred()) return t; c.update(dt); }
    throw new Error(`condition not met within ${maxSeconds} s (state ${c.state})`);
  };
  return { rat, c, played, actions, step, until };
}
