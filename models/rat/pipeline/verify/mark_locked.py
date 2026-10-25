"""Marks the Idle clip in build/rat.blend locked with a sentinel (or unlocks it with -- --unlock)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import bpy  # noqa: E402

import common  # noqa: E402


def main():
    action = bpy.data.actions["Idle"]
    if "--unlock" in common.script_args():
        action["locked"] = False
        action.pop("sentinel", None)
    else:
        action["locked"] = True
        action["sentinel"] = 123
    common.save_blend(common.RAT_BLEND)


common.run(main)
