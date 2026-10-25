#!/usr/bin/env bash
# gltf-transform pass: build/rat_raw.glb -> dist/rat.glb (dedup, prune, resample, webp; no Draco/meshopt).
set -euo pipefail
RAT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAT"
mkdir -p dist
gt() { npx --no-install gltf-transform "$@"; }
gt dedup build/rat_raw.glb build/opt_1.glb
gt prune build/opt_1.glb build/opt_2.glb
gt resample build/opt_2.glb build/opt_3.glb
gt webp build/opt_3.glb dist/rat.glb
