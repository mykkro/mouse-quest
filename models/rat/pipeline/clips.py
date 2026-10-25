"""Clip library: each clip is a pure function (t, rig) -> pose (no bpy).

A pose maps "<bone>.<channel>" to a float; channels missing from a pose are 0 (rest):
  rx ry rz  rotation in radians about the armature's X/Y/Z axes (X = rat's left, Y = backward,
            Z = up), pivoting at the bone's head and carried along by its children.
            Forward-pointing bones (pelvis, spine, neck, head, jaw): rx > 0 tips the nose down,
            rz > 0 turns it to the rat's left. Tail: rx > 0 lifts the tip.
            Downward-pointing legs: rx < 0 swings the paw forward; ry < 0 swings a left leg out.
  x y z     head offset in metres, armature axes; only on SKEL_Pelvis and the IK_<leg> targets.
  fk        on IK_<leg>: 0 = IK keeps the paw on its target, 1 = the leg follows its FK channels.
All numbers below are starting values: tune them against the contact sheets, then rerun
`build.sh anims`.
"""
import math
from dataclasses import dataclass
from functools import partial
from typing import Callable

from gait import GaitParams, foot_offset, smoothstep
from names import LEGS

FPS = 30

PARAMS = {
    "Idle": dict(length=4.0, breath_cycles=6, breath_amp=0.015, tail_cycles=2, tail_amp=0.12,
                 look_amp=0.1, ear_at=1.1, ear_amp=0.3, blink_at=2.6),
    "Sniff": dict(length=4.0, look_up=-0.25, look_side=0.35, nose_cycles=24, nose_amp=0.08,
                  jaw_cycles=12, jaw_amp=0.04, breath_cycles=12),
    # Walk/Run play several gait cycles per clip so each stride fits the legs (see plan).
    "Walk": dict(gait=GaitParams(length=1.0, cycles=3, speed=0.25, duty=0.65, step_height=0.012,
                                 phases={"LH": 0.0, "LF": 0.25, "RH": 0.5, "RF": 0.75}),
                 bob=0.002, sway=0.04, tail_amp=0.15),
    "Run": dict(gait=GaitParams(length=0.4, cycles=2, speed=0.8, duty=0.3, step_height=0.02,
                                phases={"LH": 0.0, "RH": 0.05, "LF": 0.5, "RF": 0.6}),
                flex=0.12, bob=0.004, pitch=0.08, tail_amp=0.1),
    "Jump_Start": dict(length=0.3, crouch_at=0.18),
    "Jump_Air": dict(length=0.5, paddle=0.004, tail_amp=0.05),
    "Jump_Land": dict(length=0.35, absorb_at=0.12),
    "Turn": dict(length=0.6, angle=math.pi / 2, step_height=0.012, step_len=0.5,
                 starts={"LF": 0.0, "RH": 0.15, "RF": 0.35, "LH": 0.5}, spine_lead=0.25, neck_lead=0.3),
    "Rear_Start": dict(length=0.5),
    "Rear_Loop": dict(length=3.0, look_amp=0.3, nod_amp=0.1, nose_cycles=18, nose_amp=0.08,
                      breath_cycles=9),
    "Rear_End": dict(length=0.5),
    "Eat": dict(length=2.0, chew_cycles=8, jaw_amp=0.15, paw_amp=0.05),
    "Death": dict(length=1.5, stagger_at=0.3, down_at=0.8, twitch_at=1.05, twitch_len=0.3),
}

SPINE = [f"SKEL_Spine{i}" for i in range(4)]
TAIL = [f"SKEL_Tail{i}" for i in range(5)]


# --- layers --------------------------------------------------------------------

def osc(t, length, cycles, phase=0.0):
    """Sine with a whole number of cycles per clip, so loops close."""
    return math.sin(2 * math.pi * (cycles * t / length + phase))


def bump(t, start, dur):
    """0 outside [start, start+dur], smooth sin^2 hump inside."""
    if t <= start or t >= start + dur:
        return 0.0
    return math.sin(math.pi * (t - start) / dur) ** 2


def add(*poses):
    out = {}
    for p in poses:
        for k, v in p.items():
            out[k] = out.get(k, 0.0) + v
    return out


def each(bones, ch, total):
    """Spread a total rotation evenly over a chain."""
    return {f"{b}.{ch}": total / len(bones) for b in bones}


def both(fmt, value):
    return {fmt.format(s): value for s in ("L", "R")}


