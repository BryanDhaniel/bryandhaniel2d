# Kiznaiver's Village

An HD-2D village portfolio for **Bryan Dhaniel (Kiznaiver)**, Software Engineer and AI/ML Engineer in Bandung, Indonesia. Walk a pixel-art character around a 3D diorama village; each building opens a section of the portfolio. A fast, accessible plain version lives at `/plain`.

- **Next.js 16** (App Router, Cache Components) + TypeScript (strict) + Tailwind CSS 4
- **three.js** with **React Three Fiber**, **drei** and **postprocessing**, loaded client-side only with `next/dynamic` (`ssr: false`). `/plain` never loads three.js.
- **zustand** for game state, **Framer Motion** for the HTML panels
- All art and sound are generated in code from one 46-colour palette. No binary assets are required; real models, sprite sheets, LUTs and normal maps can be swapped in by path.

| Building      | Section              |
| ------------- | -------------------- |
| Home          | About                |
| Workshop      | Projects             |
| Library       | Education & Research |
| AI Lab        | Skills               |
| Inn + mailbox | Contact              |

## Run it

Requires Node 20.9 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:3000. The recruiter-friendly page is http://localhost:3000/plain.

| Script            | What it does                                                                    |
| ----------------- | ------------------------------------------------------------------------------- |
| `npm run dev`     | Development server                                                              |
| `npm run build`   | Production build (all routes prerender as static)                               |
| `npm start`       | Serve the production build                                                      |
| `npm run check`   | Type-check, lint, Prettier check and unit tests in one go                       |
| `npm run lint`    | ESLint (Next.js + TypeScript rules + Prettier compat)                           |
| `npm run format`  | Prettier (with Tailwind class sorting)                                          |
| `npm test`        | Vitest: layout, collision, pathing, day/night, grades, quality, art, content    |
| `npm run sprites` | Export the player atlas, portrait and palette to `public/assets/sprites/player` |

## Deploy to Vercel

1. Push the repository to GitHub.
2. In Vercel, **Add New → Project**, import the repository and keep the detected Next.js settings (build `next build`, install `npm install`). No environment variables are required.
3. Deploy. Every route prerenders as static HTML; the three.js chunk is only fetched by the village page after it hydrates.
4. Using a custom domain? Set `profile.siteUrl` in `src/content/portfolio.ts` (or the `NEXT_PUBLIC_SITE_URL` environment variable) so canonical URLs, the sitemap and Open Graph tags point at it.

From the command line instead: `npx vercel` (preview) or `npx vercel --prod`.

## Edit the content

Everything visitors read is in **`src/content/portfolio.ts`**: profile and bio, sections, projects, timeline, skills and contact. The village panels, `/plain`, page metadata and the JSON-LD `Person` schema all read from it, so there is nothing else to keep in sync.

- Optional link fields (`github`, `demo` on projects; `email`, `github`, `linkedin`, `cvUrl` on contact; `siteUrl` on the profile) render only when set.
- For the CV, put the file in `public/` (for example `public/cv.pdf`) and set `cvUrl: "/cv.pdf"`.
- Timeline dates take `"YYYY"` or `"YYYY-MM"`.

## Controls

| Input                    | Action                                           |
| ------------------------ | ------------------------------------------------ |
| WASD / arrows            | Walk, relative to the screen (hold Shift to run) |
| E or Enter               | Enter the building you're standing at            |
| Q / R                    | Turn the camera 90° left / right                 |
| + / − or the mouse wheel | Zoom                                             |
| Click / tap              | Walk there; clicking a building walks in         |
| Mini-map squares         | Walk to that building (keyboard-focusable)       |
| D-pad, turn buttons, A   | Touch devices (pinch to zoom)                    |
| Esc                      | Close a panel                                    |

## 3D architecture

