import type { SfxSources } from "@/game/systems/audio";

/**
 * Where the game's art and audio come from.
 *
 * Every entry is optional. Leave it undefined and the asset is generated in code from the
 * palette at boot. Point it at files in /public to use real art instead; nothing else needs
 * to change as long as the files follow the conventions documented in the README:
 *
 * - tiles:      a 256x112 PNG, 16 columns of 16x16 tiles in the TILESET layout (map/tiled.ts)
 * - atlases:    PNG + JSON (TexturePacker hash/array or Aseprite JSON) with the same frame names
 *               the generators use, e.g. "player/down/0" or "workshop-lights"
 * - map:        a Tiled JSON export with layers "ground", "obstacles" and "objects"
 * - audio:      any format the browser can decode (ogg, mp3, wav)
 *
 * If a file fails to load, the generated version is used and a warning is logged.
 */

export interface AtlasSource {
  image: string;
  atlas: string;
}

export interface AssetSources {
  tiles?: string;
  characters?: AtlasSource;
  buildings?: AtlasSource;
  props?: AtlasSource;
  map?: string;
  audio: SfxSources;
}

export const ASSET_SOURCES: AssetSources = {
  // tiles: "/assets/tiles.png",
  // characters: { image: "/assets/characters.png", atlas: "/assets/characters.json" },
  // buildings: { image: "/assets/buildings.png", atlas: "/assets/buildings.json" },
  // props: { image: "/assets/props.png", atlas: "/assets/props.json" },
  // map: "/assets/village.json",
  audio: {
    // step: "/assets/sfx/step.ogg",
    // open: "/assets/sfx/open.ogg",
    // close: "/assets/sfx/close.ogg",
    // blip: "/assets/sfx/blip.ogg",
  },
};

/** Texture and cache keys. */
export const KEYS = {
  tiles: "tiles",
  characters: "characters",
  buildings: "buildings",
  props: "props",
  map: "village",
} as const;

export type AtlasGroup = "characters" | "buildings" | "props";

export const ATLAS_GROUPS: readonly AtlasGroup[] = ["characters", "buildings", "props"];
