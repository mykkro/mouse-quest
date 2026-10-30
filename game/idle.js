// Presentation only: never moves the rat or interrupts physics / held controls.
export const IDLE_DELAY = 15;

export function createIdleDirector({ play, duration, onEnter, onExit, random = Math.random }) {
  let quiet = 0, active = false, wait = 0, remaining = 0, sequence = [], dance = false;
  function nextClip() {
    const clip = sequence.shift();
    if (!clip) {
      play('Idle'); remaining = 0; wait = 5 + random()*5;
      return;
    }
    play(clip);
    remaining = clip === 'Rear_Loop' ? 1.2 : duration(clip);
  }
  function wake() {
    quiet = 0;
    if (!active) return;
    active = false; sequence = []; remaining = 0;
    play('Idle'); onExit();
  }
  return {
    wake,
    get active() { return active; },
    update(dt, eligible, elapsed = dt) {
      if (!eligible) { wake(); return; }
      if (!active) {
        quiet += elapsed;
        if (quiet < IDLE_DELAY) return;
        active = true; wait = 0; dance = false; onEnter();
      }
      if (remaining > 0) {
        remaining -= dt;
        if (remaining <= 0) nextClip();
      } else {
        wait -= dt;
        if (wait <= 0) {
          sequence = dance
            ? ['Turn_L','Turn_R','Rear_Start','Rear_Loop','Rear_End','Turn_R','Turn_L']
            : ['Sniff'];
          dance = !dance; nextClip();
        }
      }
    },
  };
}
