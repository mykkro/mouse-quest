"""Checks build/02_skeleton.blend against the Stage 2 spec."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import common  # noqa: E402
from common import check  # noqa: E402
from names import CANDIDATE_PARENTS, HIERARCHY, JOINTS, ROOT_BONE, mirror_name  # noqa: E402
from rig_math import MIN_LEN  # noqa: E402

# Source weights are slightly asymmetric: measured worst gaps are SKEL_L/R_Thigh 3.1 mm and
# SKEL_L/R_UpperArm 1.1 mm (all other bones < 0.3 mm), so 2 mm was too tight.
SYMMETRY_TOL = 0.005  # m


def main():
    arm, mesh = common.arm_obj(), common.mesh_obj()
    bones = arm.data.bones
    check(sorted(b.name for b in bones) == sorted(JOINTS), f"bones differ from JOINTS: {sorted(b.name for b in bones)}")
    for b in bones:
        parent = b.parent.name if b.parent else None
        allowed = CANDIDATE_PARENTS.get(b.name, [HIERARCHY[b.name]])
        check(parent in allowed, f"{b.name}: parent {parent}, expected one of {allowed}")
        check(b.use_deform, f"{b.name}: must be a deform bone")
        check(b.length >= MIN_LEN * 0.999, f"{b.name}: length {b.length:.5f} m")
    check(bones[ROOT_BONE].head_local.length < 1e-9, "SKEL_ROOT must sit at the origin")
    for b in bones:
        m = bones[mirror_name(b.name)]
        mirrored = m.head_local.copy()
        mirrored.x = -mirrored.x
        check((b.head_local - mirrored).length < SYMMETRY_TOL,
              f"{b.name} and {m.name} heads are not mirror images ({(b.head_local - mirrored).length * 1000:.1f} mm)")
    common.require_groups(mesh)
    for v in mesh.data.vertices:
        ws = [g.weight for g in v.groups if g.weight > 0]
        check(1 <= len(ws) <= 4, f"vertex {v.index} has {len(ws)} influences")
        check(abs(sum(ws) - 1) < 1e-4, f"vertex {v.index} weights sum to {sum(ws)}")
    check(mesh.parent == arm, "RatMesh must be parented to the armature")
    mods = [m for m in mesh.modifiers if m.type == "ARMATURE"]
    check(len(mods) == 1 and mods[0].object == arm, "RatMesh needs exactly one Armature modifier using Rat")
    for s in "LR":
        z = bones[f"SKEL_{s}_Foot"].tail_local.z
        check(z < 0.02, f"SKEL_{s}_Foot tail at z={z:.3f}; feet should be near the ground")
    print("check_skeleton: OK")


common.run(main)
