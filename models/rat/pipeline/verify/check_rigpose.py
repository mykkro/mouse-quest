"""Checks rigpose.apply_pose / basis_from_pose semantics on build/02_skeleton.blend (never saves)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import common  # noqa: E402
import rigpose  # noqa: E402
from common import check  # noqa: E402


def settle(arm, pose):
    rigpose.apply_pose(arm, pose)
    bpy.context.view_layer.update()


def head(pb):
    return pb.head.copy()


def direction(pb):
    return (pb.tail - pb.head).normalized()


def rest_dir(pb):
    return (pb.bone.tail_local - pb.bone.head_local).normalized()


def assert_rest(arm, label):
    settle(arm, {})
    for pb in arm.pose.bones:
        d = max(abs(a - b) for ra, rb in zip(pb.matrix, pb.bone.matrix_local) for a, b in zip(ra, rb))
        check(d < 1e-6, f"{label}: {pb.name} not back at rest after apply_pose({{}}) (diff {d})")


def main():
    arm = common.arm_obj()
    pbs = arm.pose.bones

    # a. world-axis rotation about the bone head
    settle(arm, {"SKEL_L_Thigh.ry": 0.4})
    t = pbs["SKEL_L_Thigh"]
    check((head(t) - t.bone.head_local).length < 1e-6, f"thigh head moved by {(head(t) - t.bone.head_local).length}")
    want = (rigpose.world_rotation(0, 0.4, 0) @ rest_dir(t)).normalized()
    err = (direction(t) - want).length
    check(err < 1e-5, f"thigh direction off by {err}")
    assert_rest(arm, "a")

    # b. children inherit
    settle(arm, {"SKEL_Spine0.rz": 0.3, "SKEL_Spine1.rz": 0.2})
    s1 = pbs["SKEL_Spine1"]
    want = (rigpose.world_rotation(0, 0, 0.5) @ rest_dir(s1)).normalized()
    err = (direction(s1) - want).length
    check(err < 1e-5, f"Spine1 direction off by {err}")
    assert_rest(arm, "b")

    # c. location on a child of SKEL_ROOT
    settle(arm, {"SKEL_Pelvis.x": 0.01, "SKEL_Pelvis.z": -0.02})
    p = pbs["SKEL_Pelvis"]
    err = (head(p) - p.bone.head_local - Vector((0.01, 0, -0.02))).length
    check(err < 1e-6, f"pelvis moved wrongly (error {err})")
    assert_rest(arm, "c")

    # d. KeyError cases
    for bad in ({"NOPE.rx": 0.1}, {"SKEL_Head.qq": 0.1}, {"SKEL_Head.x": 0.1}, {"SKEL_Head": 0.1}):
        try:
            rigpose.apply_pose(arm, bad)
        except KeyError:
            pass
        else:
            check(False, f"apply_pose({bad}) did not raise KeyError")
        assert_rest(arm, f"d {bad}")

    # e. basis_from_pose round trip
    settle(arm, {"SKEL_Spine1.rz": 0.4, "SKEL_Spine1.ry": 0.2, "SKEL_Head.rx": -0.3, "SKEL_Head.rz": 0.5,
                 "SKEL_L_Calf.ry": 0.6, "SKEL_L_Calf.rx": 0.2})
    recorded = {pb.name: pb.matrix.copy() for pb in pbs}
    bases = {pb.name: rigpose.basis_from_pose(pb) for pb in pbs}
    rigpose.reset(arm)
    for pb in pbs:
        pb.matrix_basis = bases[pb.name]
    bpy.context.view_layer.update()
    for pb in pbs:
        d = max(abs(a - b) for ra, rb in zip(pb.matrix, recorded[pb.name]) for a, b in zip(ra, rb))
        check(d < 1e-5, f"basis round trip: {pb.name} differs by {d}")
    assert_rest(arm, "e")

    print("check_rigpose: OK")


common.run(main)
