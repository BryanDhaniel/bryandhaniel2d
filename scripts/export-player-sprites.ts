/**
 * Writes the generated player atlas (PNG + Aseprite-style JSON), the 64x64 portrait and the
 * palette (GIMP .gpl, which Aseprite opens) to public/assets/sprites/player. Run with
 * `npm run sprites` after changing the character's pixel data or colours.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { PALETTE, PALETTE_NAMES } from "../src/game/palette";
import { CHARACTER } from "../src/game3d/config/character";
import { PORTRAIT_SIZE, gridToRgba, portraitGrid } from "../src/game3d/entities/Player/art";
import {
  ATLAS_HEIGHT,
  ATLAS_WIDTH,
  atlasJson,
  buildAtlasPixels,
} from "../src/game3d/entities/Player/atlas";
import { encodePng } from "../src/game3d/entities/Player/png";

const directory = join(process.cwd(), "public", "assets", "sprites", "player");
mkdirSync(directory, { recursive: true });
const deflate = (data: Uint8Array) => new Uint8Array(deflateSync(data, { level: 9 }));

writeFileSync(
  join(directory, "player.png"),
  encodePng(ATLAS_WIDTH, ATLAS_HEIGHT, buildAtlasPixels(), deflate),
);
writeFileSync(
  join(directory, "player.json"),
  `${JSON.stringify(atlasJson("player.png"), null, 2)}\n`,
);

const portrait = new Uint8ClampedArray(PORTRAIT_SIZE * PORTRAIT_SIZE * 4);
gridToRgba(portraitGrid(), portrait, PORTRAIT_SIZE);
writeFileSync(
  join(directory, "portrait.png"),
  encodePng(PORTRAIT_SIZE, PORTRAIT_SIZE, portrait, deflate),
);

// The palette for drawing in Aseprite: every village colour plus the configured skin ramp.
const swatch = (hex: string, name: string) => {
  const value = Number.parseInt(hex.slice(1), 16);
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  return `${channels.map((channel) => String(channel).padStart(3)).join(" ")}\t${name}`;
};
const palette = [
  "GIMP Palette",
  "Name: Kiznaiver Village",
  "Columns: 8",
  "#",
  ...PALETTE_NAMES.map((name) => swatch(PALETTE[name], name)),
  ...CHARACTER.skin.map((hex, index) => swatch(hex, `skin-${index}`)),
];
writeFileSync(join(directory, "palette.gpl"), `${palette.join("\n")}\n`);

process.stdout.write(
  `Wrote player.png (${ATLAS_WIDTH}x${ATLAS_HEIGHT}), player.json, portrait.png and palette.gpl to ${directory}\n`,
);
