import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { packSprites } from "@/game/art/atlas";
import {
  CAT_FRAMES,
  CHARACTER_LOOKS,
  FACINGS,
  WALK_FRAMES,
  characterFrame,
} from "@/game/art/characters";
import { HEART, ICONS } from "@/game/art/icons";
import { artSize, validateArt } from "@/game/art/pixels";
import { ATLAS_SPRITES } from "@/game/art/sprites";
import { ATLAS_GROUPS } from "@/game/assets/manifest";
import { PALETTE, PALETTE_NAMES, PIXEL_KEYS } from "@/game/palette";

describe("palette", () => {
  it("has exactly 24 unique colours", () => {
    expect(PALETTE_NAMES).toHaveLength(24);
    expect(new Set(Object.values(PALETTE)).size).toBe(24);
  });

  it("gives every colour exactly one pixel key", () => {
    const mapped = Object.values(PIXEL_KEYS);
    expect(mapped).toHaveLength(24);
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

describe("atlases", () => {
  it.each(ATLAS_GROUPS)("%s packs without overlaps inside the atlas", (group) => {
    const defs = ATLAS_SPRITES[group]();
    const packed = packSprites(defs);
    expect(packed.frames).toHaveLength(defs.length);
    expect(packed.width).toBeLessThanOrEqual(512);
    for (const a of packed.frames) {
      expect(a.x + a.width).toBeLessThanOrEqual(packed.width);
      expect(a.y + a.height).toBeLessThanOrEqual(packed.height);
      for (const b of packed.frames) {
        if (a === b) continue;
        const overlap =
          a.x < b.x + b.width &&
          b.x < a.x + a.width &&
          a.y < b.y + b.height &&
          b.y < a.y + a.height;
        expect(overlap, `${a.name} overlaps ${b.name}`).toBe(false);
      }
    }
  });

  it("names every player walk frame the way the README documents", () => {
    const names = new Set(ATLAS_SPRITES.characters().map((def) => def.name));
    for (const facing of FACINGS) {
      for (let frame = 0; frame < WALK_FRAMES; frame += 1) {
        expect(names.has(`player/${facing}/${frame}`)).toBe(true);
      }
    }
  });
});
