import type { BuildingId } from "@/game/map/village";
import type { SurfaceName } from "@/game3d/textures/surfaces";
import type { SfxSources } from "@/game3d/systems/audio";
import type { GradeName } from "./visuals";

/**
 * Optional art files. Everything is generated in code by default; set a path (relative to
 * /public) to use a real file instead. A path whose file is missing or fails to load falls
 * back to the generated version with a console warning, so the village never breaks.
 *
 * Heavy files (models, LUTs, normal maps) load after the first interactive frame.
 */

/**
 * glTF / GLB buildings, e.g. "/assets/models/home.glb". Models are scaled to the building's
 * footprint, centred on it and stood on the ground (+Y up, door facing +Z). Meshes whose name
 * contains "roof" or "front" fade out for the doorway cutaway.
 */
export const MODEL_PATHS: Record<BuildingId, string | null> = {
  home: null,
  workshop: null,
  library: null,
  ailab: null,
  inn: null,
  mailbox: null,
};

/**
 * The player's sprite atlas: a PNG plus an Aseprite-style JSON frame map (16x16 frames named
 * `<direction>-<animation>/<frame>`, see entities/Player/atlas.ts). These point at the files
 * `npm run sprites` exports; replace them with a hand-drawn sheet, or set both to null to
 * always draw the player from code. Missing or incomplete files fall back to the code.
 */
export const PLAYER_SPRITES: { image: string | null; atlas: string | null } = {
  image: "/assets/sprites/player/player.png",
  atlas: "/assets/sprites/player/player.json",
};

/**
 * Sheet for the villagers, the cat and birds, e.g. "/assets/sprites/characters.png": 16x16
 * cells laid out like the generated sheet (see CHARACTER_SHEET in textures/sprites.ts).
 */
export const SPRITE_SHEET_PATH: string | null = null;

/** Colour grades as .cube 3D LUTs, e.g. "/assets/luts/dusk.cube". */
export const LUT_PATHS: Record<GradeName, string | null> = {
  dawn: null,
  day: null,
  dusk: null,
  night: null,
};

/** Normal maps for the tiling surface textures (16 px per unit), e.g. "/assets/normals/stone.png". */
export const SURFACE_NORMAL_MAPS: Partial<Record<SurfaceName, string>> = {};

/** Sound effects; any format the browser decodes. Unset effects use the built-in synth. */
export const AUDIO_SOURCES: SfxSources = {
  // step: "/assets/sfx/step.ogg",
  // open: "/assets/sfx/open.ogg",
  // close: "/assets/sfx/close.ogg",
  // blip: "/assets/sfx/blip.ogg",
};
