"""Prints the expected GLB contents (joints, clips, speeds) as JSON for verify/check_glb.mjs."""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from clips import CLIP_SPEEDS, CLIPS, FPS  # noqa: E402
from names import JOINTS  # noqa: E402

print(json.dumps({"joints": JOINTS,
                  "clips": {n: {"duration": c.frames / FPS, "loop": c.loop} for n, c in CLIPS.items()},
                  "clipSpeeds": CLIP_SPEEDS}, indent=2))