```
src/
  app/                    routes: / (village), /plain, /sprites (contact sheet), OG image, icon, robots, sitemap, error, 404
  content/portfolio.ts    all portfolio content
  components/village/     VillageApp, GameCanvas (mounts the 3D world), HUD, settings, D-pad, panels
  game/                   engine-agnostic data shared with the UI
    palette.ts            the 46-colour palette (also feeds Tailwind via CSS variables)
    art/                  pixel art: characters, icons, tiles, painters
    map/                  ASCII village, Tiled builder, navigation grid
    bridge.ts             typed events between the React UI and the world
  game3d/
    VillageWorld.tsx      the <Canvas>: store, runtime, quality manager, UI events, context loss
    config/visuals.ts     every tunable (camera, sun, keyframes, lights, grades, post, tiers)
    config/assets.ts      optional model, sprite, LUT, normal map and audio paths
    config/character.ts   the player: skin, ramps, frame size, animation timings, rim and bounce light
    store.ts              zustand store: settings, tier, camera turn, doorway
    runtime.ts            per-frame mutable state (positions, clock, input) shared by context
    world/layout.ts       heights, colliders, doorway zones and placements from the map
    scene/                World, Terrain, Water, Sky, generated assets
    entities/             procedural buildings, props, billboard characters, glTF swap-in
    entities/Player/      player pixel data, animation state machine, atlas, sheet loader, rim shader
    lighting/             DayNightCycle, sun rig, hemisphere, pooled point lights, cones, shafts
    post/                 composer (Effects), LUT grade, Pixel mode pass
    shaders/              material patches (wind, clouds, wetness), height fog, water
    weather/              rain, splashes, fog banks, fireflies, dust, smoke, sparks
    systems/              input, collision, pathfinding, simulation + camera rig, audio
    settings/             QualityManager and the Auto monitor
    textures/             tileset, tiling surfaces, sprite sheet, noise
scripts/                  export-player-sprites.ts (npm run sprites)
tests/                    Vitest unit tests
```

**One frame:** the simulation (priority −2) reads input, moves the player with circle-vs-grid collision, checks doorways, advances the clock and weather and writes the shared shader uniforms; the camera rig (−1) eases quarter turns, follows the player inside the map bounds, applies zoom and projects the HTML prompt; visual components (0) update lights, water, sprites and particles; the composer (1) renders when post-processing is on. Values that change every frame live in the mutable runtime, so React only re-renders when a setting or the quality tier changes. Nothing allocates per frame.

**Rendering:** a fixed orthographic camera (35° pitch, 45° yaw) looks at a diorama built from the tile grid. The ground uses the autotiled pixel tileset (16 texels per unit, nearest filtering) with baked ambient occlusion; walls, roofs and props use tiling pixel textures at the same density. Characters are camera-facing billboards whose shadow pass turns them toward the sun and uses alpha-tested depth materials, so shadows match the sprite. The sun's shadow frustum is fitted to the visible ground and snapped to shadow-map texels. A fixed pool of point lights is handed to the nearest lamps, windows, monitors and the forge each frame, so shader light counts never change. Height fog replaces three.js's fog chunks; cloud shadows, wind sway and rain wetness are patched into the standard materials.

**Post-processing** (Medium and High): scene → SSAO (High) → bloom (threshold 1.0 on the HDR image, so only emissives glow) and tilt-shift (High) → one pass that applies exposure, ACES tone mapping, a LUT grade blended between the two nearest time-of-day grades, and a vignette → optional film grain and chromatic aberration. **Pixel mode** swaps the scene pass for one that renders at most 720 px tall, outlines depth edges and upscales with nearest sampling; bloom and grading still run at full resolution.

## Quality tiers

Pick Auto, Low, Medium or High in the settings menu (the gear); the choice is remembered. Auto starts at Medium and lets drei's `PerformanceMonitor` step up or down and scale the pixel ratio. Touch devices, reduced motion and low-power hardware default to Low.

| Tier   | What you get                                                                                                                                                                       |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Low    | Pixel ratio 1, blob shadows under characters only, renderer ACES tone mapping and nothing else, simple water, no weather, 4 pooled lights                                          |
| Medium | Pixel ratio ≤ 1.5, 1024 px sun shadows, cloud shadows, bloom, LUT grade and vignette, simple water, light weather (rain, fog banks, fireflies, dust), 8 pooled lights              |
| High   | Pixel ratio ≤ 2, 2048 px sun shadows, SSAO, tilt-shift, planar water reflections, light shafts, volumetric lamp cones, full weather with splashes, 12 lights (one casting shadows) |

Low looks flat and clean (like a well-lit board game); Medium adds the soft sun shadows, glow and colour grading that make it read as HD-2D; High adds depth (tilt-shift), contact darkening (SSAO), mirrored buildings in the ponds and the atmospheric shafts and cones.

## Tune lighting and quality

