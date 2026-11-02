import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { PLAYER_MODEL_HEIGHT } from "@/game3d/config/assets";
import type { GlowUniforms } from "./material";

export type ModelClip = "idle" | "walk" | "run";

/** Rim light for the 3D model: the same capped colour as the sprite's, along the silhouette. */
const RIM_CODE = /* glsl */ `
  {
    float rimFacing = 1.0 - max(dot(normalize(normal), normalize(vViewPosition)), 0.0);
    totalEmissiveRadiance += uRimColor * pow(rimFacing, 3.0) * 1.6;
  }
`;

/**
 * The optional glTF player: loaded only when the file exists (a HEAD request first, so a
 * missing file is quiet), scaled to the configured height and stood on its feet, with an
 * animation mixer cross-fading its Idle, Walk and Run clips, real shadows, and the rim light
 * from the sprite's glow uniforms patched into its materials.
 */
export class PlayerModel {
  readonly root = new THREE.Group();
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions: Partial<Record<ModelClip, THREE.AnimationAction>> = {};
  private current: ModelClip | null = null;
  private readonly materials: THREE.Material[] = [];

  private constructor(scene: THREE.Object3D, clips: THREE.AnimationClip[], glow: GlowUniforms) {
    const bounds = new THREE.Box3().setFromObject(scene);
    const height = Math.max(1e-3, bounds.max.y - bounds.min.y);
    scene.scale.setScalar(PLAYER_MODEL_HEIGHT / height);
    scene.position.y = -bounds.min.y * (PLAYER_MODEL_HEIGHT / height);
    scene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = true;
      child.receiveShadow = true;
      const list = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of list) {
        if (!(material instanceof THREE.MeshStandardMaterial)) continue;
        const previous = material.onBeforeCompile;
        material.onBeforeCompile = (shader, renderer) => {
          previous.call(material, shader, renderer);
          shader.uniforms.uRimColor = glow.uRimColor;
          shader.fragmentShader = `uniform vec3 uRimColor;\n${shader.fragmentShader}`.replace(
            "#include <lights_fragment_begin>",
            `${RIM_CODE}\n#include <lights_fragment_begin>`,
          );
        };
        material.needsUpdate = true;
        this.materials.push(material);
      }
    });
    this.root.add(scene);
    this.mixer = new THREE.AnimationMixer(scene);
    for (const clip of clips) {
      const name = clip.name.toLowerCase();
      const key: ModelClip | null = name.includes("run")
        ? "run"
        : name.includes("walk")
          ? "walk"
          : name.includes("idle")
            ? "idle"
            : null;
      if (key && !this.actions[key]) this.actions[key] = this.mixer.clipAction(clip);
    }
  }

  /** Resolves to the model, or null when the file is missing or unreadable. */
  static async load(path: string, glow: GlowUniforms): Promise<PlayerModel | null> {
    try {
      const head = await fetch(path, { method: "HEAD" });
      if (!head.ok) return null;
      const gltf = await new GLTFLoader().loadAsync(path);
      return new PlayerModel(gltf.scene, gltf.animations, glow);
    } catch (error: unknown) {
      console.warn(`Player model "${path}" could not be used; keeping the pixel sprite.`, error);
      return null;
    }
  }

  /** Plays a clip (cross-fading from the last one) and advances the animation. */
  update(delta: number, clip: ModelClip): void {
    if (clip !== this.current) {
      const next = this.actions[clip] ?? this.actions.walk ?? this.actions.idle;
      const previous = this.current ? this.actions[this.current] : undefined;
      if (next && next !== previous) {
        next.reset().fadeIn(0.18).play();
        previous?.fadeOut(0.18);
      }
      this.current = clip;
    }
    this.mixer.update(delta);
  }

  place(x: number, y: number, z: number, heading: number, opacity: number): void {
    this.root.position.set(x, y, z);
    this.root.rotation.y = heading;
    for (const material of this.materials) {
      const transparent = opacity < 0.999;
      if (material.transparent !== transparent) {
        material.transparent = transparent;
        material.needsUpdate = true;
      }
      material.opacity = opacity;
    }
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.root.traverse((child) => {
      if (child instanceof THREE.Mesh) child.geometry.dispose();
    });
    for (const material of this.materials) material.dispose();
  }
}
