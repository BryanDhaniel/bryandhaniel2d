import * as THREE from "three";
import type { PaletteName } from "@/game/palette";
import { EMISSIVE } from "@/game3d/config/visuals";
import { linearRgb } from "@/game3d/lighting/DayNightCycle";
import type { SurfaceName, SurfaceTextures } from "@/game3d/textures/surfaces";
import { patchMaterial, type WindKind, type WorldUniforms } from "./patch";

const FOLIAGE: Partial<Record<SurfaceName, WindKind>> = {
  leaves: "foliage",
  needles: "foliage",
  birchLeaves: "foliage",
  bush: "grass",
  clothRed: "banner",
  clothViolet: "banner",
};

const ROUGHNESS: Partial<Record<SurfaceName, number>> = {
  metal: 0.45,
  roofMetal: 0.4,
  iron: 0.5,
  roofSlate: 0.7,
};

const METALNESS: Partial<Record<SurfaceName, number>> = {
  metal: 0.35,
  roofMetal: 0.45,
  iron: 0.5,
};

export type EmissiveName = "windowWarm" | "windowCool" | "lamp" | "screen" | "forge";

const EMISSIVE_NAMES: readonly EmissiveName[] = [
  "windowWarm",
  "windowCool",
  "lamp",
  "screen",
  "forge",
];

function glowLevel(name: EmissiveName, lightsOn: number, flicker: number): number {
  switch (name) {
    case "windowWarm":
    case "windowCool":
      return EMISSIVE.emissiveDay + (EMISSIVE.window - EMISSIVE.emissiveDay) * lightsOn;
    case "lamp":
      return EMISSIVE.emissiveDay + (EMISSIVE.lamp - EMISSIVE.emissiveDay) * lightsOn;
    case "screen":
      return (1.4 + (EMISSIVE.monitor - 1.4) * lightsOn) * (1 - 0.08 * flicker);
    case "forge":
      return EMISSIVE.forge * (0.8 + 0.2 * flicker);
  }
}

export function paletteColor(name: PaletteName, scale = 1): THREE.Color {
  const [r, g, b] = linearRgb(name, scale);
  return new THREE.Color(r, g, b);
}

/**
 * Every material of the village, created once per world and shared by all meshes that use it
 * (cutaway parts get per-building clones). Lit surfaces are MeshStandardMaterial with the
 * village patches; glowing surfaces keep their day level and brighten as the lamps come on.
 */
export class MaterialLibrary {
  private readonly surfaces = new Map<string, THREE.MeshStandardMaterial>();
  private readonly emissives: Record<EmissiveName, THREE.MeshStandardMaterial>;
  private readonly extra: THREE.Material[] = [];
  /** Cloned glass and lamp materials (cutaway copies) that follow the night level too. */
  private readonly glowing: { material: THREE.MeshStandardMaterial; name: EmissiveName }[] = [];
  private readonly clones = new Map<THREE.Material, THREE.MeshStandardMaterial[]>();
  readonly led: THREE.MeshBasicMaterial;

