# Kiznaiver's Village

A pixel-art village portfolio for **Bryan Dhaniel (Kiznaiver)**, Software Engineer and AI/ML Engineer in Bandung, Indonesia. Walk around a small town; each building opens a section of the portfolio. A fast, accessible plain version lives at `/plain`.

- **Next.js 16** (App Router, Cache Components) + TypeScript (strict) + Tailwind CSS 4
- **Phaser 3** for the game, loaded client-side only with `next/dynamic` (`ssr: false`)
- **Framer Motion** for the HTML panels
- All art and sound are generated in code from one 24-colour palette. No binary assets are required.

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

| Script           | What it does                                                      |
| ---------------- | ----------------------------------------------------------------- |
| `npm run dev`    | Development server                                                |
| `npm run build`  | Production build (all routes prerender as static)                 |
| `npm start`      | Serve the production build                                        |
| `npm run check`  | Type-check, lint, Prettier check and unit tests in one go         |
| `npm run lint`   | ESLint (Next.js + TypeScript rules + Prettier compat)             |
| `npm run format` | Prettier (with Tailwind class sorting)                            |
| `npm test`       | Vitest: palette, art data, map reachability, pathfinding, content |

## Deploy to Vercel

1. Push the repository to GitHub.
2. In Vercel, **Add New → Project**, import the repository and keep the detected Next.js settings (build `next build`, install `npm install`).
3. Deploy. Canonical URLs, the sitemap and Open Graph tags use the Vercel production URL automatically.
4. Using a custom domain? Set `profile.siteUrl` in `src/content/portfolio.ts` (or the `NEXT_PUBLIC_SITE_URL` environment variable) so metadata points at it.

From the command line instead: `npx vercel` (preview) or `npx vercel --prod`.

## Edit the content

Everything visitors read is in **`src/content/portfolio.ts`**: profile and bio, sections, projects, timeline, skills and contact. The village panels, `/plain`, page metadata and the JSON-LD `Person` schema all read from it, so there is nothing else to keep in sync.

- Optional link fields (`github`, `demo` on projects; `email`, `github`, `linkedin`, `cvUrl` on contact; `siteUrl` on the profile) render only when set.
- For the CV, put the file in `public/` (for example `public/cv.pdf`) and set `cvUrl: "/cv.pdf"`. A download button appears in the Contact panel, on `/plain` and in the `/plain` header.
- Timeline dates take `"YYYY"` or `"YYYY-MM"`.
- `npm test` checks that links are well formed and every building maps to a real section.

## Controls

| Input            | Action                                     |
| ---------------- | ------------------------------------------ |
| WASD / arrows    | Walk (hold Shift to run)                   |
| E or Enter       | Enter the building you're standing at      |
| Click / tap      | Walk there; tapping a building walks in    |
| Mini-map squares | Walk to that building (keyboard-focusable) |
| D-pad + A        | Touch devices                              |
| Esc              | Close a panel                              |

## Project layout

```
src/
  app/                  routes: / (village), /plain, OG image, icon, robots, sitemap, error, 404
  content/portfolio.ts  all portfolio content
  components/
    sections/           section bodies shared by panels and /plain (server-safe)
    village/            VillageApp, GameCanvas (Phaser mount), HUD, mini-map, D-pad, panels, loader
  game/
    palette.ts          the 24-colour palette (also feeds Tailwind via CSS variables)
    art/                pixel data + painters for characters, tiles, buildings, props, icons
    assets/             asset manifest (swap-in paths), texture generation, animations
    map/                ASCII village, Tiled JSON builder, navigation grid
    scenes/             Boot, Preload, World
    entities/           Player, Npc, Building
    systems/            input, interaction, audio, day/night, pathfinding, camera, viewport
    bridge.ts           typed events between React and Phaser
    createGame.ts       Phaser bootstrap and teardown
  lib/                  site metadata, storage, capability detection, hooks
tests/                  Vitest unit tests
```

## Change the look

### Palette

`src/game/palette.ts` defines all 24 colours. Sprites reference them by one-letter keys, and the root layout injects them as CSS variables (`--c-ink`, `--c-gold`, ...) that Tailwind exposes as `bg-ink`, `text-gold` and so on. Tailwind's default colours are disabled, so the UI can't drift off-palette. Change a hex value and it updates the art and the UI together.

### Map

`src/game/map/village.ts` holds the village as a 40x30 grid of characters. The legend is in the same file (`.` grass, `#` path, `~` water, `T` forest, `f` fence, `t` tree, `l` lamp, `H W L A I` buildings, `m` mailbox, `F` fountain, `P` player spawn, `v k c` NPCs). Building letters must form rectangles; the bottom-centre tile is the door. `buildTiledMap()` converts it to Tiled-format JSON with `ground`, `obstacles` and `objects` layers, and autotiles paths, water, fences and forest edges.

