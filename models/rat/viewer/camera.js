// Swing a camera round its orbit target until it sits behind something facing `yaw`
// (forward = (sin yaw, cos yaw) in x/z). Eases with rate; leaves the height alone.
export function swingBehind(camera, target, yaw, dt, rate = 2.5) {
  const ox = camera.position.x - target.x;
  const oz = camera.position.z - target.z;
  let d = Math.atan2(-Math.sin(yaw), -Math.cos(yaw)) - Math.atan2(ox, oz);
  d = Math.atan2(Math.sin(d), Math.cos(d));
  const a = d * (1 - Math.exp(-rate * dt));
  const c = Math.cos(a), s = Math.sin(a);
  camera.position.x = target.x + ox * c + oz * s;
  camera.position.z = target.z - ox * s + oz * c;
}