def keyposes(t, keys):
    """Smoothstep between (time, pose) keys; holds the first/last key outside their range."""
    if t <= keys[0][0]:
        return dict(keys[0][1])
    for (t0, p0), (t1, p1) in zip(keys, keys[1:]):
        if t <= t1:
            s = smoothstep((t - t0) / (t1 - t0))
            return {k: p0.get(k, 0.0) + (p1.get(k, 0.0) - p0.get(k, 0.0)) * s for k in set(p0) | set(p1)}
    return dict(keys[-1][1])


def breathing(t, length, cycles, amp):
    return {"SKEL_Spine1.rx": amp * osc(t, length, cycles), "SKEL_Spine2.rx": amp * osc(t, length, cycles)}


def tail_wave(t, length, cycles, amp, ch="rz", lag=0.6, decay=0.8):
    """Travelling wave down the tail: each segment lags and shrinks."""
    return {f"{b}.{ch}": amp * decay ** i * math.sin(2 * math.pi * cycles * t / length - lag * i)
            for i, b in enumerate(TAIL)}


def blink(t, start, dur=0.18, close=0.6):
    b = bump(t, start, dur) * close
    return {"FACIAL_L_EyelidUpper.ry": b, "FACIAL_L_EyelidLower.ry": -0.6 * b,
            "FACIAL_R_EyelidUpper.ry": -b, "FACIAL_R_EyelidLower.ry": 0.6 * b}


def stabilize_head(pose, k):
    """Counter-rotate the neck by k times the body's pitch and yaw."""
    out = dict(pose)
    for ch in ("rx", "rz"):
        body = sum(pose.get(f"{b}.{ch}", 0.0) for b in ["SKEL_Pelvis", *SPINE])
        out[f"SKEL_Neck0.{ch}"] = out.get(f"SKEL_Neck0.{ch}", 0.0) - k * body
    return out


def gait_legs(g, t):
    out = {}
    for leg in LEGS:
        dx, dy, dz = foot_offset(g, leg, t)
        out.update({f"IK_{leg}.x": dx, f"IK_{leg}.y": dy, f"IK_{leg}.z": dz})
    return out


def rotz_offset(p, angle):
    """Offset that carries point p to its rotation by angle about the vertical axis through the origin."""
    c, s = math.cos(angle), math.sin(angle)
    x, y = p[0], p[1]
    return (x * c - y * s - x, x * s + y * c - y)


# --- poses -----------------------------------------------------------------------

CROUCH = {"SKEL_Pelvis.z": -0.012, "SKEL_Spine1.rx": 0.08, "SKEL_Spine2.rx": 0.08, "SKEL_Neck0.rx": -0.1}
PUSH = {"SKEL_Pelvis.z": 0.008, "SKEL_Pelvis.rx": -0.15, "IK_LH.y": 0.02, "IK_RH.y": 0.02,
        "IK_LF.y": -0.01, "IK_RF.y": -0.01, "IK_LF.z": 0.015, "IK_RF.z": 0.015}
TUCK = {"IK_LH.y": 0.008, "IK_RH.y": 0.008, "IK_LH.z": 0.02, "IK_RH.z": 0.02,
        "IK_LF.y": -0.006, "IK_RF.y": -0.006, "IK_LF.z": 0.022, "IK_RF.z": 0.022,
        "SKEL_Tail0.rx": 0.1, "SKEL_Tail1.rx": 0.05}
ABSORB = {"SKEL_Pelvis.z": -0.014, "SKEL_Spine1.rx": 0.08, "SKEL_Spine2.rx": 0.08, "SKEL_Neck0.rx": -0.12}
REAR = {"SKEL_Pelvis.rx": -0.9, "SKEL_Pelvis.z": 0.01, **each(SPINE, "rx", -0.3),
        "SKEL_Neck0.rx": 0.45, "SKEL_Head.rx": 0.35, "SKEL_Tail0.rx": 0.8,
        "IK_LF.fk": 1.0, "IK_RF.fk": 1.0,
        **both("SKEL_{}_UpperArm.rx", 0.5), **both("SKEL_{}_Forearm.rx", -1.0)}
SIT = {"SKEL_Pelvis.rx": -0.6, "SKEL_Pelvis.z": 0.004, **each(SPINE, "rx", -0.2),
       "SKEL_Neck0.rx": 0.35, "SKEL_Head.rx": 0.45, "SKEL_Tail0.rx": 0.55,
       "IK_LF.fk": 1.0, "IK_RF.fk": 1.0,
       **both("SKEL_{}_UpperArm.rx", -0.6), **both("SKEL_{}_Forearm.rx", -1.2), **both("SKEL_{}_Hand.rx", -0.4)}
