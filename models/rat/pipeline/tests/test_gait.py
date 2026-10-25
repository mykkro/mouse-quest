import pytest

from gait import GaitParams, foot_offset, in_stance, smoothstep

WALK = GaitParams(length=1.0, cycles=3, speed=0.25, duty=0.65, step_height=0.012,
                  phases={"LH": 0.0, "LF": 0.25, "RH": 0.5, "RF": 0.75})
DT = 1e-5


def grid(g, n=3000):
    return [g.length * i / n for i in range(n)]


def test_smoothstep_clamps():
    assert smoothstep(-1) == 0 and smoothstep(2) == 1 and smoothstep(0.5) == 0.5


def test_planted_foot_moves_back_at_ground_speed():
    for leg in WALK.phases:
        for t in grid(WALK):
            if in_stance(WALK, leg, t) and in_stance(WALK, leg, t + DT):
                y0 = foot_offset(WALK, leg, t)[1]
                y1 = foot_offset(WALK, leg, t + DT)[1]
                assert (y1 - y0) / DT == pytest.approx(WALK.speed, rel=1e-6)
                assert foot_offset(WALK, leg, t)[2] == 0.0


def test_reach():
    assert WALK.period == pytest.approx(1 / 3)
    assert WALK.reach == pytest.approx(0.25 * 0.65 / 3)


def test_path_is_continuous():
    for leg in WALK.phases:
        for t in grid(WALK):
            a, b = foot_offset(WALK, leg, t), foot_offset(WALK, leg, t + DT)
            assert max(abs(p - q) for p, q in zip(a, b)) < 1e-4


def test_clip_loops():
    for leg in WALK.phases:
        assert foot_offset(WALK, leg, 0.0) == pytest.approx(foot_offset(WALK, leg, WALK.length), abs=1e-9)


def test_swing_peaks_at_step_height():
    peak = max(foot_offset(WALK, "LH", t)[2] for t in grid(WALK, 30000))
    assert peak == pytest.approx(WALK.step_height, abs=1e-6)


def test_walk_lifts_legs_in_lateral_sequence():
    ts = grid(WALK, 6000)
    lift = {leg: next(t for t in ts if in_stance(WALK, leg, t - DT) and not in_stance(WALK, leg, t))
            for leg in WALK.phases}
    assert sorted(lift, key=lift.get) == ["LH", "LF", "RH", "RF"]