Everything lives in **`src/game3d/config/visuals.ts`**, grouped and commented:

- `TIME_KEYFRAMES`: per time of day (dawn, day, dusk, night), the sun's elevation, azimuth, colour and intensity, hemisphere colours, sky gradient, fog colour and density, exposure, environment strength, which colour grade applies, bloom, cloud and light-shaft strength and stars. `DAY_CYCLE` sets the day length and when lamps switch on and off.
- `SUN`: shadow bias, normal bias, PCF radius and frustum padding. `CLOUDS`, `FOG`: cloud shadow scale, speed and strength; height fog.
- `LIGHT_STYLES`, `LIGHTS`, `EMISSIVE`: colour, intensity, range and flicker per light kind; pooling and culling; window, lamp and screen glow.
- `GRADES`: the four procedural colour grades (white balance, saturation, contrast, shadow lift and highlight tint).
- `POST`, `PIXEL_MODE`: bloom threshold and strength, vignette, tilt-shift band, SSAO, grain, aberration; Pixel mode's maximum height and outline.
- `WATER`, `WIND`, `WEATHER`, `CUTAWAY`: water colours and reflection, sway, rain and particle counts, roof fade.
- `QUALITY_TIERS`, `QUALITY`: what each tier enables, Auto's bounds and the low-FPS threshold.

## Add glTF models

Set a path in `MODEL_PATHS` (`src/game3d/config/assets.ts`) and put the file in `public/assets/models/`:

```ts
export const MODEL_PATHS = { home: "/assets/models/home.glb", workshop: null /* ... */ };
```

Models load after the first interactive frame and replace that building's procedural version. They are scaled uniformly to fit the building's footprint, centred on it and stood on the ground, so author them with +Y up and the door facing +Z. Meshes whose names contain `roof` or `front` fade out for the doorway cutaway. If a file is missing or fails to load, the procedural building stays and a warning is logged.

## The player sprite

