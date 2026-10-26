# Mouse Quest: rat parkour prototype

Guide a rigged, animated rat along narrow beams, across gaps and up stairs to the
green goal pad. If you fall, you start again from the beginning. It runs in the
browser with [three.js](https://threejs.org/).

![The rat on a zig-zag beam, heading for the stairs](docs/images/game.png)

This is a prototype: one hand-built level, made to find out whether rat parkour is fun.

## Play

Once GitHub Pages is enabled (see [Deploy](#deploy-to-github-pages)), the game is at
`https://<your-user>.github.io/<this-repo>/`, and the animation viewer is at
`…/models/rat/viewer/`.

| Key | Action |
|---|---|
| W / ↑ | walk forward |
| Shift + W | run |
| S / ↓ | walk backward |
| A D / ← → | turn |
| Space | jump: hold for higher; while moving it's a leap (running leaps go about 1 m) |
| E / R / F | eat / rear up / sniff (hold) |
| X | play dead |

Tips:
- Tap Space for a short hop.
- You climb the stairs with a moving leap (W + Space).
- The last gap needs a running leap with Space held.

## Run locally

Requires [Node.js](https://nodejs.org/) 24.

```bash
npm install
npm run game          # http://localhost:5180/game/  (viewer: /models/rat/viewer/)
npm test              # unit tests: collision, controller, level, site build
```

Headless browser checks (need a local Edge or Chrome):

```bash
npm run check:game
npm run check:viewer
```

## Deploy to GitHub Pages

1. Push the repository to GitHub.
2. In the repo, open **Settings → Pages → Build and deployment** and set **Source** to **GitHub Actions**.
3. Push to `master` (or run the **Deploy to GitHub Pages** workflow by hand).

The workflow (`.github/workflows/pages.yml`) runs the tests and `npm run build:site`, then
publishes `dist/`. Build and preview the same site locally with `npm run preview:site`
(http://localhost:5181/).

## Project layout

```
game/                 the parkour game: page, box collision, level data
models/rat/viewer/    animation viewer + shared modules (keyboard controller, crossfades, camera)
models/rat/dist/      rat.glb: the rigged, animated rat (46 joints, 14 clips)
models/rat/pipeline/  headless Blender pipeline that builds rat.glb
tools/                site build script, headless browser checks
docs/superpowers/     design specs and implementation plans
```

### The rat asset pipeline

`models/rat/pipeline/build.sh` turns a static rat mesh into `rat.glb` using Blender 5.2
headless:
1. Clean the mesh.
2. Rebuild a 46-bone skeleton from the mesh's vertex-group weights.
3. Generate 14 procedural clips: idle, sniff, walk, run, jump, turns, rear, eat and death. They use IK feet that stay planted.
4. Export the GLB.
5. Optimise it with gltf-transform.

The source mesh is not included (see the license section), so the pipeline only runs
if you supply a compatible mesh in `models/rat/cgtrader/`. Its Python tests run with
`python -m pytest models/rat/pipeline/tests`.

## License

The code is released under the [MIT License](LICENSE).

The rat 3D model (`models/rat/dist/rat.glb` and `models/rat/rat.png`) is a third-party
asset derived from a CGTrader model. It is **not** covered by the MIT License. See
[models/rat/MODEL-LICENSE.md](models/rat/MODEL-LICENSE.md).
