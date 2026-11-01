import type * as THREE from "three";
import { TILESET_HEIGHT, TILESET_WIDTH, paintTileset } from "@/game/art/tiles";
import { FIRST_GID, TILESET } from "@/game/map/tiled";
import { pixelCanvas, pixelTexture } from "./canvas";

/**
 * The ground tileset (grass variants, flower beds and the autotiled dirt paths and cobbles
 * whose edges blend into the grass), painted by the same code as the 2D tiles and sampled by
 * the terrain mesh with nearest filtering.
 */
export function createTilesetTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = pixelCanvas(TILESET_WIDTH, TILESET_HEIGHT);
  paintTileset(ctx);
  return pixelTexture(canvas);
}

/** UV rectangle [u0, v0, u1, v1] of a Tiled GID in the tileset (v up, as three.js expects). */
export function tileUv(gid: number, out: Float32Array | number[]): void {
  const index = Math.max(0, gid - FIRST_GID);
  const col = index % TILESET.columns;
  const row = Math.floor(index / TILESET.columns);
  const inset = 0.001;
  const u0 = (col * 16 + inset) / TILESET_WIDTH;
  const u1 = ((col + 1) * 16 - inset) / TILESET_WIDTH;
  const v1 = 1 - (row * 16 + inset) / TILESET_HEIGHT;
  const v0 = 1 - ((row + 1) * 16 - inset) / TILESET_HEIGHT;
  out[0] = u0;
  out[1] = v0;
  out[2] = u1;
  out[3] = v1;
}
