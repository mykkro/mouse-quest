"""Renders build/previews/clips/<Clip>.png contact sheets from build/rat.blend.

Usage: blender -b build/rat.blend --python render_clips.py [-- Clip ...]  (default: all clips)
"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import bpy  # noqa: E402

import clips  # noqa: E402
import common  # noqa: E402
from imgutil import tile  # noqa: E402

FRAMES_PER_SHEET = 6


def main():
    names = common.script_args() or list(clips.CLIPS)
    arm = common.arm_obj()
    cam = common.setup_preview(res=(320, 240))
    scene = bpy.context.scene
    with tempfile.TemporaryDirectory(prefix="rat_frames_") as tmp:
        for name in names:
            clip = clips.CLIPS[name]
            arm.animation_data.action = bpy.data.actions[name]
            shots = []
            for view in ("side", "q34"):
                for i in range(FRAMES_PER_SHEET):
                    scene.frame_set(round(i * clip.frames / (FRAMES_PER_SHEET - 1)))
                    path = os.path.join(tmp, f"{name}_{view}_{i}.png")
                    common.render_view(cam, view, path)
                    shots.append(common.load_pixels(path))
            common.save_pixels(tile(shots, FRAMES_PER_SHEET), os.path.join(common.PREVIEWS, "clips", f"{name}.png"))
            print(f"render_clips: {name}")
    arm.animation_data.action = None
    print("render_clips: OK")


common.run(main)
