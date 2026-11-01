import { ImageResponse } from "next/og";
import { portfolio } from "@/content/portfolio";
import { PixelSprite } from "@/components/PixelSprite";
import { CHARACTER_LOOKS, characterFrame } from "@/game/art/characters";
import { PALETTE } from "@/game/palette";

export const alt = `${portfolio.profile.name} (${portfolio.profile.alias}), ${portfolio.profile.roles.join(" and ")}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  const { profile } = portfolio;
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        gap: 64,
        padding: "0 88px",
        background: PALETTE.night,
        color: PALETTE.cloud,
        borderBottom: `48px solid ${PALETTE.grass}`,
      }}
    >
      <div
        style={{
          display: "flex",
          padding: 24,
          background: PALETTE.deep,
          border: `12px solid ${PALETTE.ink}`,
          boxShadow: `16px 16px 0 0 ${PALETTE.ink}`,
        }}
      >
        <PixelSprite
          art={characterFrame(CHARACTER_LOOKS.player, "down", 0)}
          roles={CHARACTER_LOOKS.player.roles}
          scale={18}
        />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div
          style={{
            fontSize: 34,
            letterSpacing: 8,
            color: PALETTE.gold,
            textTransform: "uppercase",
          }}
        >
          {profile.alias}
        </div>
        <div style={{ fontSize: 88, fontWeight: 700, lineHeight: 1 }}>{profile.name}</div>
        <div style={{ fontSize: 40, color: PALETTE.foam }}>{profile.roles.join(" · ")}</div>
        <div style={{ fontSize: 32, color: PALETTE.mist }}>{profile.location}</div>
      </div>
    </div>,
    size,
  );
}