STAGGER = {"SKEL_Pelvis.ry": 0.2, "SKEL_Pelvis.rz": 0.15, "SKEL_Neck0.rx": 0.3,
           "IK_RF.y": -0.01, "IK_RF.z": 0.006}
# Ry > 0 rolls the back toward +X, so the rat lies on its right side.
ON_SIDE = {"SKEL_Pelvis.ry": 1.45, "SKEL_Pelvis.z": -0.04, "SKEL_Pelvis.x": -0.025,
           "SKEL_Neck0.rx": 0.2, "SKEL_Neck0.ry": 0.15, **{f"IK_{leg}.fk": 1.0 for leg in LEGS},
           "SKEL_L_Thigh.rx": 0.3, "SKEL_R_Thigh.rx": 0.2, "SKEL_L_UpperArm.rx": -0.3, "SKEL_R_UpperArm.rx": -0.2,
           "SKEL_Tail0.rz": 0.3, "SKEL_Tail1.rz": 0.2, "FACIAL_C_Jaw.rx": 0.08,
           "FACIAL_L_EyelidUpper.ry": 0.3, "FACIAL_R_EyelidUpper.ry": -0.3}


# --- clips -----------------------------------------------------------------------

def idle(t, rig):
    P = PARAMS["Idle"]
    L = P["length"]
    return add(breathing(t, L, P["breath_cycles"], P["breath_amp"]),
               tail_wave(t, L, P["tail_cycles"], P["tail_amp"]),
               {"SKEL_Head.rz": P["look_amp"] * osc(t, L, 1),
                "FACIAL_L_Ear0.ry": P["ear_amp"] * bump(t, P["ear_at"], 0.25)},
               blink(t, P["blink_at"]))


def sniff(t, rig):
    P = PARAMS["Sniff"]
    L, up, side = P["length"], P["look_up"], P["look_side"]
    lifted = {"SKEL_Neck0.rx": up, "SKEL_Head.rx": 0.6 * up}
    look = keyposes(t, [(0.0, {}), (0.8, lifted), (1.6, {**lifted, "SKEL_Neck1.rz": side}),
                        (2.4, {**lifted, "SKEL_Neck1.rz": -side}), (3.2, lifted), (L, {})])
    return add(look,
               {"FACIAL_Nose.rx": P["nose_amp"] * osc(t, L, P["nose_cycles"]),
                "FACIAL_C_Jaw.rx": P["jaw_amp"] * max(0.0, osc(t, L, P["jaw_cycles"]))},
               breathing(t, L, P["breath_cycles"], 0.01),
               tail_wave(t, L, 2, 0.08))


def walk(t, rig):
    P = PARAMS["Walk"]
    g = P["gait"]
    L, n = g.length, g.cycles
    sway = P["sway"] * osc(t, L, n)
    body = {"SKEL_Pelvis.z": -P["bob"] * math.cos(2 * math.pi * 2 * n * t / L),
            "SKEL_Pelvis.rz": sway, "SKEL_Spine1.rz": -0.5 * sway, "SKEL_Spine3.rz": -0.5 * sway}
    return add(stabilize_head(body, 0.5), gait_legs(g, t), tail_wave(t, L, n, P["tail_amp"], lag=0.7))


def run(t, rig):
    P = PARAMS["Run"]
    g = P["gait"]
    L, n = g.length, g.cycles
    flex = osc(t, L, n)
    body = {"SKEL_Pelvis.z": P["bob"] * osc(t, L, 2 * n, 0.25),
            "SKEL_Pelvis.rx": P["pitch"] * osc(t, L, n, 0.25),
            **each(SPINE, "rx", 4 * P["flex"] * flex)}
    return add(stabilize_head(body, 0.7), gait_legs(g, t),
               {"SKEL_Tail0.rx": -0.1 * flex}, tail_wave(t, L, n, P["tail_amp"], ch="rx"))


def jump_start(t, rig):
    P = PARAMS["Jump_Start"]
    return keyposes(t, [(0.0, {}), (P["crouch_at"], CROUCH), (P["length"], PUSH)])


def jump_air(t, rig):
    P = PARAMS["Jump_Air"]
    L = P["length"]
    paddle = P["paddle"] * osc(t, L, 1)
    return add(TUCK, {"IK_LH.y": paddle, "IK_RH.y": paddle, "IK_LF.y": -paddle, "IK_RF.y": -paddle,
                      "SKEL_Tail2.rx": P["tail_amp"] * osc(t, L, 1)})


