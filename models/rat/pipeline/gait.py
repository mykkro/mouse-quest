"""Gait engine: periodic IK-target paths that keep each foot planted during stance (no bpy).

Armature space: X = rat's left, Y = backward, Z = up. The game moves the rat toward -Y
(glTF +Z) at `speed`, so a planted foot must slide toward +Y at exactly `speed`.
"""
import math
from dataclasses import dataclass


def smoothstep(s):
    s = min(max(s, 0.0), 1.0)
    return s * s * (3.0 - 2.0 * s)


@dataclass(frozen=True)
class GaitParams:
    length: float       # clip length, s
    cycles: int         # whole stride cycles per clip, so the clip loops
    speed: float        # m/s the game moves the rat forward
    duty: float         # fraction of a cycle each foot is on the ground
    step_height: float  # m, peak lift during swing
    phases: dict        # leg -> lift-off time as a fraction of the cycle
    centres: dict | None = None  # leg -> y offset of the stride centre from rest (default 0)

    @property
    def period(self):
        return self.length / self.cycles

    @property
    def reach(self):
        """How far a planted foot travels backward relative to the body during one stance."""
        return self.speed * self.duty * self.period


def _phase(g, leg, t):
    return (g.cycles * t / g.length - g.phases[leg]) % 1.0


def in_stance(g, leg, t):
    return _phase(g, leg, t) >= 1.0 - g.duty


def foot_offset(g, leg, t):
    """(dx, dy, dz) of the leg's IK target from its rest position at time t."""
    u = _phase(g, leg, t)
    swing = 1.0 - g.duty
    r = g.reach
    c = (g.centres or {}).get(leg, 0.0)
    if u < swing:  # lifted, moving forward from c + r/2 to c - r/2
        s = u / swing
        return (0.0, c + r / 2 - r * smoothstep(s), g.step_height * math.sin(math.pi * s))
    s = (u - swing) / g.duty  # planted, sliding back from c - r/2 to c + r/2 at `speed`
    return (0.0, c - r / 2 + r * s, 0.0)
