import { ImageResponse } from "next/og";
import { PixelGrid } from "@/components/PixelGrid";
import { playerFrame } from "@/game3d/entities/Player/art";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** Favicon: the 16x16 player sprite at 2x. */
export default function Icon() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex" }}>
      <PixelGrid rows={playerFrame("down", "idle", 0)} scale={2} />
    </div>,
    size,
  );
}