def jump_land(t, rig):
    P = PARAMS["Jump_Land"]
    return keyposes(t, [(0.0, TUCK), (P["absorb_at"], ABSORB), (P["length"], {})])


def turn(t, rig, sign):
    P = PARAMS["Turn"]
    L = P["length"]
    total = sign * P["angle"]
    body = total * smoothstep(t / L)
    px, py = rotz_offset(rig.pelvis_head, body)
    lead = math.sin(math.pi * min(t / L, 1.0)) ** 2  # 0 at both ends
    pose = {"SKEL_Pelvis.rz": body, "SKEL_Pelvis.x": px, "SKEL_Pelvis.y": py,
            **each(SPINE, "rz", sign * P["spine_lead"] * lead),
            "SKEL_Neck1.rz": sign * P["neck_lead"] * lead}
    for leg, start in P["starts"].items():
        s = min(max((t / L - start) / P["step_len"], 0.0), 1.0)
        dx, dy = rotz_offset(rig.targets[leg], total * smoothstep(s))
        pose.update({f"IK_{leg}.x": dx, f"IK_{leg}.y": dy,
                     f"IK_{leg}.z": P["step_height"] * math.sin(math.pi * s)})
    return pose


def rear_start(t, rig):
    return keyposes(t, [(0.0, {}), (PARAMS["Rear_Start"]["length"], REAR)])


def rear_loop(t, rig):
    P = PARAMS["Rear_Loop"]
    L = P["length"]
    return add(REAR, {"SKEL_Head.rz": P["look_amp"] * osc(t, L, 1),
                      "SKEL_Neck1.rx": P["nod_amp"] * osc(t, L, 2),
                      "FACIAL_Nose.rx": P["nose_amp"] * osc(t, L, P["nose_cycles"])},
               breathing(t, L, P["breath_cycles"], 0.01))


def rear_end(t, rig):
    return keyposes(t, [(0.0, REAR), (PARAMS["Rear_End"]["length"], {})])


def eat(t, rig):
    P = PARAMS["Eat"]
    L, n = P["length"], P["chew_cycles"]
    chew = 0.5 + 0.5 * osc(t, L, n)
    return add(SIT, {"FACIAL_C_Jaw.rx": P["jaw_amp"] * chew,
                     **both("SKEL_{}_Forearm.rx", P["paw_amp"] * osc(t, L, n)),
                     "SKEL_Head.rx": 0.03 * osc(t, L, n, 0.25)})


def death(t, rig):
    P = PARAMS["Death"]
    base = keyposes(t, [(0.0, {}), (P["stagger_at"], STAGGER), (P["down_at"], ON_SIDE), (P["length"], ON_SIDE)])
    twitch = bump(t, P["twitch_at"], P["twitch_len"])
    return add(base, {"SKEL_L_Thigh.rx": 0.25 * twitch, "SKEL_L_Calf.rx": -0.2 * twitch})


# --- registry ----------------------------------------------------------------------

@dataclass(frozen=True)
class Rig:
    pelvis_head: tuple  # rest head of SKEL_Pelvis, armature space
    targets: dict       # leg -> rest position of its IK target


@dataclass(frozen=True)
class Clip:
    name: str
    length: float
    loop: bool
    fn: Callable

    @property
    def frames(self):
        """Index of the last frame; the clip has frames + 1 samples."""
        return math.ceil(self.length * FPS - 1e-9)


def _clip(name, loop, fn, params=None):
    P = PARAMS[params or name]
    return Clip(name, P["gait"].length if "gait" in P else P["length"], loop, fn)


CLIPS = {c.name: c for c in [
    _clip("Idle", True, idle), _clip("Sniff", True, sniff), _clip("Walk", True, walk), _clip("Run", True, run),
    _clip("Jump_Start", False, jump_start), _clip("Jump_Air", True, jump_air), _clip("Jump_Land", False, jump_land),
    _clip("Turn_L", False, partial(turn, sign=1), "Turn"), _clip("Turn_R", False, partial(turn, sign=-1), "Turn"),
    _clip("Rear_Start", False, rear_start), _clip("Rear_Loop", True, rear_loop), _clip("Rear_End", False, rear_end),
    _clip("Eat", True, eat), _clip("Death", False, death),
]}
CLIP_SPEEDS = {"Walk": PARAMS["Walk"]["gait"].speed, "Run": PARAMS["Run"]["gait"].speed}


def times(clip):
    return [min(f / FPS, clip.length) for f in range(clip.frames + 1)]


def sample(name, t, rig):
    return CLIPS[name].fn(t, rig)
