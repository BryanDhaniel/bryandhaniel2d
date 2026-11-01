import type { PaletteName } from "@/game/palette";
import type { PixelArt, RoleMap } from "./pixels";

/**
 * 16x16 character templates. Digits are roles that each character recolours:
 * 1 outline · 2 hair · 3 hair highlight · 4 skin · 5 skin shade
 * 6 top · 7 top shade · 8 trousers · 9 shoes
 * Fixed palette keys are used for details: `w` hoodie strings, `k`/`m`/`g`/`v` the laptop.
 *
 * A frame is head (rows 0-8) + body (rows 9-13) + legs (rows 14-15).
 */

export type Facing = "down" | "up" | "left" | "right";
export const FACINGS: readonly Facing[] = ["down", "left", "right", "up"];
export const WALK_FRAMES = 4;

type TemplateFacing = "down" | "up" | "side";

const HEAD: Record<TemplateFacing, PixelArt> = {
  down: [
    "................",
    ".....111111.....",
    "....12223221....",
    "...1222232221...",
    "...1224444221...",
    "...1244444421...",
    "...1241441421...",
    "....15444451....",
    ".....155551.....",
  ],
  up: [
    "................",
    ".....111111.....",
    "....12222221....",
    "...1222322221...",
    "...1222232221...",
    "...1222222221...",
    "...1222222221...",
    "....12222221....",
    ".....155551.....",
  ],
  side: [
    "................",
    "....111111......",
    "...12222221.....",
    "..1222223221....",
    "..1222224441....",
    "..12222444441...",
    "..12222441441...",
    "...122244441....",
    ".....15551......",
  ],
};

/** Eye pixels per template, swapped for skin shade on blink frames. */
const EYES: Record<TemplateFacing, readonly (readonly [number, number])[]> = {
  down: [
    [6, 6],
    [9, 6],
  ],
  up: [],
  side: [[9, 6]],
};

const BODY: Record<TemplateFacing, { plain: PixelArt; hoodie: PixelArt; laptop: PixelArt }> = {
  down: {
    plain: [
      "....16666661....",
      "...1766666671...",
      "...1766666671...",
      "...1466666641...",
      "....17666671....",
    ],
    hoodie: [
      "....16w66w61....",
      "...1766666671...",
      "...1766666671...",
      "...1466666641...",
      "....17666671....",
    ],
    laptop: [
      "....16w66w61....",
      "...1766666671...",
      "...14kmmmvk41...",
      "...17kggggk71...",
      "....17666671....",
    ],
  },
  up: {
    plain: [
      "....16666661....",
      "...1766666671...",
      "...1766666671...",
      "...1466666641...",
      "....17666671....",
    ],
    hoodie: [
      "....17777771....",
      "...1766666671...",
      "...1766666671...",
      "...1466666641...",
      "....17666671....",
    ],
    laptop: [
      "....17777771....",
      "...1766666671...",
      "...1766666671...",
      "...1466666641...",
      "....17666671....",
    ],
  },
  side: {
    plain: [
      "....1666661.....",
      "...17666661.....",
      "...17766661.....",
      "...14766661.....",
      "....1766671.....",
    ],
    hoodie: [
      "....1666661.....",
      "...17666661.....",
      "...17766661.....",
      "...14766661.....",
      "....1766671.....",
    ],
    laptop: [
      "....1666661.....",
      "...17666661.....",
      "...1766664kmk...",
      "...1766666kvk...",
      "....1766671kk...",
    ],
  },
};

/** Two rows of legs per walk frame. Frame 0 doubles as the standing pose. */
const LEGS: Record<"front" | "side", readonly PixelArt[]> = {
  front: [
    ["....18811881....", "....19911991...."],
    ["....18811991....", "....1991........"],
    ["....18811881....", "....19911991...."],
    ["....19911881....", "........1991...."],
  ],
  side: [
    [".....18881......", ".....19991......"],
    ["....188.881.....", "...199...991...."],
    [".....18881......", "......1991......"],
    ["....188.881.....", "...199...991...."],
  ],
};

