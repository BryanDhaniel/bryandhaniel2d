"use client";

import { useEffect, useRef, useState } from "react";
import { PALETTE } from "@/game/palette";
import { CHARACTER } from "@/game3d/config/character";
import {
  ANIMATIONS,
  DIRECTIONS,
  FRAME_COUNTS,
  gridToRgba,
  playerFrame,
  portraitGrid,
  type Animation,
  type Direction,
} from "@/game3d/entities/Player/art";
import { frameName } from "@/game3d/entities/Player/atlas";
import { useMediaQuery } from "@/lib/hooks";

const FRAMES: Record<Direction, Record<Animation, string[][]>> = Object.fromEntries(
  DIRECTIONS.map((direction) => [
    direction,
    Object.fromEntries(
      ANIMATIONS.map((animation) => [
        animation,
        Array.from({ length: FRAME_COUNTS[animation] }, (_, index) =>
          playerFrame(direction, animation, index),
        ),
      ]),
    ),
  ]),
) as Record<Direction, Record<Animation, string[][]>>;

const PORTRAIT = portraitGrid();

const FRAME_MS: Record<Animation, number> = {
  idle: CHARACTER.timings.idleFrameSeconds * 1000,
  walk: 1000 / CHARACTER.timings.walkFps,
  interact: CHARACTER.timings.interactFrameSeconds * 1000,
};

const SWATCHES: { label: string; color: string }[] = [
  { label: "Grass", color: PALETTE.grass },
  { label: "Cobblestone", color: PALETTE.stone },
  { label: "Dark water", color: PALETTE.deep },
  { label: "Night", color: PALETTE.night },
];

function SpriteCanvas({
  rows,
  zoom,
  background,
  label,
}: {
  rows: readonly string[];
  zoom: number;
  background?: string;
  label?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const width = rows[0]?.length ?? 0;
  const height = rows.length;
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const pixels = new Uint8ClampedArray(width * height * 4);
    gridToRgba(rows, pixels, width);
    ctx.putImageData(new ImageData(pixels, width, height), 0, 0);
  }, [rows, width, height]);
  return (
    <canvas
      ref={ref}
      width={width}
      height={height}
      role={label ? "img" : undefined}
      aria-label={label}
      style={{
        width: width * zoom,
        height: height * zoom,
        imageRendering: "pixelated",
        background,
      }}
    />
  );
}

function Preview({ direction, animation }: { direction: Direction; animation: Animation }) {
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (reducedMotion) return;
    const id = window.setInterval(
      () => setFrame((current) => (current + 1) % FRAME_COUNTS[animation]),
      FRAME_MS[animation],
    );
    return () => window.clearInterval(id);
  }, [animation, reducedMotion]);
  const rows = FRAMES[direction][animation][reducedMotion ? 0 : frame] ?? [];
  return (
    <figure className="flex flex-col items-center gap-1">
      <SpriteCanvas
        rows={rows}
        zoom={4}
        background={PALETTE.mist}
        label={`${direction} ${animation}`}
      />
      <figcaption className="text-xs text-mist">
        {direction} · {animation}
      </figcaption>
    </figure>
  );
}

function FrameTable({ zoom }: { zoom: number }) {
  return (
    <div className="overflow-x-auto pb-2">
      <table className="border-separate border-spacing-2">
        <thead>
          <tr>
            <th scope="col" className="sr-only">
              Direction
            </th>
            {ANIMATIONS.flatMap((animation) =>
              Array.from({ length: FRAME_COUNTS[animation] }, (_, index) => (
                <th
                  key={`${animation}-${index}`}
                  scope="col"
                  className="text-xs font-normal text-mist"
                >
                  {animation} {index}
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {DIRECTIONS.map((direction) => (
            <tr key={direction}>
              <th scope="row" className="pr-2 text-left text-sm font-normal text-wheat">
                {direction}
              </th>
              {ANIMATIONS.flatMap((animation) =>
                FRAMES[direction][animation].map((rows, index) => (
                  <td key={`${animation}-${index}`}>
                    <SpriteCanvas
                      rows={rows}
                      zoom={zoom}
                      background={PALETTE.mist}
                      label={frameName(direction, animation, index)}
                    />
                  </td>
                )),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Review sheet for the player sprite: every frame, live animations, contrast and the portrait. */
export function ContactSheet() {
  return (
    <div className="space-y-10">
      <section aria-labelledby="animations" className="space-y-3">
        <h2 id="animations" className="text-2xl text-gold">
          Animations
        </h2>
        <div className="flex flex-wrap gap-4">
          {DIRECTIONS.flatMap((direction) =>
            ANIMATIONS.map((animation) => (
              <Preview
                key={`${direction}-${animation}`}
                direction={direction}
                animation={animation}
              />
            )),
          )}
        </div>
      </section>
      {[4, 8].map((zoom) => (
        <section key={zoom} aria-labelledby={`frames-${zoom}`} className="space-y-3">
          <h2 id={`frames-${zoom}`} className="text-2xl text-gold">
            All frames at {zoom}×
          </h2>
          <FrameTable zoom={zoom} />
        </section>
      ))}
      <section aria-labelledby="contrast" className="space-y-3">
        <h2 id="contrast" className="text-2xl text-gold">
          Contrast
        </h2>
        <div className="flex flex-wrap gap-4">
          {SWATCHES.map((swatch) => (
            <figure key={swatch.label} className="flex flex-col items-center gap-1">
              <SpriteCanvas
                rows={FRAMES.down.idle[0] ?? []}
                zoom={4}
                background={swatch.color}
                label={`Standing on ${swatch.label.toLowerCase()}`}
              />
              <figcaption className="text-xs text-mist">{swatch.label}</figcaption>
            </figure>
          ))}
        </div>
      </section>
      <section aria-labelledby="portrait" className="space-y-3">
        <h2 id="portrait" className="text-2xl text-gold">
          Portrait
        </h2>
        <div className="flex flex-wrap items-end gap-4">
          {[1, 2, 4].map((zoom) => (
            <SpriteCanvas key={zoom} rows={PORTRAIT} zoom={zoom} label={`Portrait at ${zoom}×`} />
          ))}
        </div>
      </section>
    </div>
  );
}