Bryan is a 16×16 sprite with fair skin: a black two-block haircut (a full textured top block with a fringe over the brow, stepping in to short dark sides above the ears), a black hoodie with the hood bunched at the neck, two white drawstrings, a pocket seam and a ribbed hem, charcoal trousers and dark sneakers with a light sole line. Every black area is shaded with a four-tone cool ramp (no pure black), with a lighter outline on the upper-left. At 16 px per world unit (the density of every texture in the world, and the villagers' scale) the frame is one unit square and the character stands one unit, hair to sole. The favicon and the share image draw the same sprite.

- **Pixel data:** `src/game3d/entities/Player/art.ts` holds compact part arrays (heads, torsos, hems, arms, legs, fringe tips) in a small legend that references palette names; frames are composed from them with per-frame offsets. Skin, ramps, frame size, timings and the rim and bounce light are in `src/game3d/config/character.ts`.
- **Frames:** four directions (left is the mirror of right), each with idle (2 frames, breathing), walk (6 frames: stride, arm swing, hem sway and a one-pixel fringe bounce on footfalls) and interact (2 frames: a wave and nod, played on reaching a doorway). Footsteps sound on footfalls.
- **Atlas:** one row per direction (down, left, right, up), one column per frame (idle 0–1, walk 0–5, interact 0–1), with a JSON frame map keyed `<direction>-<animation>/<frame>` (Aseprite's hash format). `npm run sprites` writes `player.png`, `player.json`, `portrait.png` and `palette.gpl` to `public/assets/sprites/player`; the game loads the files named in `PLAYER_SPRITES` (`src/game3d/config/assets.ts`) and draws the atlas from code if they are missing or incomplete. Re-run the export after changing the art or colours, or set both paths to `null` to always draw from code.
- **Review:** open `/sprites` for a contact sheet with every frame at 4× and 8×, the animations playing, the sprite on grass, cobblestone, dark water and night, and the portrait.
- **Lighting:** the billboard keeps casting an alpha-tested shadow that matches the silhouette (it turns toward the sun for the shadow pass). A capped rim light, tinted by the sun or the nearest lamp, keeps the black clothes' edges readable at night, and the nearest lamp, lantern or fire adds a faint warm bounce to the hoodie's underside. Both can be switched off in `config/character.ts`.
- **Portrait:** a 64×64 head-and-shoulders portrait, the sprite's own pixels at 5× (with catchlights and a mouth), appears in the About panel, the HUD corner (on wider screens) and as `portrait.png`.

### Swap in a hand-drawn sheet from Aseprite

1. Open `public/assets/sprites/player/player.png` (or start a 16×16 sprite) and load `palette.gpl` as the palette, so the colours stay on-palette.
2. Make one tag per direction and animation, named `down-idle`, `down-walk`, `down-interact`, `left-idle`, … `up-interact` (2, 6 and 2 frames). Keep the feet on the bottom row of each frame and the body centred.
3. Export with **File → Export Sprite Sheet**: any layout, **JSON Data** as Hash or Array, **Item Filename** `{tag}/{tagframe}`, Tags ticked. From the command line:

   ```bash
   aseprite -b player.aseprite --sheet player.png --data player.json --format json-hash --filename-format "{tag}/{tagframe}" --list-tags --sheet-type rows
   ```

4. Put `player.png` and `player.json` in `public/` and point `PLAYER_SPRITES` at them. If a frame is missing, the console says so and the game keeps the coded sprite.

## Swap sprites, grades and normal maps

- **Villager sprites:** set `SPRITE_SHEET_PATH` to a PNG laid out like the generated sheet (`CHARACTER_SHEET` in `src/game3d/textures/sprites.ts`): 16×16 cells, 6 columns; rows 0–3 the villager facing down, left, right, up (columns 0–3 walk frames, column 4 a blink), rows 4–7 the elder, row 8 the cat (walk, walk, sit, sleep), row 9 a bird (hop, hop, flap, flap). Feet at the bottom of each cell.
- **Colour grades:** set `LUT_PATHS` entries to `.cube` 3D LUTs (from Resolve, Photoshop or any LUT tool). Each replaces its procedural grade.
- **Normal maps:** map surface names (`stone`, `brick`, `roofClay`, ...) to tiling normal maps in `SURFACE_NORMAL_MAPS`, at the same 16 px per unit as the colour textures. They load after the first interactive frame.
- **Palette:** `src/game/palette.ts` holds the 46 colours used by every texture, sprite, light, grade and the UI (as Tailwind classes such as `bg-ink`); the last fourteen are the player's ramps.
- **Map:** `src/game/map/village.ts` is a 40×30 character grid; the legend is in the same file. Buildings, props, spawns, water, the plaza and the forest border all come from it.

## Assets worth adding

1. **Building models** (`.glb`): a stylised medieval or fantasy village pack (KayKit Medieval Hexagon / Medieval Builder, Kenney Castle Kit, Quaternius Medieval Village) for Home, Workshop, Library and Inn, plus a sci-fi or modular lab piece for the AI Lab. Name the roof and front-wall meshes for the cutaway.
2. **Sprites**: a hand-drawn version of the player atlas (Aseprite, workflow above), and the villagers redrawn with the player's ramps and selective outline.
3. **Colour grades**: four `.cube` LUTs (dawn, day, dusk, night) graded on a screenshot of the village.
4. **Normal maps** for stone, brick, roof tiles and planks (Laigter or Materialize can make them from the generated textures).
5. **Sound**: footstep, door, close and UI blip clips, plus optional ambience (birds by day, crickets at night, rain).

## How it behaves

- **Loading:** a pixel progress bar covers downloading the engine, generating textures and compiling shaders ahead of the first frame (drei's loading progress is folded in when files are configured). Models, LUTs, normal maps and weather effects load after the first interactive frame.
- **Fallbacks:** no WebGL sends visitors to `/plain` with an explanation; so does a lost graphics context that doesn't come back. Reduced motion or a low-power device gets a choice between `/plain` and the village. A frame rate under 30 FPS on Low for six seconds offers `/plain`. Missing files fall back to the generated art.
- **Accessibility:** keyboard-only play, visible focus rings, panels that trap focus and close on Esc, aria labels, a live location label, mini-map travel buttons, an HTML prompt that stays readable at night, and `/plain` as the full alternative. Reduced motion turns off camera easing, wind sway, rain and light flicker, and defaults to Low.
- **Preferences:** mute, time of day, weather, quality, Pixel mode, grain and aberration are remembered in `localStorage`.
- **Teardown:** each mount owns its store, runtime, textures, materials and render targets and frees them on unmount; the composer is rebuilt per mount, so React strict mode and route changes never leave a second canvas or a leaked context behind.
