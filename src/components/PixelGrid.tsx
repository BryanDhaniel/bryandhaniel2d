import { inkHex, portraitGrid } from "@/game3d/entities/Player/art";

interface PixelGridProps {
  /** Rows of player-legend characters (see entities/Player/art.ts). */
  rows: readonly string[];
  /** CSS pixels per art pixel. */
  scale?: number;
  className?: string;
  label?: string;
}

interface Run {
  x: number;
  y: number;
  length: number;
  fill: string;
}

function toRuns(rows: readonly string[]): Run[] {
  const runs: Run[] = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const char = row.charAt(x);
      let end = x + 1;
      while (end < row.length && row.charAt(end) === char) end += 1;
      const fill = inkHex(char);
      if (fill) runs.push({ x, y, length: end - x, fill });
      x = end;
    }
  });
  return runs;
}

/**
 * Renders the player's pixel data as a crisp inline SVG (one rect per horizontal run), so it
 * works in server components such as the About panel on /plain. No three.js involved.
 */
export function PixelGrid({ rows, scale = 4, className, label }: PixelGridProps) {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
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
      {toRuns(rows).map((run) => (
        <rect
          key={`${run.x}-${run.y}`}
          x={run.x}
          y={run.y}
          width={run.length}
          height={1}
          fill={run.fill}
        />
      ))}
    </svg>
  );
}

const PORTRAIT = portraitGrid();

/** The 64x64 player portrait (head and shoulders), drawn from the sprite's own pixels. */
export function PlayerPortrait({
  size = 64,
  className,
  label,
}: {
  /** Rendered size in CSS pixels (a multiple of 64 keeps the pixels square). */
  size?: number;
  className?: string;
  label?: string;
}) {
  return <PixelGrid rows={PORTRAIT} scale={size / 64} className={className} label={label} />;
}
