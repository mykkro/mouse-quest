"""Stage 3: control rig, sample every clip, bake to deform-bone actions, push to NLA."""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import clips  # noqa: E402
import common  # noqa: E402
import rigpose  # noqa: E402
from common import PipelineError, check  # noqa: E402
from names import LEGS, POLE_PARENT, ROOT_BONE  # noqa: E402

REACH_TOL = 0.002  # m; max gap between a paw and its IK target
LOOP_TOL = 1e-4
POLE_DIST = 0.05  # m; pole distance from the knee/elbow, in the leg's own bend plane


def build_controls(arm):
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.data.edit_bones
    for leg, tip in LEGS.items():
        target = eb.new(f"IK_{leg}")
        target.head = eb[tip].tail.copy()
        target.tail = target.head + Vector((0, 0, 0.01))
        target.parent = eb[ROOT_BONE]
        target.use_deform = False
        pole = eb.new(f"POLE_{leg}")
        pole.head = pole_position(eb, leg, tip)
        pole.tail = pole.head + Vector((0, 0, 0.01))
        pole.parent = eb[POLE_PARENT[leg]]
        pole.use_deform = False
    bpy.ops.object.mode_set(mode="OBJECT")
    for leg, tip in LEGS.items():
        con = arm.pose.bones[tip].constraints.new("IK")
        con.name = "IK"
        con.target, con.subtarget = arm, f"IK_{leg}"
        con.pole_target, con.pole_subtarget = arm, f"POLE_{leg}"
        con.chain_count = 3
        con.pole_angle = best_pole_angle(arm, tip, con)


def pole_position(eb, leg, tip):
    """A point in the leg's bend plane, on the knee/elbow's side of the hip-to-paw line."""
    hip = eb[tip].parent.parent.head   # Thigh/UpperArm head
    knee = eb[tip].parent.head         # Calf/Forearm head = knee/elbow
    paw = eb[tip].tail                 # Foot/Hand tail
    u = (paw - hip).normalized()
    d = (knee - hip) - (knee - hip).dot(u) * u
    check(d.length >= 0.001, f"{leg}: chain too straight to define a bend plane (knee {d.length * 1000:.2f} mm off hip-paw line)")
    return knee + POLE_DIST * d.normalized()


def best_pole_angle(arm, tip, con):
    """The pole angle for which IK reproduces the rest pose (targets sit at the rest paws)."""
    chain = [arm.pose.bones[tip]]
    while len(chain) < 3:
        chain.append(chain[-1].parent)

    def score(angle):
        con.pole_angle = angle
        rigpose.apply_pose(arm, {})
        bpy.context.view_layer.update()
        return sum(abs(a - b) for pb in chain
                   for ra, rb in zip(pb.matrix, pb.bone.matrix_local) for a, b in zip(ra, rb))

    scores = {angle: score(angle) for angle in (0.0, math.pi / 2, -math.pi / 2, math.pi)}
    coarse = min(scores, key=scores.get)
    # Refine within +-10 deg of the best quarter-turn: a 0.05 deg sweep finds the basin, then a
    # golden-section search inside the winning bracket (the error is V-shaped, ~0.15 per degree).
    step = math.radians(0.05)
    sweep = {coarse + k * step: None for k in range(-200, 201)}
    for angle in sweep:
        sweep[angle] = score(angle)
    a0 = min(sweep, key=sweep.get)
    lo, hi = a0 - step, a0 + step
    g = (math.sqrt(5) - 1) / 2
    while hi - lo > 1e-7:
        m1, m2 = hi - g * (hi - lo), lo + g * (hi - lo)
        if score(m1) < score(m2):
            hi = m2
        else:
            lo = m1
    best = (lo + hi) / 2
    err = score(best)
    if sweep[a0] < err:
        best, err = a0, sweep[a0]
    con.pole_angle = best
    check(err < 1e-3, f"{tip}: no pole angle reproduces the rest pose "
                      f"(quarter-turn errors {scores}, best refined {math.degrees(best):.3f} deg: {err:.2e})")
    print(f"03_anims: {tip} pole angle {math.degrees(best):.3f} deg (rest-pose error {err:.2e})")
    return best


def set_constraints(arm, mute):
    for tip in LEGS.values():
        arm.pose.bones[tip].constraints["IK"].mute = mute


def rig_info(arm):
    bones = arm.data.bones
    return clips.Rig(pelvis_head=tuple(bones["SKEL_Pelvis"].head_local),
                     targets={leg: tuple(bones[f"IK_{leg}"].head_local) for leg in LEGS})


