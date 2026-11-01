import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CAT_FRAMES,
  CHARACTER_LOOKS,
  FACINGS,
  WALK_FRAMES,
  characterFrame,
} from "@/game/art/characters";
import { HEART, ICONS } from "@/game/art/icons";
import { artSize, validateArt } from "@/game/art/pixels";
import { CHARACTER_SHEET } from "@/game3d/textures/sprites";
import { SURFACE_NAMES } from "@/game3d/textures/surfaces";
import { tileUv } from "@/game3d/textures/tileset";
import { PALETTE, PALETTE_NAMES, PIXEL_KEYS } from "@/game/palette";

describe("palette", () => {
  it("has exactly 32 unique colours", () => {
    expect(PALETTE_NAMES).toHaveLength(32);
    expect(new Set(Object.values(PALETTE)).size).toBe(32);
  });

  it("gives every colour exactly one pixel key", () => {
    const mapped = Object.values(PIXEL_KEYS);
    expect(mapped).toHaveLength(32);
    expect(new Set(mapped)).toEqual(new Set(PALETTE_NAMES));
  });

  it("exposes every colour to Tailwind in globals.css", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    for (const name of PALETTE_NAMES) {
      expect(css).toContain(`--color-${name}: var(--c-${name});`);
    }
    // Tailwind's default palette is disabled so only palette colours exist.
    expect(css).toContain("--color-*: initial;");
  });
});

describe("pixel art", () => {
  it("character frames are 16x16 and only use palette keys or mapped roles", () => {
    for (const [id, look] of Object.entries(CHARACTER_LOOKS)) {
      for (const facing of FACINGS) {
        for (let frame = 0; frame < WALK_FRAMES; frame += 1) {
          const art = characterFrame(look, facing, frame);
          expect(artSize(art), `${id} ${facing} ${frame}`).toEqual({ width: 16, height: 16 });
          validateArt(`${id}/${facing}/${frame}`, art, look.roles);
        }
        validateArt(`${id}/${facing}/blink`, characterFrame(look, facing, 0, true), look.roles);
      }
    }
  });

  it("cat frames and icons are well formed", () => {
    for (const [name, art] of Object.entries(CAT_FRAMES)) {
      expect(artSize(art)).toEqual({ width: 16, height: 16 });
      validateArt(`cat/${name}`, art, {});
    }
    for (const [name, art] of Object.entries(ICONS)) {
      expect(artSize(art), name).toEqual({ width: 10, height: 10 });
      validateArt(name, art, {});
    }
    validateArt("heart", HEART, {});
  });

  it("blink frames differ from the open-eyed pose where a face is visible", () => {
    const look = CHARACTER_LOOKS.player;
    expect(characterFrame(look, "down", 0, true)).not.toEqual(characterFrame(look, "down", 0));
    expect(characterFrame(look, "up", 0, true)).toEqual(characterFrame(look, "up", 0));
  });
});

describe("textures", () => {
  it("lays out the character sheet without overlapping rows", () => {
    const { people, facings, cat, bird, rows, columns, blinkColumn } = CHARACTER_SHEET;
    const used = new Set<number>();
    for (const first of Object.values(people)) {
      for (let facing = 0; facing < facings.length; facing += 1) {
        expect(used.has(first + facing)).toBe(false);
        used.add(first + facing);
      }
    }
    for (const row of [cat.row, bird.row]) {
      expect(used.has(row)).toBe(false);
      used.add(row);
    }
    expect(Math.max(...used)).toBeLessThan(rows);
    expect(blinkColumn).toBeLessThan(columns);
    expect(WALK_FRAMES).toBeLessThanOrEqual(blinkColumn);
  });

  it("maps every ground tile id to its own cell of the tileset", () => {
    const rect = new Float32Array(4);
    tileUv(1, rect);
    const [u0, v0, u1, v1] = Array.from(rect);
    expect(u0).toBeGreaterThanOrEqual(0);
    expect(v1).toBeLessThanOrEqual(1);
    expect(u1 - (u0 ?? 0)).toBeCloseTo(16 / 256, 3);
    expect(v1 - (v0 ?? 0)).toBeCloseTo(16 / 144, 3);
    const next = new Float32Array(4);
    tileUv(2, next);
    expect(next[0]).toBeCloseTo(u1 ?? 0, 3);
  });

  it("names each tiling surface once", () => {
    expect(new Set(SURFACE_NAMES).size).toBe(SURFACE_NAMES.length);
  });
});
