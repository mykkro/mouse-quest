"""Renders the Stage 2 test poses to build/previews/skeleton_<pose>_<view>.png (never saves the .blend)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import bpy  # noqa: E402

import common  # noqa: E402
import rigpose  # noqa: E402

SPINE = [f"SKEL_Spine{i}" for i in range(4)]
NECK_HEAD = ["SKEL_Neck0", "SKEL_Neck1", "SKEL_Head"]
TAIL = [f"SKEL_Tail{i}" for i in range(5)]

POSES = {
    "rest": {},
    # Ry turns a downward leg toward -X, so the left (+X) leg spreads with a negative angle.
    "legs_spread": {"SKEL_L_Thigh.ry": -0.5, "SKEL_R_Thigh.ry": 0.5,
                    "SKEL_L_UpperArm.ry": -0.5, "SKEL_R_UpperArm.ry": 0.5},
    "spine_bent": {f"{b}.rz": 0.5236 / 4 for b in SPINE},         # 30 degrees to the left
    "head_turned": {f"{b}.rz": 0.7854 / 3 for b in NECK_HEAD},    # 45 degrees to the left
    "tail_curled": {f"{b}.rz": 0.45 for b in TAIL},
}


def main():
    arm = common.arm_obj()
    cam = common.setup_preview()
    for name, pose in POSES.items():
        rigpose.apply_pose(arm, pose)
        bpy.context.view_layer.update()
        for view in ("q34", "top"):
            common.render_view(cam, view, os.path.join(common.PREVIEWS, f"skeleton_{name}_{view}.png"))
    print("render_poses: OK")


common.run(main)
