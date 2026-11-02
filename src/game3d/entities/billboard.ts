import * as THREE from "three";
import { SPRITES } from "@/game3d/config/visuals";
import { patchMaterial, type WorldUniforms } from "@/game3d/shaders/patch";
import { pixelCanvas, pixelTexture } from "@/game3d/textures/canvas";
import { CHARACTER_SHEET } from "@/game3d/textures/sprites";
import type { AtlasRect } from "./Player/atlas";

const BLOB = new THREE.PlaneGeometry(0.7, 0.36).rotateX(-Math.PI / 2);

let blobTexture: THREE.CanvasTexture | null = null;

function blobMap(): THREE.CanvasTexture {
  if (!blobTexture) {
    const { canvas, ctx } = pixelCanvas(14, 8);
    ctx.fillStyle = "#16141f";
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 14; x += 1) {
        const dx = (x + 0.5 - 7) / 7;
        const dy = (y + 0.5 - 4) / 4;
        if (dx * dx + dy * dy <= 1) ctx.fillRect(x, y, 1, 1);
      }
    }
    blobTexture = pixelTexture(canvas);
  }
  return blobTexture;
}

export interface BillboardOptions {
  /** World size of the quad (the sprite cell at 16 px per unit). */
  width?: number;
  height?: number;
  /** Cell grid for `setFrame` (defaults to the shared NPC sheet). */
  grid?: { columns: number; rows: number };
  /** Extra material patches applied after the village ones (the player's rim light). */
  extend?: (material: THREE.MeshStandardMaterial) => void;
}

/**
 * A camera-facing pixel sprite in the 3D scene. It stands upright and turns with the camera
 * (Y-axis billboard) so it never leans. For shadow maps it briefly turns to face the sun and
 * renders through depth materials that share its texture and alpha cut-off, so the shadow is
 * the sprite's exact silhouette whatever the camera angle.
 */
export class Billboard {
  readonly mesh: THREE.Mesh;
  readonly blob: THREE.Mesh;
  private readonly geometry: THREE.PlaneGeometry;
  private texture: THREE.Texture;
  private readonly material: THREE.MeshStandardMaterial;
  private readonly depth: THREE.MeshDepthMaterial;
  private readonly distance: THREE.MeshDistanceMaterial;
  private readonly blobMaterial: THREE.MeshBasicMaterial;
  private readonly grid: { columns: number; rows: number };
  private yaw = 0;
  private sourceVersion: number;
  /** Direction toward the sun around Y, applied while shadows render. */
  sunYaw = 0;

  constructor(sheet: THREE.Texture, uniforms: WorldUniforms, options: BillboardOptions = {}) {
    const width = options.width ?? 1;
    const height = options.height ?? 1;
    this.grid = options.grid ?? { columns: CHARACTER_SHEET.columns, rows: CHARACTER_SHEET.rows };
    this.geometry = new THREE.PlaneGeometry(width, height).translate(0, height / 2, 0);
    this.texture = sheet.clone();
    this.texture.repeat.set(1 / this.grid.columns, 1 / this.grid.rows);
    this.sourceVersion = this.texture.source.version;
    this.material = patchMaterial(
      new THREE.MeshStandardMaterial({
        map: this.texture,
        alphaTest: SPRITES.alphaTest,
        side: THREE.DoubleSide,
        roughness: 1,
        metalness: 0,
      }),
      uniforms,
      { billboard: true, clouds: true },
    );
    options.extend?.(this.material);
    this.depth = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
      map: this.texture,
      alphaTest: SPRITES.alphaTest,
    });
    this.distance = new THREE.MeshDistanceMaterial({
      map: this.texture,
      alphaTest: SPRITES.alphaTest,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.castShadow = true;
    this.mesh.customDepthMaterial = this.depth;
    this.mesh.customDistanceMaterial = this.distance;
    this.mesh.onBeforeShadow = (_renderer, object, _camera, shadowCamera) => {
      if (!(shadowCamera instanceof THREE.OrthographicCamera)) return;
      object.rotation.y = this.sunYaw;
      object.updateMatrixWorld();
      object.modelViewMatrix.multiplyMatrices(shadowCamera.matrixWorldInverse, object.matrixWorld);
    };
    this.mesh.onAfterShadow = (_renderer, object, _camera, shadowCamera) => {
      if (!(shadowCamera instanceof THREE.OrthographicCamera)) return;
      object.rotation.y = this.yaw;
      object.updateMatrixWorld();
    };
    this.blobMaterial = new THREE.MeshBasicMaterial({
      map: blobMap(),
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    this.blob = new THREE.Mesh(BLOB, this.blobMaterial);
    this.blob.scale.setScalar(Math.max(width, 0.6));
    this.blob.renderOrder = 1;
  }

  /** Shows a grid cell; `flip` mirrors it horizontally. */
  setFrame(row: number, column: number, flip = false): void {
    const { columns, rows } = this.grid;
    this.texture.repeat.set((flip ? -1 : 1) / columns, 1 / rows);
    this.texture.offset.set((column + (flip ? 1 : 0)) / columns, 1 - (row + 1) / rows);
  }

  /** Switches to another sheet texture (a sprite file replacing the generated one). */
  setSheet(sheet: THREE.Texture): void {
    const next = sheet.clone();
    next.repeat.copy(this.texture.repeat);
    next.offset.copy(this.texture.offset);
    this.material.map = next;
    this.depth.map = next;
    this.distance.map = next;
    this.texture.dispose();
    this.texture = next;
    this.sourceVersion = next.source.version;
  }

  /** Shows a rectangle (in pixels, top-left origin) of a sheet of the given size. */
  setRect(rect: AtlasRect, sheetWidth: number, sheetHeight: number): void {
    this.texture.repeat.set(rect.w / sheetWidth, rect.h / sheetHeight);
    this.texture.offset.set(rect.x / sheetWidth, 1 - (rect.y + rect.h) / sheetHeight);
  }

  place(x: number, y: number, z: number, yaw: number): void {
    // The sheet's image was replaced (a sprite file loaded): this copy re-uploads it too.
    if (this.texture.source.version !== this.sourceVersion) {
      this.texture.needsUpdate = true;
      this.sourceVersion = this.texture.source.version;
    }
    this.yaw = yaw;
    this.mesh.position.set(x, y, z);
    this.mesh.rotation.y = yaw;
    this.blob.position.set(x, y + 0.015, z);
  }

  setShadowMode(real: boolean): void {
    this.mesh.castShadow = real;
    this.blob.visible = !real;
  }

  dispose(): void {
    this.geometry.dispose();
    this.texture.dispose();
    this.material.dispose();
    this.depth.dispose();
    this.distance.dispose();
    this.blobMaterial.dispose();
  }
}