### Swap in real pixel art (Aseprite, Kenney, ...)

Edit `ASSET_SOURCES` in `src/game/assets/manifest.ts` to point at files in `public/`. Each entry is independent, and anything left unset (or that fails to load, or that is missing frames) falls back to the generated art with a console warning.

```ts
export const ASSET_SOURCES: AssetSources = {
  tiles: "/assets/tiles.png",
  characters: { image: "/assets/characters.png", atlas: "/assets/characters.json" },
  buildings: { image: "/assets/buildings.png", atlas: "/assets/buildings.json" },
  props: { image: "/assets/props.png", atlas: "/assets/props.json" },
  map: "/assets/village.json",
  audio: { step: "/assets/sfx/step.ogg", open: "/assets/sfx/open.ogg" },
};
```

**Tileset** (`tiles`): a 256x112 PNG, 16 columns of 16x16 tiles. Autotile masks add N=1, E=2, S=4, W=8 when the neighbour is the same kind.

| Tile indices | Contents                                                    |
| ------------ | ----------------------------------------------------------- |
| 0-3          | Grass variants                                              |
| 4-7          | Grass with flowers                                          |
| 8, 9         | Bush, rock                                                  |
| 16-31        | Path autotile (16 + mask)                                   |
| 32-79        | Water autotile, 3 animation frames (32 + frame x 16 + mask) |
| 80-95        | Fence autotile (80 + mask)                                  |
| 96-111       | Forest autotile (96 + mask)                                 |

Kenney or other packs with a different layout need to be rearranged into this grid (or adjust `TILESET` in `src/game/map/tiled.ts`).

**Atlases** (`characters`, `buildings`, `props`): PNG + JSON in TexturePacker hash/array format, which Aseprite can export (_File → Export Sprite Sheet_, JSON Hash, with a filename format such as `{tag}/{frame}`). Frames must use these names:

| Atlas      | Frame names                                                                                                                                                                         |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| characters | `player/<facing>/<0-3>` and `player/<facing>/blink` for facing `down`, `left`, `right`, `up`; the same for `villager` and `elder`; `cat/walk0`, `cat/walk1`, `cat/sit`, `cat/sleep` |
| buildings  | `home`, `workshop`, `library`, `ailab`, `inn`, each with a `<name>-lights` night overlay (only the glowing pixels)                                                                  |
| props      | `tree/0-2` (sway), `fountain/0-2`, `lamp`, `glow`, `mailbox`, `dust/0-2`, `marker/0-1`, `shadow`, `heart`, `zzz`, `firefly`                                                         |

Characters are 16x16 with the feet at the bottom centre. Buildings are drawn bottom-aligned to their map footprint (80 px wide; any extra height rises above it).

**Map** (`map`): a Tiled JSON export using the tileset above, tile layers `ground` and `obstacles`, and an object layer `objects` with objects of type (or class) `building` (name = building id, properties `section`, `label`, `doorX`, `doorY`), `fountain`, `tree`, `lamp`, `spawn` (name `player`, `villager`, `elder` or `cat`) and `area` (name shown in the HUD).

**Audio**: any browser-decodable file per effect (`step`, `open`, `close`, `blip`). Files are fetched only after the visitor's first interaction.

## How it behaves

- **Loading:** an HTML pixel progress bar covers downloading the engine and generating art. Art is painted into a few canvas atlases at boot, so first load is mostly the ~330 KB gzipped Phaser chunk. Audio is synthesised lazily on the first click or key press.
- **Crisp at any size:** the canvas is sized in device pixels and the camera uses an integer zoom, so every texel is a whole number of screen pixels. Wide or very tall screens are letterboxed. The camera lerps smoothly while sprites stay snapped to the pixel grid.
- **Fallbacks:** no WebGL sends visitors to `/plain` with an explanation. `prefers-reduced-motion` or a low-power device (software renderer, 2 cores or fewer, 2 GB or less memory, Save-Data) gets a choice between `/plain` and the village. A sustained frame rate under 24 FPS offers `/plain`. Asset failures fall back to generated art. Startup errors show a notice with a retry.
- **Accessibility:** keyboard-only play, visible focus rings, dialogs that trap focus, close on Esc and return focus to the game, live location label, mini-map travel buttons, and `/plain` as the full alternative (server-rendered, skip link, landmarks).
- **SEO:** metadata, Open Graph image, Twitter card, JSON-LD `Person` on both pages, sitemap and robots. `/plain` is fully server-rendered.
- **Preferences:** mute (off by default) and day/night are remembered in `localStorage`.
- **Teardown:** each mount creates one Phaser game and destroys it (and frees its WebGL context) on unmount, so React strict mode and route changes never leave two running.
