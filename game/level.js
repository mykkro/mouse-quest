// The prototype course: axis-aligned boxes in path order (see the design spec, "Level").
// Units are metres. The rat starts facing +Z; its left is +X. Box y is the bottom face.
const H = 0.1; // thickness below the top for flat blocks
const box = (x, z, w, d, topY, h = H) => ({ x, y: topY - h, z, w, d, h });

const boxes = [
  box(0, 0, 0.40, 0.40, 0),                   // 1 start platform
  box(0, 0.70, 0.15, 1.00, 0),                // 2 warm-up path, 15 cm wide (z 0.2..1.2)
  box(0, 1.45, 0.08, 0.50, 0),                //   narrowing to 8 cm (z 1.2..1.7)
  box(0, 2.15, 0.40, 0.40, 0),                // 3 after a 25 cm gap: zig-zag pad 1 (z 1.95..2.35)
  box(0.50, 2.15, 0.60, 0.06, 0),             // 4 beam turning left (x 0.2..0.8)
  box(0.90, 2.15, 0.20, 0.20, 0),             //   pad 2
  box(0.90, 2.55, 0.06, 0.60, 0),             //   beam turning right (z 2.25..2.85)
  box(0.90, 2.95, 0.20, 0.20, 0),             //   pad 3
  box(1.30, 2.95, 0.60, 0.06, 0),             //   beam turning left (x 1.0..1.6)
  box(1.70, 2.95, 0.20, 0.20, 0),             //   pad 4 (x 1.6..1.8)
  box(1.95, 2.95, 0.30, 0.25, 0.10, 0.20),    // 5 stairs: +10 cm (solid to the base so they are walls)
  box(2.25, 2.95, 0.30, 0.25, 0.25, 0.35),    //   +15 cm
  box(2.55, 2.95, 0.30, 0.25, 0.45, 0.55),    //   +20 cm
  box(2.90, 2.95, 0.40, 0.40, 0.05),          // 6 landing after a 40 cm drop (x 2.7..3.1)
  box(3.70, 2.95, 1.20, 0.035, 0.05),         // 7 balance beam, 3.5 cm (x 3.1..4.3)
  box(4.90, 2.95, 1.20, 0.20, 0.05),          // 8 run-up (x 4.3..5.5)
  box(6.55, 2.95, 0.50, 0.50, 0.05),          // 9 goal platform after an 80 cm gap (x 6.3..6.8)
];

export const level = {
  boxes,
  start: { x: 0, z: 0, top: 0, yaw: 0 },
  goal: { x: 6.55, z: 2.95, w: 0.2, d: 0.2, top: 0.05 },
  killY: Math.min(...boxes.map((b) => b.y + b.h)) - 0.3,
};
