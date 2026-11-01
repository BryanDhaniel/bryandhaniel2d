import { ICONS, type IconName } from "@/game/art/icons";
import { artSize, artToRuns } from "@/game/art/pixels";
import { PALETTE } from "@/game/palette";

interface PixelIconProps {
  name: IconName;
  /** Rendered size in CSS pixels; use a multiple of 10 to keep pixels square and even. */
  size?: number;
  className?: string;
  /** Accessible label. Icons without one are decorative and hidden from assistive tech. */
  label?: string;
}

export function PixelIcon({ name, size = 20, className, label }: PixelIconProps) {
  const art = ICONS[name];
  const { width, height } = artSize(art);
  const runs = artToRuns(art);
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={size}
      height={(size * height) / width}
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