  constructor(
    readonly textures: SurfaceTextures,
    readonly uniforms: WorldUniforms,
  ) {
    const glow = (
      map: SurfaceName,
      color: PaletteName,
      emissive: PaletteName,
    ): THREE.MeshStandardMaterial =>
      patchMaterial(
        new THREE.MeshStandardMaterial({
          map: textures[map],
          emissiveMap: textures[map],
          color: paletteColor(color),
          emissive: paletteColor(emissive),
          roughness: 0.3,
          metalness: 0,
        }),
        uniforms,
        { clouds: true },
      );
    this.emissives = {
      windowWarm: glow("glassWarm", "slate", "cloud"),
      windowCool: glow("glassCool", "stone", "cloud"),
      lamp: glow("glassWarm", "wheat", "gold"),
      screen: glow("screen", "night", "cloud"),
      forge: glow("iron", "ember", "ember"),
    };
    this.led = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1), toneMapped: true });
    this.led.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uniforms.uTime;
      shader.vertexShader =
        `uniform float uTime;\nvarying float vBlink;\n${shader.vertexShader}`.replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\n  float blinkSeed = float(gl_InstanceID) * 1.618;\n  vBlink = step(0.35, fract(sin(floor(uTime * (1.5 + fract(blinkSeed) * 3.0) + blinkSeed) * 43758.5) * 0.5 + 0.5));",
        );
      shader.fragmentShader = `varying float vBlink;\n${shader.fragmentShader}`.replace(
        "#include <color_fragment>",
        `#include <color_fragment>\n  diffuseColor.rgb *= mix(0.25, ${EMISSIVE.led.toFixed(1)}, vBlink);`,
      );
    };
    this.led.customProgramCacheKey = () => "village-led";
  }

  /** The shared lit material for a surface texture. */
  surface(name: SurfaceName, tint?: PaletteName): THREE.MeshStandardMaterial {
    const key = tint ? `${name}:${tint}` : name;
    let material = this.surfaces.get(key);
    if (!material) {
      material = patchMaterial(
        new THREE.MeshStandardMaterial({
          map: this.textures[name],
          color: tint ? paletteColor(tint) : new THREE.Color(1, 1, 1),
          roughness: ROUGHNESS[name] ?? 0.92,
          metalness: METALNESS[name] ?? 0,
          side: FOLIAGE[name] === "banner" ? THREE.DoubleSide : THREE.FrontSide,
        }),
        this.uniforms,
        { clouds: true, wet: true, wind: FOLIAGE[name] },
      );
      material.name = key;
      this.surfaces.set(key, material);
    }
    return material;
  }

  emissive(name: EmissiveName): THREE.MeshStandardMaterial {
    return this.emissives[name];
  }

  /** A per-building copy (for fading) that still follows the shared glow and patches. */
  cloneFor(material: THREE.Material): THREE.MeshStandardMaterial {
    if (!(material instanceof THREE.MeshStandardMaterial)) {
      throw new Error("Only standard materials can be cloned for the cutaway.");
    }
    const copy = material.clone();
    copy.onBeforeCompile = material.onBeforeCompile;
    copy.customProgramCacheKey = material.customProgramCacheKey;
    this.extra.push(copy);
    const clones = this.clones.get(material) ?? [];
    clones.push(copy);
    this.clones.set(material, clones);
    const glowing = (Object.keys(this.emissives) as EmissiveName[]).find(
      (name) => this.emissives[name] === material,
    );
    if (glowing) {
      this.glowing.push({ material: copy, name: glowing });
    }
    return copy;
  }

  /** Registers an extra material so `dispose()` frees it. */
  track<T extends THREE.Material>(material: T): T {
    this.extra.push(material);
    return material;
  }

  /** Adds a normal map to a surface material and every cutaway copy of it. */
  applyNormalMap(name: SurfaceName, texture: THREE.Texture): void {
    const material = this.surface(name);
    for (const target of [material, ...(this.clones.get(material) ?? [])]) {
      target.normalMap = texture;
      target.needsUpdate = true;
    }
  }

  /** Sets the glow of windows, lamps and screens for the current night level. */
  setNight(lightsOn: number, flicker: number): void {
    for (const name of EMISSIVE_NAMES) {
      this.emissives[name].emissiveIntensity = glowLevel(name, lightsOn, flicker);
    }
    for (const entry of this.glowing) {
      entry.material.emissiveIntensity = glowLevel(entry.name, lightsOn, flicker);
    }
  }

  /**
   * Frees GPU resources. The registries are kept: three.js re-uploads a disposed material on
   * its next use, so a strict-mode remount can keep using this library.
   */
  dispose(): void {
    this.surfaces.forEach((material) => material.dispose());
    Object.values(this.emissives).forEach((material) => material.dispose());
    this.extra.forEach((material) => material.dispose());
    this.led.dispose();
  }
}
