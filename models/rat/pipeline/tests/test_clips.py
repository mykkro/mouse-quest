import json
import math
import os
import subprocess
import sys

import pytest

import clips
from clips import CLIP_SPEEDS, CLIPS, FPS, Rig, rotz_offset, sample, times
from names import JOINTS, LEGS

RIG = Rig(pelvis_head=(0.0, 0.077, 0.073),
          targets={"LH": (0.03, 0.06, 0.0), "RH": (-0.03, 0.06, 0.0),
                   "LF": (0.022, -0.06, 0.0), "RF": (-0.022, -0.06, 0.0)})

SPEC = [("Idle", True, 4.0), ("Sniff", True, 4.0), ("Walk", True, 1.0), ("Run", True, 0.4),
        ("Jump_Start", False, 0.3), ("Jump_Air", True, 0.5), ("Jump_Land", False, 0.35),
        ("Turn_L", False, 0.6), ("Turn_R", False, 0.6), ("Rear_Start", False, 0.5),
        ("Rear_Loop", True, 3.0), ("Rear_End", False, 0.5), ("Eat", True, 2.0), ("Death", False, 1.5)]
IK_BONES = {f"IK_{leg}" for leg in LEGS}


def close(a, b, tol=1e-6):
    return all(abs(a.get(k, 0.0) - b.get(k, 0.0)) <= tol for k in set(a) | set(b))


def test_clip_table_matches_spec():
    assert [(c.name, c.loop, c.length) for c in CLIPS.values()] == SPEC


def test_loops_have_whole_frame_counts():
    for c in CLIPS.values():
        if c.loop:
            assert c.length * FPS == pytest.approx(round(c.length * FPS))
    assert CLIPS["Jump_Land"].frames == 11
    assert times(CLIPS["Jump_Land"])[-1] == pytest.approx(0.35)
    assert len(times(CLIPS["Idle"])) == 121


def test_speeds():
    assert CLIP_SPEEDS == {"Walk": 0.25, "Run": 0.8}


@pytest.mark.parametrize("name", [n for n, loop, _ in SPEC if loop])
def test_loops_close(name):
    c = CLIPS[name]
    assert close(sample(name, 0.0, RIG), sample(name, c.length, RIG))


@pytest.mark.parametrize("name", [n for n, _, _ in SPEC])
def test_channels_are_valid(name):
    for t in times(CLIPS[name]):
        for key, v in sample(name, t, RIG).items():
            bone, ch = key.rsplit(".", 1)
            assert bone in JOINTS or bone in IK_BONES, key
            assert math.isfinite(v), key
            if ch in ("rx", "ry", "rz"):
                assert abs(v) <= math.pi, key
            elif ch in ("x", "y", "z"):
                assert bone == "SKEL_Pelvis" or bone in IK_BONES, key
                assert abs(v) < 0.1, key
            elif ch == "fk":
                assert bone in IK_BONES and 0.0 <= v <= 1.0, key
            else:
                pytest.fail(f"unknown channel {key}")


@pytest.mark.parametrize("name,sign", [("Turn_L", 1), ("Turn_R", -1)])
def test_turn_ends_in_rotated_neutral(name, sign):
    end = sample(name, CLIPS[name].length, RIG)
    angle = sign * math.pi / 2
    assert end["SKEL_Pelvis.rz"] == pytest.approx(angle)
    px, py = rotz_offset(RIG.pelvis_head, angle)
    assert (end["SKEL_Pelvis.x"], end["SKEL_Pelvis.y"]) == pytest.approx((px, py))
    for leg, q in RIG.targets.items():
        dx, dy = rotz_offset(q, angle)
        assert end[f"IK_{leg}.x"] == pytest.approx(dx) and end[f"IK_{leg}.y"] == pytest.approx(dy)
        assert end[f"IK_{leg}.z"] == pytest.approx(0.0, abs=1e-12)
    others = {k: v for k, v in end.items() if not k.startswith(("SKEL_Pelvis.", "IK_"))}
    assert close(others, {}, 1e-9)


def test_rotz_offset():
    assert rotz_offset((0.0, -1.0, 0.0), math.pi / 2) == pytest.approx((1.0, 1.0))


def test_death_holds_last_pose():
    L = CLIPS["Death"].length
    assert close(sample("Death", L, RIG), sample("Death", L - 0.1, RIG))


@pytest.mark.parametrize("first,second", [("Rear_Start", "Rear_Loop"), ("Rear_Loop", "Rear_End"),
                                          ("Jump_Air", "Jump_Land")])
def test_chained_clips_meet(first, second):
    end = CLIPS[first].length if not CLIPS[first].loop else 0.0
    assert close(sample(first, end, RIG), sample(second, 0.0, RIG))


def test_walk_feet_follow_gait():
    g = clips.PARAMS["Walk"]["gait"]
    for t in times(CLIPS["Walk"]):
        p = sample("Walk", t, RIG)
        for leg in LEGS:
            assert (p[f"IK_{leg}.x"], p[f"IK_{leg}.y"], p[f"IK_{leg}.z"]) == pytest.approx(
                clips.foot_offset(g, leg, t))


def test_write_expected_prints_spec():
    script = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "write_expected.py")
    out = json.loads(subprocess.run([sys.executable, script], capture_output=True, text=True, check=True).stdout)
    assert out["joints"] == JOINTS
    assert list(out["clips"]) == [n for n, _, _ in SPEC]
    assert out["clips"]["Jump_Land"]["duration"] == pytest.approx(11 / 30)
    assert out["clipSpeeds"] == CLIP_SPEEDS
