import { PALETTE, PIXEL_KEYS, TRANSPARENT, isPixelKey, type PaletteName } from "@/game/palette";

/**
 * Compact pixel art: one string per row, one character per pixel.
 * Characters are palette keys (see PIXEL_KEYS), `.` for transparent, or digits that a
 * RoleMap resolves to palette colours (used to recolour shared character templates).
 */
export type PixelArt = readonly string[];

export type RoleDigit = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
export type RoleMap = Partial<Record<RoleDigit, PaletteName>>;

export interface ArtSize {
  width: number;
  height: number;
}

export function artSize(art: PixelArt): ArtSize {
  return { width: art[0]?.length ?? 0, height: art.length };
}

/** Resolves a pixel character to a palette colour name, or null when transparent. */
export function resolvePixel(char: string, roles?: RoleMap): PaletteName | null {
  if (char === TRANSPARENT || char === " ") {
    return null;
  }
  if (isPixelKey(char)) {
    return PIXEL_KEYS[char];
  }
  const role = roles?.[char as RoleDigit];
  if (role) {
    return role;
  }
  throw new Error(`Pixel character "${char}" is not a palette key and has no role mapping.`);
}

export interface DrawArtOptions {
  roles?: RoleMap;
  flipX?: boolean;
  /** Replace every opaque pixel with this colour (used for silhouettes and shadows). */
  solid?: PaletteName;
}

/** Paints pixel art onto a 2D canvas at integer coordinates. */
export function drawArt(
  ctx: CanvasRenderingContext2D,
  art: PixelArt,
  x: number,
  y: number,
  options: DrawArtOptions = {},
): void {
  const { width } = artSize(art);
  for (let row = 0; row < art.length; row += 1) {
    const line = art[row] ?? "";
    for (let col = 0; col < line.length; col += 1) {
      const name = resolvePixel(line.charAt(col), options.roles);
      if (!name) {
        continue;
      }
      const drawCol = options.flipX ? width - 1 - col : col;
      ctx.fillStyle = PALETTE[options.solid ?? name];
      ctx.fillRect(x + drawCol, y + row, 1, 1);
    }
  }
}

/** Throws if rows have different lengths or contain unknown characters. */
export function validateArt(name: string, art: PixelArt, roles?: RoleMap): void {
  const { width } = artSize(art);
  art.forEach((line, row) => {
    if (line.length !== width) {
      throw new Error(`${name}: row ${row} is ${line.length} wide, expected ${width}.`);
    }
    for (const char of line) {
      if (roles === undefined && /[1-9]/.test(char)) {
        continue;
      }
      resolvePixel(char, roles);
    }
  });
}

export interface PixelRun {
  x: number;
  y: number;
  length: number;
  color: PaletteName;
}

/** Merges horizontal runs of the same colour, handy for rendering art as SVG rects. */
export function artToRuns(art: PixelArt, roles?: RoleMap): PixelRun[] {
  const runs: PixelRun[] = [];
  art.forEach((line, y) => {
    let current: PixelRun | null = null;
    for (let x = 0; x < line.length; x += 1) {
      const color = resolvePixel(line.charAt(x), roles);
      if (current && color === current.color) {
        current.length += 1;
        continue;
      }
      if (current) {
        runs.push(current);
      }
      current = color ? { x, y, length: 1, color } : null;
    }
    if (current) {
      runs.push(current);
    }
  });
  return runs;
}

/** Returns a copy of `art` with rows replaced starting at `fromRow` (for animation frames). */
export function withRows(art: PixelArt, fromRow: number, rows: PixelArt): PixelArt {
  return art.map((line, index) => {
    const replacement = rows[index - fromRow];
    return index >= fromRow && replacement !== undefined ? replacement : line;
  });
}

/** Shifts the whole image down by `pixels`, padding the top with transparency. */
export function shiftDown(art: PixelArt, pixels: number): PixelArt {
  if (pixels <= 0) {
    return art;
  }
  const { width } = artSize(art);
  const blank = TRANSPARENT.repeat(width);
  const padded = Array.from({ length: pixels }, () => blank);
  return [...padded, ...art.slice(0, art.length - pixels)];
}

/** Deterministic hash for "random" decoration that stays stable between reloads. */
export function hash2(x: number, y: number, seed = 0): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}