export type Outfit = "plain" | "hoodie" | "laptop";

export interface CharacterLook {
  roles: RoleMap;
  outfit: Outfit;
}

function templateFor(facing: Facing): TemplateFacing {
  return facing === "left" || facing === "right" ? "side" : facing;
}

function blinkHead(template: TemplateFacing, shade: PaletteName | undefined): PixelArt {
  const head = HEAD[template];
  const eyes = EYES[template];
  if (eyes.length === 0 || !shade) {
    return head;
  }
  return head.map((line, row) => {
    let next = line;
    for (const [x, y] of eyes) {
      if (y === row) {
        next = `${next.slice(0, x)}5${next.slice(x + 1)}`;
      }
    }
    return next;
  });
}

/**
 * Returns one 16x16 frame. Left-facing frames are the right-facing art; the generator
 * mirrors them when it paints the atlas.
 */
export function characterFrame(
  look: CharacterLook,
  facing: Facing,
  frame: number,
  blink = false,
): PixelArt {
  const template = templateFor(facing);
  const head = blink ? blinkHead(template, look.roles["5"]) : HEAD[template];
  const body = BODY[template][look.outfit];
  const legs = LEGS[template === "side" ? "side" : "front"][frame % WALK_FRAMES] ?? [];
  return [...head, ...body, ...legs];
}

export const CHARACTER_LOOKS = {
  /** Bryan: dark hair, blue hoodie, white sneakers, laptop with a violet sticker. */
  player: {
    outfit: "laptop",
    roles: {
      "1": "ink",
      "2": "night",
      "3": "slate",
      "4": "skin",
      "5": "sand",
      "6": "water",
      "7": "deep",
      "8": "slate",
      "9": "cloud",
    },
  },
  villager: {
    outfit: "plain",
    roles: {
      "1": "ink",
      "2": "wood",
      "3": "sand",
      "4": "skin",
      "5": "sand",
      "6": "ember",
      "7": "brick",
      "8": "deep",
      "9": "bark",
    },
  },
  elder: {
    outfit: "hoodie",
    roles: {
      "1": "ink",
      "2": "mist",
      "3": "cloud",
      "4": "skin",
      "5": "sand",
      "6": "violet",
      "7": "slate",
      "8": "bark",
      "9": "ink",
    },
  },
} as const satisfies Record<string, CharacterLook>;

export type CharacterId = keyof typeof CHARACTER_LOOKS;

/** Orange tabby, facing right. Frames: walk A, walk B, sit, sleep. */
export const CAT_FRAMES: Record<"walk0" | "walk1" | "sit" | "sleep", PixelArt> = {
  walk0: [
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    ".........k...k..",
    "........kOk.kOk.",
    "kk......kOOOOOk.",
    "kOk.....kOkOkOk.",
    ".kOkkkkkkOOwOOk.",
    "..kOOeOOeOOwwk..",
    "..kOOOOOOOOOOk..",
    "...kk.kk.kk.kk..",
  ],
  walk1: [
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    ".........k...k..",
    "........kOk.kOk.",
    "kk......kOOOOOk.",
    "kOk.....kOkOkOk.",
    ".kOkkkkkkOOwOOk.",
    "..kOOeOOeOOwwk..",
    "..kOOOOOOOOOOk..",
    "....kk.kk.kk.kk.",
  ],
  sit: [
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    ".........k...k..",
    "........kOk.kOk.",
    "........kOOOOOk.",
    "kk......kOkOkOk.",
    "kOkkkkkkkOOwOOk.",
    ".kOOOeOOeOOwwk..",
    "..kOOOOOOOOOOk..",
    "...kkkkkkkkkkk..",
  ],
  sleep: [
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    ".........k...k..",
    "........kOk.kOk.",
    "..kkkkkkkOOOOOk.",
    ".kOOeOOeOOkOkOk.",
    "kOOOOOOOOOOOOOk.",
    "kkkkkkkkkkkkkk..",
  ],
};

export const SHADOW: PixelArt = [".kkkkkkkk.", "kkkkkkkkkk", ".kkkkkkkk."];
