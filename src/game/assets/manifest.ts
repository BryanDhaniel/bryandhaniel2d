import type { SfxSources } from "@/game/systems/audio";

/**
 * Where the game's art and audio come from.
 *
 * Every entry is optional. Leave it undefined and the asset is generated in code from the
 * palette at boot. Drop files in /public/assets and point these paths at them to use real art;
 * nothing else needs to change as long as the files follow the conventions in the README:
 *
 * - tiles:      a 256x144 PNG, 16 columns of 16x16 tiles in the TILESET layout (map/tiled.ts)
 * - atlases:    PNG + JSON (TexturePacker hash/array, or Aseprite's JSON export) using the same
 *               frame names the generators use, e.g. "player/down/0" or "inn/roof"
 * - strips:     trees and grass tufts: frames side by side in one row, same height, plus JSON
 * - normal:     optional normal map for any texture (same size and layout as the image).
 *               Without one, that texture renders unlit (ambient colour only).
 * - map:        a Tiled JSON export with layers "ground", "obstacles" and "objects"
 * - audio:      any format the browser can decode (ogg, mp3, wav)
 *
 * Missing files fall back to the generated art with a console warning. Normal maps are
 * fetched after the first frame so they never delay the start.
 */

export interface ImageSource {
  image: string;
  normal?: string;
}

export interface AtlasSource extends ImageSource {
  atlas: string;
}

export interface AssetSources {
  tiles?: ImageSource;
  characters?: AtlasSource;
  buildings?: AtlasSource;
  props?: AtlasSource;
  trees?: AtlasSource;
  tufts?: AtlasSource;
  map?: string;
  audio: SfxSources;
}

export const ASSET_SOURCES: AssetSources = {
  // tiles: { image: "/assets/tiles.png", normal: "/assets/tiles_n.png" },
  // characters: { image: "/assets/characters.png", atlas: "/assets/characters.json" },
  // buildings: {
  //   image: "/assets/buildings.png",
  //   atlas: "/assets/buildings.json",
  //   normal: "/assets/buildings_n.png",
  // },
  // props: { image: "/assets/props.png", atlas: "/assets/props.json" },
  // trees: { image: "/assets/trees.png", atlas: "/assets/trees.json", normal: "/assets/trees_n.png" },
  // tufts: { image: "/assets/tufts.png", atlas: "/assets/tufts.json" },
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
  trees: "trees",
  tufts: "tufts",
  map: "village",
  /** Generated at runtime, never loaded from files. */
  shadows: "shadows",
  fog: "fog",
  waterMask: "water-mask",
} as const;

export type AtlasGroup = "characters" | "buildings" | "props";
export type StripGroup = "trees" | "tufts";
export type TextureGroup = "tiles" | AtlasGroup | StripGroup;

export const ATLAS_GROUPS: readonly AtlasGroup[] = ["characters", "buildings", "props"];
export const STRIP_GROUPS: readonly StripGroup[] = ["trees", "tufts"];
export const TEXTURE_GROUPS: readonly TextureGroup[] = ["tiles", ...ATLAS_GROUPS, ...STRIP_GROUPS];

/** Where each texture group's optional normal map comes from (undefined = generate). */
export function normalMapUrl(group: TextureGroup): string | undefined {
  return ASSET_SOURCES[group]?.normal;
}
