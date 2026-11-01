import type * as THREE from "three";
import {
  CAT_FRAMES,
  CHARACTER_LOOKS,
  WALK_FRAMES,
  characterFrame,
  type CharacterId,
  type Facing,
} from "@/game/art/characters";
import { artSize, drawArt, type PixelArt } from "@/game/art/pixels";
import { pixelCanvas, pixelTexture } from "./canvas";

/**
 * Layout of the character sprite sheet: 16x16 cells, one row per facing for each person
 * (columns: four walk frames, then a blink frame), then a row for the cat and one for birds.
 * A hand-made sheet with this layout can replace the generated one (SPRITE_SHEET_PATH).
 */
export const CHARACTER_SHEET = {
  cell: 16,
  columns: 6,
  rows: 14,
  /** First row of each person; add the facing index (down, left, right, up). */
  people: { player: 0, villager: 4, elder: 8 } satisfies Record<CharacterId, number>,
  facings: ["down", "left", "right", "up"] as const satisfies readonly Facing[],
  blinkColumn: 4,
  cat: { row: 12, walk: [0, 1], sit: 2, sleep: 3 },
  bird: { row: 13, hop: [0, 1], fly: [2, 3] },
} as const;

/** A sparrow facing right: two hopping frames and two flapping frames. */
const BIRD: Record<"hopA" | "hopB" | "flyA" | "flyB", PixelArt> = {
  hopA: [
    "....kkk...",
    "...kokYk..",
    "..kooookY.",
    "kkkoddok..",
    "kooodddk..",
    ".kkoddk...",
    "...kkk....",
    "...k.k....",
  ],
  hopB: [
    "..........",
    "....kkk...",
    "...kokYk..",
    "..kooookY.",
    "kkkoddok..",
    "kooodddk..",
    ".kkkkkk...",
    "..k...k...",
  ],
  flyA: [
    "k.....k...",
    "kk...kk...",
    ".kokkok...",
    "..kookokY.",
    "..koddok..",
    "...kkkk...",
    "..........",
    "..........",
  ],
  flyB: [
    "..........",
    "..........",
    "..kkkkk...",
    ".kookookY.",
    "kooodddok.",
    "kk.kkkk.kk",
    "..........",
    "..........",
  ],
};

function drawCell(
  ctx: CanvasRenderingContext2D,
  art: PixelArt,
  col: number,
  row: number,
  options: Parameters<typeof drawArt>[4] = {},
): void {
  const { cell } = CHARACTER_SHEET;
  const { width, height } = artSize(art);
  const x = col * cell + Math.floor((cell - width) / 2);
  const y = row * cell + cell - height;
  drawArt(ctx, art, x, y, options);
}

export function paintCharacterSheet(ctx: CanvasRenderingContext2D): void {
  const sheet = CHARACTER_SHEET;
  (Object.keys(sheet.people) as CharacterId[]).forEach((id) => {
    const look = CHARACTER_LOOKS[id];
    sheet.facings.forEach((facing, facingIndex) => {
      const row = sheet.people[id] + facingIndex;
      // Left-facing frames are the right-facing art mirrored.
      const art = facing === "left" ? "right" : facing;
      const flipX = facing === "left";
      for (let frame = 0; frame < WALK_FRAMES; frame += 1) {
        drawCell(ctx, characterFrame(look, art, frame), frame, row, { roles: look.roles, flipX });
      }
      drawCell(ctx, characterFrame(look, art, 0, true), sheet.blinkColumn, row, {
        roles: look.roles,
        flipX,
      });
    });
  });
  drawCell(ctx, CAT_FRAMES.walk0, 0, sheet.cat.row);
  drawCell(ctx, CAT_FRAMES.walk1, 1, sheet.cat.row);
  drawCell(ctx, CAT_FRAMES.sit, 2, sheet.cat.row);
  drawCell(ctx, CAT_FRAMES.sleep, 3, sheet.cat.row);
  drawCell(ctx, BIRD.hopA, 0, sheet.bird.row);
  drawCell(ctx, BIRD.hopB, 1, sheet.bird.row);
  drawCell(ctx, BIRD.flyA, 2, sheet.bird.row);
  drawCell(ctx, BIRD.flyB, 3, sheet.bird.row);
}

export function createCharacterSheet(): THREE.CanvasTexture {
  const { cell, columns, rows } = CHARACTER_SHEET;
  const { canvas, ctx } = pixelCanvas(columns * cell, rows * cell);
  paintCharacterSheet(ctx);
  return pixelTexture(canvas);
}
