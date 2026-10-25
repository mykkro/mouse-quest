"""Checks build/rat.blend against the Stage 3 spec. Option: -- --expect-locked <Clip>."""
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import bpy  # noqa: E402
from mathutils import Quaternion, Vector  # noqa: E402

import clips  # noqa: E402
import common  # noqa: E402
import rigpose  # noqa: E402
from common import check  # noqa: E402
from names import JOINTS, LEGS  # noqa: E402


def channels(action):
    by_bone = defaultdict(dict)
    for fc in common.action_fcurves(action):
        bone = fc.data_path.split('"')[1]
        by_bone[bone][(fc.data_path.rsplit(".", 1)[1], fc.array_index)] = fc
    return by_bone


def transform_at(fcs, frame):
    loc = Vector([fcs[("location", i)].evaluate(frame) for i in range(3)])
    rot = Quaternion([fcs[("rotation_quaternion", i)].evaluate(frame) for i in range(4)])
    return loc, rot


def check_fk_channel(arm):
    """apply_pose's IK_<leg>.fk channel drives the IK constraint influence (deferred from Task 3)."""
    con = arm.pose.bones[LEGS["LH"]].constraints["IK"]
    rigpose.apply_pose(arm, {"IK_LH.fk": 1.0})
    check(con.influence == 0.0, f"IK_LH.fk=1 must set {LEGS['LH']} IK influence to 0, got {con.influence}")
    rigpose.apply_pose(arm, {})
    check(con.influence == 1.0, f"apply_pose(arm, {{}}) must restore {LEGS['LH']} IK influence to 1, got {con.influence}")


RUN_HEAD_MIN_Z = 0.03  # m; the pre-fix Run bottomed out at 0.0282, the fixed one at 0.0396


def check_run_head_clearance(arm):
    """Run's SKEL_Head must stay above RUN_HEAD_MIN_Z on every frame (baked action, IK muted)."""
    scene = bpy.context.scene
    arm.animation_data.action = bpy.data.actions["Run"]
    lows = []
    for f in range(clips.CLIPS["Run"].frames + 1):
        scene.frame_set(f)
        lows.append(arm.pose.bones["SKEL_Head"].head.z)
    arm.animation_data.action = None
    print(f"check_anims: Run head z min {min(lows):.4f} m")
    check(min(lows) > RUN_HEAD_MIN_Z, f"Run: head z {min(lows):.4f} <= {RUN_HEAD_MIN_Z}")


def main():
    args = common.script_args()
    expect_locked = args[args.index("--expect-locked") + 1] if "--expect-locked" in args else None
    arm = common.arm_obj()
    ad = arm.animation_data
    check(ad is not None and ad.action is None, "armature must have no active action")
    tracks = {t.name: t for t in ad.nla_tracks}
    check(set(tracks) == set(clips.CLIPS), f"NLA tracks {sorted(tracks)} != clips")
    for name, clip in clips.CLIPS.items():
        action = bpy.data.actions.get(name)
        check(action is not None and action.use_fake_user, f"{name}: action missing or without fake user")
        check(tracks[name].mute and tracks[name].strips[0].action == action, f"{name}: NLA track wrong or unmuted")
        check(tuple(action.frame_range) == (0.0, float(clip.frames)),
              f"{name}: frame range {tuple(action.frame_range)}, expected (0, {clip.frames})")
        by_bone = channels(action)
        check(set(by_bone) == set(JOINTS), f"{name}: keyed bones differ from JOINTS: {sorted(set(by_bone) ^ set(JOINTS))}")
        if clip.loop:
            for bone, fcs in by_bone.items():
                l0, q0 = transform_at(fcs, 0)
                l1, q1 = transform_at(fcs, clip.frames)
                check((l0 - l1).length < 1e-4 and q0.rotation_difference(q1).angle < 1e-3,
                      f"{name}: {bone} first and last frames differ")
    for tip in LEGS.values():
        check(arm.pose.bones[tip].constraints["IK"].mute, f"{tip}: IK constraint must be saved muted")
    check_fk_channel(arm)
    check(bpy.context.scene.render.fps == clips.FPS, "scene fps must be 30")
    check(bpy.context.scene["clipSpeeds"].to_dict() == clips.CLIP_SPEEDS, "scene clipSpeeds wrong")
    if expect_locked:
        check(bpy.data.actions[expect_locked].get("sentinel") == 123,
              f"locked clip {expect_locked} was regenerated (sentinel lost)")
    check_run_head_clearance(arm)
    print("check_anims: OK")


common.run(main)
