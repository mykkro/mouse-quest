#!/usr/bin/env bash
# Builds models/rat/dist/rat.glb from the read-only source in models/rat/cgtrader/.
# Usage: models/rat/pipeline/build.sh [first_stage]    stages: prep skeleton anims export
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAT="$(dirname "$HERE")"
BLENDER="${BLENDER:-/c/Program Files/Blender Foundation/Blender 5.2/blender.exe}"
PYTHON="${PYTHON:-python}"
STAGES=(prep skeleton anims export)
START="${1:-prep}"
[[ " ${STAGES[*]} " == *" $START "* ]] || { echo "unknown stage '$START' (one of: ${STAGES[*]})" >&2; exit 2; }

bl() { "$BLENDER" --factory-startup -b "$1" --python-exit-code 1 --python "$HERE/$2" -- "${@:3}"; }
src_hash() { sha256sum "$RAT"/cgtrader/* | sha256sum; }
BEFORE="$(src_hash)"
trap '[ "$(src_hash)" = "$BEFORE" ] || { echo "PIPELINE ERROR: files in cgtrader/ changed" >&2; exit 1; }' EXIT

running=false
stage() { [ "$1" = "$START" ] && running=true; $running; }

"$PYTHON" -m pytest "$HERE/tests" -q

if stage prep; then
  bl "$RAT/cgtrader/Rat.blend" 01_prep.py
  bl "$RAT/build/01_prep.blend" verify/check_prep.py
fi

echo "build.sh: OK"
