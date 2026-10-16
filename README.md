# Cloudgarden · Astra × Tripo CLI

A peaceful, playable browser game above the clouds. Explore four islands, cross wooden bridges, awaken three satellite shrines, then return home.

**[Play Cloudgarden](https://cloudgarden-tripo-cli.vercel.app/)** · **[Interactive CLI workshop](https://cloudgarden-tripo-cli.vercel.app/workshop.html)**

Astra built the game with TypeScript, Vite and Three.js. Tripo CLI generated all sixteen physical model assets. Blender optimized meshes and textures. Sky, fog, wind, smoke and shrine particles are runtime effects.

## Run it

Node.js 22.12+ and a desktop browser with WebGL2 are required.

```sh
npm ci
npm run dev
```

WASD to walk, Shift to run, mouse to look, E to interact, Esc to pause. Drag to look if mouse capture is unavailable. Progress saves in this browser.

```sh
npm test
npm run build
npm run preview
```

The production build is static. Playing needs no Tripo account or API key.

## The CLI workflow

Sign up through [Tripo’s official quick start](https://developers.tripo3d.ai/en/docs/quick-start). See [official CLI documentation](https://developers.tripo3d.ai/en/docs/cli) for current setup and commands.

```sh
npm install -g tripo-cli
tripo login
tripo doctor
tripo make "a small mossy stone lantern" --dry-run
# After checking the plan, generate and download:
tripo make "a small mossy stone lantern" --out tripo-out
```

Installation is free; generation uses credits. The sample command above is a starter prompt. The exact lantern prompt, flags and real result appear in `public/workflow/evidence.json`.

For this project, the coding agent invokes the CLI, validates requests, tracks generation tasks and downloads GLBs directly into local asset folders. Blender prepares browser-sized derivatives. Three.js loads those local files through `src/assets.ts`. `src/world.ts` places the lantern beside the home path:

```ts
this.place("lantern", 2.7, 11, 1.5, -0.4);
```

This is an end-to-end workflow, not a claim that one command creates the entire game.

## Evidence and provenance

- `public/assets/`: optimized, self-contained GLBs and manifest.
- `asset-ledger.json`: prompts, task IDs, validation and credit accounting.
- `public/workflow/evidence.json`: exact lantern command and actual CLI result fields.
- `scripts/generate.py`: project-specific generation orchestration.
- `scripts/optimize.py`: Blender cleanup and texture reduction.
- `scripts/repair-locomotion.mjs`: local processing of generated animation clips.

The new lantern cost 20 credits. Total recorded project charges are 400 credits, including earlier rigging corrections. The original project cap was 500 credits. Generation and billing figures are historical, not current pricing guarantees.

Raw source archives and account logs are excluded. Signed download URLs and absolute machine paths were removed from the public ledger. Original source references remain as provenance; those archives are retained locally by the creator.

Generation scripts are project-specific: the ledger skips existing tasks, and the original guard assumes a starting balance of 1,000 credits. Adapt the budget guard for your own account before using it. Never resubmit after an interrupted command without checking the existing task.

## Scope

Single-player, keyboard-and-mouse exploration. No combat or multiplayer. The current browser build includes the corrected explorer motion cycles. Tripo-generated assets are included for inspecting and running this project; no claim of exclusive ownership over AI outputs is made.

Code is MIT licensed. Tripo-generated asset usage remains subject to the applicable Tripo terms. Consult those terms before redistributing assets independently.
