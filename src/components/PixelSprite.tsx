import { artSize, artToRuns, type PixelArt, type RoleMap } from "@/game/art/pixels";
import { PALETTE } from "@/game/palette";

interface PixelSpriteProps {
  art: PixelArt;
  roles?: RoleMap;
  /** CSS pixels per art pixel. */
  scale?: number;
  className?: string;
  label?: string;
}

/** Renders game pixel art as a crisp inline SVG, straight from the sprite data. */
export function PixelSprite({ art, roles, scale = 4, className, label }: PixelSpriteProps) {
  const { width, height } = artSize(art);
  const runs = artToRuns(art, roles);
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width * scale}
      height={height * scale}
      shapeRendering="crispEdges"
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {runs.map((run) => (
        <rect
          key={`${run.x}-${run.y}`}
          x={run.x}
          y={run.y}
          width={run.length}
          height={1}
          fill={PALETTE[run.color]}
        />
      ))}
    </svg>
  );
}
