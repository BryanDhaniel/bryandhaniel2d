import { inflateSync, deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { PALETTE } from "@/game/palette";
import { CHARACTER, PLAYER_SIZE } from "@/game3d/config/character";
import { PlayerAnimator } from "@/game3d/entities/Player/animation";
import {
  ANIMATIONS,
  CARDINAL_DIRECTIONS,
  DIRECTIONS,
  FRAME_COUNTS,
  FRAME_HEIGHT,
  FRAME_WIDTH,
  LEGEND,
  PARTS,
  PORTRAIT_SIZE,
  TRANSPARENT,
  directionFor,
  inkHex,
  mirror,
  playerFrame,
  portraitGrid,
} from "@/game3d/entities/Player/art";
import {
  ATLAS_HEIGHT,
  ATLAS_WIDTH,
  atlasFrames,
  atlasJson,
  buildAtlasPixels,
  parseAtlasJson,
  requiredFrameNames,
} from "@/game3d/entities/Player/atlas";
import { crc32, encodePng } from "@/game3d/entities/Player/png";

const allFrames = DIRECTIONS.flatMap((direction) =>
  ANIMATIONS.flatMap((animation) =>
    Array.from({ length: FRAME_COUNTS[animation] }, (_, index) => ({
      direction,
      animation,
      index,
      rows: playerFrame(direction, animation, index),
    })),
  ),
);

const used = (rows: readonly string[], inks: string) =>
  new Set([...rows.join("")].filter((char) => inks.includes(char)));

describe("player pixel data", () => {
  it("draws every part as a rectangle of legend characters", () => {
    for (const [name, rows] of Object.entries(PARTS)) {
      const width = rows[0]?.length ?? 0;
      for (const row of rows) {
        expect(row, name).toHaveLength(width);
        for (const char of row) {
          expect(char === TRANSPARENT || char in LEGEND, `${name}: "${char}"`).toBe(true);
        }
      }
    }
  });

  it("composes 80 frames of 16x16 (eight directions)", () => {
    expect([FRAME_WIDTH, FRAME_HEIGHT]).toEqual([16, 16]);
    expect(allFrames).toHaveLength(80);
    for (const frame of allFrames) {
      expect(frame.rows).toHaveLength(FRAME_HEIGHT);
      for (const row of frame.rows) expect(row).toHaveLength(FRAME_WIDTH);
    }
  });

  it("stands one world unit tall at the world's texel density", () => {
    const rows = playerFrame("down", "idle", 0);
    const filled = rows.map((row, y) => (row.replace(/\./g, "") ? y : -1)).filter((y) => y >= 0);
    const top = Math.min(...filled);
    const bottom = Math.max(...filled);
    const height = (bottom - top + 1) / CHARACTER.texelsPerUnit;
    expect(height).toBeGreaterThanOrEqual(15 / 16);
    expect(height).toBeLessThanOrEqual(1);
    expect(bottom).toBe(FRAME_HEIGHT - 1);
    expect(PLAYER_SIZE).toEqual({ width: 1, height: 1 });
  });

  it("mirrors the right-facing frames for left, including the three-quarter views", () => {
    const pairs = [
      ["left", "right"],
      ["down-left", "down-right"],
      ["up-left", "up-right"],
    ] as const;
    for (const [left, right] of pairs) {
      for (const animation of ANIMATIONS) {
        for (let index = 0; index < FRAME_COUNTS[animation]; index += 1) {
          expect(playerFrame(left, animation, index)).toEqual(
            mirror(playerFrame(right, animation, index)),
          );
        }
      }
    }
  });

  it("picks the direction from the heading relative to the viewer", () => {
    expect(directionFor(0)).toBe("up");
    expect(directionFor(Math.PI)).toBe("down");
    expect(directionFor(-Math.PI)).toBe("down");
    expect(directionFor(-Math.PI / 2)).toBe("right");
    expect(directionFor(Math.PI / 2)).toBe("left");
    expect(directionFor(-Math.PI / 4)).toBe("up-right");
    expect(directionFor((3 * Math.PI) / 4)).toBe("down-left");
    expect(directionFor(0.3)).toBe("up");
  });

  it("bounces the hair's top block on footfalls in the back views", () => {
    for (const direction of ["up", "up-right"] as const) {
      const passing = playerFrame(direction, "walk", 1);
      const footfall = playerFrame(direction, "walk", 0);
      // The body drops a pixel on the footfall, yet the top block still reaches the top row.
      expect(footfall[8]).not.toEqual(passing[8]);
      expect([...(footfall[0] ?? "")].some((char) => char !== TRANSPARENT)).toBe(true);
    }
  });

  it("never uses pure black, and shades the black areas with several tones", () => {
    for (const char of Object.keys(LEGEND)) expect(inkHex(char)).not.toBe("#000000");
    const heads = [
      PARTS.headDown,
      PARTS.headUp,
      PARTS.headSide,
      PARTS.headDownSide,
      PARTS.headUpSide,
    ];
    for (const head of heads) {
      expect(used(head, "1234").size).toBeGreaterThanOrEqual(3);
    }
    for (const torso of [PARTS.torsoDown, PARTS.torsoUp, PARTS.torsoSide]) {
      expect(used(torso, "abcd").size).toBeGreaterThanOrEqual(3);
    }
    // The cool sheen stays on the top block (the first four rows of each head).
    for (const head of heads) {
      expect(used(head.slice(4), "4").size).toBe(0);
    }
  });

  it("separates the top block from the shorter sides with a visible step", () => {
    const extent = (row: string) => [
      row.search(/[^.]/),
      row.length - 1 - [...row].reverse().join("").search(/[^.]/),
    ];
    const [topLeft, topRight] = extent(PARTS.headDown[3] ?? "");
    const [sideLeft, sideRight] = extent(PARTS.headDown[4] ?? "");
    expect(sideLeft).toBeGreaterThan(topLeft ?? 0);
    expect(sideRight).toBeLessThan(topRight ?? 0);
  });

  it("animates: every walk frame differs, idle breathes and the wave differs from idle", () => {
    for (const direction of DIRECTIONS) {
      const walk = allFrames.filter((f) => f.direction === direction && f.animation === "walk");
      const unique = new Set(walk.map((frame) => frame.rows.join("\n")));
      expect(unique.size, direction).toBe(6);
      expect(playerFrame(direction, "idle", 1)).not.toEqual(playerFrame(direction, "idle", 0));
      expect(playerFrame(direction, "interact", 0)).not.toEqual(playerFrame(direction, "idle", 0));
    }
  });

  it("draws the drawstrings, pocket seam and sticker from the front", () => {
    const front = playerFrame("down", "idle", 0).join("");
    expect(front.split("w").length - 1).toBeGreaterThanOrEqual(4);
    expect(front).toContain("aaaaaa");
    expect(front).toContain("v");
  });
});

describe("player atlas", () => {
  it("lays out one row per direction and one column per frame", () => {
    const frames = atlasFrames();
    expect(frames).toHaveLength(80);
    expect(ATLAS_WIDTH).toBe(10 * FRAME_WIDTH);
    expect(ATLAS_HEIGHT).toBe(8 * FRAME_HEIGHT);
    const keys = new Set(frames.map((frame) => `${frame.x},${frame.y}`));
    expect(keys.size).toBe(80);
    for (const frame of frames) {
      expect(frame.x + frame.w).toBeLessThanOrEqual(ATLAS_WIDTH);
      expect(frame.y + frame.h).toBeLessThanOrEqual(ATLAS_HEIGHT);
    }
  });

  it("round-trips its JSON frame map and reads Aseprite's array format", () => {
    const json = atlasJson("player.png");
    expect(parseAtlasJson(json)?.size).toBe(80);
    const array = {
      frames: Object.entries(json.frames).map(([name, entry]) => ({
        filename: `${name}.png`,
        ...entry,
      })),
    };
    expect(parseAtlasJson(array)?.size).toBe(80);
    // A four-direction sheet is enough: the three-quarter views are composed at load time.
    const cardinal = {
      frames: Object.fromEntries(
        Object.entries(json.frames).filter(([name]) =>
          CARDINAL_DIRECTIONS.some(
            (direction) =>
              name.startsWith(`${direction}-`) && !/^(down|up)-(left|right)/.test(name),
          ),
        ),
      ),
    };
    expect(requiredFrameNames()).toHaveLength(40);
    expect(parseAtlasJson(cardinal)?.size).toBe(40);
    const missing = { frames: { ...json.frames } };
    delete missing.frames[requiredFrameNames()[5] ?? ""];
    expect(parseAtlasJson(missing)).toBeNull();
    expect(parseAtlasJson("nope")).toBeNull();
  });

  it("paints the frames into RGBA pixels with transparent margins", () => {
    const pixels = buildAtlasPixels();
    expect(pixels).toHaveLength(ATLAS_WIDTH * ATLAS_HEIGHT * 4);
    expect(pixels[3]).toBe(0);
    // The sole line of the first frame (bottom row) is the configured sole colour.
    const rows = playerFrame("down", "idle", 0);
    const x = (rows[FRAME_HEIGHT - 1] ?? "").indexOf("o");
    const i = ((FRAME_HEIGHT - 1) * ATLAS_WIDTH + x) * 4;
    const hex = `#${[pixels[i], pixels[i + 1], pixels[i + 2]].map((v) => (v ?? 0).toString(16).padStart(2, "0")).join("")}`;
    expect(hex).toBe(PALETTE[CHARACTER.sole]);
  });
});

describe("png encoder", () => {
  it("writes a valid RGBA PNG", () => {
    const rgba = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 0, 10, 20, 30, 40]);
    const png = encodePng(2, 2, rgba, (data) => new Uint8Array(deflateSync(data)));
    expect(Array.from(png.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const view = new DataView(png.buffer);
    expect(String.fromCharCode(...png.subarray(12, 16))).toBe("IHDR");
    expect(view.getUint32(16)).toBe(2);
    expect(view.getUint32(20)).toBe(2);
    expect(png[25]).toBe(6);
    expect(view.getUint32(29)).toBe(crc32(png.subarray(12, 29)));
    const idatLength = view.getUint32(33);
    const raw = inflateSync(png.subarray(41, 41 + idatLength));
    expect(Array.from(raw)).toEqual([0, ...rgba.subarray(0, 8), 0, ...rgba.subarray(8)]);
  });
});

describe("player animator", () => {
  it("walks from the first footfall, steps on frames 0 and 3, and settles to idle", () => {
    const animator = new PlayerAnimator();
    animator.update(0.016, true, false);
    expect(animator.animation).toBe("walk");
    expect(animator.footfall).toBe(true);
    const footfalls: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      animator.update(1 / CHARACTER.timings.walkFps, true, false);
      if (animator.footfall) footfalls.push(animator.frame);
    }
    expect(footfalls).toEqual([3, 0]);
    animator.update(0.016, false, false);
    expect(animator.animation).toBe("idle");
  });

  it("plays a queued wave once standing still, then returns to idle", () => {
    const animator = new PlayerAnimator();
    animator.queueInteract();
    animator.update(0.016, true, false);
    expect(animator.animation).toBe("walk");
    animator.update(0.016, false, false);
    expect(animator.animation).toBe("interact");
    const total =
      CHARACTER.timings.interactFrameSeconds *
      FRAME_COUNTS.interact *
      CHARACTER.timings.interactLoops;
    for (let t = 0; t < total + 0.05; t += 0.02) animator.update(0.02, false, false);
    expect(animator.animation).toBe("idle");
  });

  it("drops a queued wave when the player walks away", () => {
    const animator = new PlayerAnimator();
    animator.queueInteract();
    animator.cancelInteract();
    animator.update(0.016, false, false);
    expect(animator.animation).toBe("idle");
  });
});

describe("portrait", () => {
  it("is a 64x64 opaque head-and-shoulders with a catchlight in each eye", () => {
    const grid = portraitGrid();
    expect(grid).toHaveLength(PORTRAIT_SIZE);
    for (const row of grid) {
      expect(row).toHaveLength(PORTRAIT_SIZE);
      expect(row).not.toContain(TRANSPARENT);
    }
    // A catchlight is a 2x2 highlight in the top-left corner of a scaled-up eye pixel.
    const at = (x: number, y: number) => grid[y]?.charAt(x) ?? "";
    let catchlights = 0;
    grid.forEach((row, y) => {
      for (let x = 0; x < row.length; x += 1) {
        const highlight = at(x, y) + at(x + 1, y) + at(x, y + 1) + at(x + 1, y + 1);
        if (highlight === "wwww" && at(x + 2, y) === "1" && at(x, y + 2) === "1") {
          catchlights += 1;
        }
      }
    });
    expect(catchlights).toBe(2);
  });
});