def load_locked():
    """Hand-polished actions (custom property locked=True) from the previous build/rat.blend."""
    if not os.path.exists(common.RAT_BLEND):
        return {}
    with bpy.data.libraries.load(common.RAT_BLEND, link=False) as (src, dst):
        dst.actions = [n for n in src.actions if n in clips.CLIPS]
    locked = {}
    for action in dst.actions:
        if action is None:
            continue
        if action.get("locked"):
            action.use_fake_user = True
            locked[action.name] = action
        else:
            bpy.data.actions.remove(action)
    # Appending leaves a Library datablock for rat.blend, and Blender refuses to save over a file
    # that is a library of the current one. Nothing is linked from it, so drop it.
    for lib in list(bpy.data.libraries):
        if os.path.normcase(os.path.abspath(bpy.path.abspath(lib.filepath))) == os.path.normcase(common.RAT_BLEND):
            bpy.data.libraries.remove(lib)
    return locked


def sample_clip(arm, clip, rig):
    """Visual local transforms of every deform bone, one dict per frame; checks IK reach."""
    deform = [pb for pb in arm.pose.bones if pb.bone.use_deform]
    frames, worst = [], {}
    for f, t in enumerate(clips.times(clip)):
        pose = clips.sample(clip.name, t, rig)
        rigpose.apply_pose(arm, pose)
        bpy.context.view_layer.update()
        for leg, tip in LEGS.items():
            if pose.get(f"IK_{leg}.fk", 0.0) == 0.0:
                gap = (arm.pose.bones[tip].tail - arm.pose.bones[f"IK_{leg}"].head).length
                if gap > worst.get(leg, (0.0, 0))[0]:
                    worst[leg] = (gap, f)
        frames.append({pb.name: rigpose.basis_from_pose(pb) for pb in deform})
    bad = {leg: v for leg, v in worst.items() if v[0] > REACH_TOL}
    if bad:
        raise PipelineError(
            f"{clip.name}: IK target out of reach: "
            + ", ".join(f"{leg} by {g * 1000:.1f} mm at frame {f}" for leg, (g, f) in bad.items())
            + ". Shorten the stride (raise gait cycles or lower duty) or move the target in clips.PARAMS/poses.")
    if clip.loop:
        for name, m0 in frames[0].items():
            m1 = frames[-1][name]
            diff = max(abs(a - b) for ra, rb in zip(m0, m1) for a, b in zip(ra, rb))
            check(diff < LOOP_TOL, f"{clip.name}: {name} first/last frame differ by {diff:.2e}")
    return frames


def bake(arm, clip, rig):
    set_constraints(arm, mute=False)
    frames = sample_clip(arm, clip, rig)
    set_constraints(arm, mute=True)
    rigpose.reset(arm)
    action = bpy.data.actions.new(clip.name)
    action.use_fake_user = True
    arm.animation_data.action = action
    prev = {}
    for f, mats in enumerate(frames):
        for name, m in mats.items():
            pb = arm.pose.bones[name]
            loc, rot, _scale = m.decompose()
            if name in prev and prev[name].dot(rot) < 0:
                rot.negate()  # keep quaternions continuous so interpolation takes the short way
            prev[name] = rot
            pb.location, pb.rotation_quaternion = loc, rot
            pb.keyframe_insert("location", frame=f, group=name)
            pb.keyframe_insert("rotation_quaternion", frame=f, group=name)
    arm.animation_data.action = None
    return action


def push_nla(arm, actions):
    ad = arm.animation_data
    for track in list(ad.nla_tracks):
        ad.nla_tracks.remove(track)
    for name in clips.CLIPS:
        track = ad.nla_tracks.new()
        track.name = name
        track.strips.new(name, 0, actions[name])
        track.mute = True  # 04_export unmutes them; muted here so a single action can be previewed
    ad.action = None


def main():
    arm = common.arm_obj()
    scene = bpy.context.scene
    scene.render.fps, scene.render.fps_base = clips.FPS, 1.0
    arm.animation_data_create()
    arm.animation_data.action = None
    build_controls(arm)
    rig = rig_info(arm)
    actions = load_locked()
    for name, clip in clips.CLIPS.items():
        if name in actions:
            print(f"03_anims: keeping locked clip {name}")
            continue
        print(f"03_anims: baking {name} ({clip.frames + 1} frames)")
        actions[name] = bake(arm, clip, rig)
    push_nla(arm, actions)
    scene["clipSpeeds"] = dict(clips.CLIP_SPEEDS)
    set_constraints(arm, mute=True)
    rigpose.reset(arm)
    common.save_blend(common.RAT_BLEND)


common.run(main)
