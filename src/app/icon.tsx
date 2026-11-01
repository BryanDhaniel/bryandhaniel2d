import { ImageResponse } from "next/og";
import { PixelSprite } from "@/components/PixelSprite";
import { CHARACTER_LOOKS, characterFrame } from "@/game/art/characters";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** Favicon: the 16x16 player sprite at 2x. */
export default function Icon() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex" }}>
      <PixelSprite
        art={characterFrame(CHARACTER_LOOKS.player, "down", 0)}
        roles={CHARACTER_LOOKS.player.roles}
        scale={2}
      />
    </div>,
    size,
  );
}
