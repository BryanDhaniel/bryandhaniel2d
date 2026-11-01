import { createContext, useContext } from "react";
import type * as THREE from "three";
import type { IconName } from "@/game/art/icons";
import { createSignTextures } from "@/game3d/entities/buildingModels";
import { MaterialLibrary } from "@/game3d/shaders/materials";
import type { WorldUniforms } from "@/game3d/shaders/patch";
import { createNoiseTexture } from "@/game3d/textures/noise";
import { createCharacterSheet } from "@/game3d/textures/sprites";
import { createSurfaceTextures, type SurfaceTextures } from "@/game3d/textures/surfaces";
import { createTilesetTexture } from "@/game3d/textures/tileset";

/**
 * Generated textures and the shared material library for one world. Created once when the
 * world mounts and disposed when it unmounts (strict-mode safe: each mount owns its copy).
 */
export interface WorldAssets {
  surfaces: SurfaceTextures;
  tileset: THREE.CanvasTexture;
  /** Character sprite sheet; replaced in place if a sheet file is configured. */
  sheet: THREE.Texture;
  noise: THREE.DataTexture;
  signs: Record<IconName, THREE.CanvasTexture>;
  materials: MaterialLibrary;
}

export function createAssets(uniforms: WorldUniforms): WorldAssets {
  const surfaces = createSurfaceTextures();
  const noise = createNoiseTexture();
  uniforms.uCloudMap.value = noise;
  return {
    surfaces,
    tileset: createTilesetTexture(),
    sheet: createCharacterSheet(),
    noise,
    signs: createSignTextures(),
    materials: new MaterialLibrary(surfaces, uniforms),
  };
}

export function disposeAssets(assets: WorldAssets): void {
  Object.values(assets.surfaces).forEach((texture) => texture.dispose());
  Object.values(assets.signs).forEach((texture) => texture.dispose());
  assets.tileset.dispose();
  assets.sheet.dispose();
  assets.noise.dispose();
  assets.materials.dispose();
}

export const AssetsContext = createContext<WorldAssets | null>(null);

export function useAssets(): WorldAssets {
  const assets = useContext(AssetsContext);
  if (!assets) {
    throw new Error("useAssets must be used inside the village world.");
  }
  return assets;
}
