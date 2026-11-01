"use client";

import { useRef, type PointerEvent } from "react";
import type { GameBridge } from "@/game/bridge";
import { PixelIcon } from "@/components/PixelIcon";

type Direction = "up" | "down" | "left" | "right";

const VECTORS: Record<Direction, { x: number; y: number }> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const ROTATION: Record<Direction, string> = {
  up: "",
  right: "rotate-90",
  down: "rotate-180",
  left: "-rotate-90",
};

const PLACEMENT: Record<Direction, string> = {
  up: "col-start-2 row-start-1",
  left: "col-start-1 row-start-2",
  right: "col-start-3 row-start-2",
  down: "col-start-2 row-start-3",
};

interface DPadProps {
  bridge: GameBridge;
  /** Shows the action button while the player stands at a door. */
  canInteract: boolean;
}

/**
 * Touch controls: the D-pad, two buttons that turn the camera, and the action button.
 * Hidden from assistive tech: keyboard play and the plain view are the
 * accessible routes, and these only make sense as press-and-hold pointer targets.
 */
export function DPad({ bridge, canInteract }: DPadProps) {
  const active = useRef<Direction | null>(null);

  const press = (direction: Direction) => (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    try {
      // Keeps the press alive if the finger slides off the button.
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // The pointer was already released; the press still counts.
    }
    active.current = direction;
    bridge.emit("dpad", VECTORS[direction]);
  };
  const release = (direction: Direction) => () => {
    if (active.current === direction) {
      active.current = null;
      bridge.emit("dpad", { x: 0, y: 0 });
    }
  };

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex items-end justify-between p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <div className="pointer-events-auto grid size-36 touch-none grid-cols-3 grid-rows-3 gap-1 select-none">
        {(Object.keys(VECTORS) as Direction[]).map((direction) => (
          <button
            key={direction}
            type="button"
            tabIndex={-1}
            onPointerDown={press(direction)}
            onPointerUp={release(direction)}
            onPointerCancel={release(direction)}
            onLostPointerCapture={release(direction)}
            onContextMenu={(event) => event.preventDefault()}
            className={`pixel-button bg-cloud/90 active:bg-gold ${PLACEMENT[direction]}`}
          >
            <PixelIcon name="arrow" size={20} className={ROTATION[direction]} />
          </button>
        ))}
      </div>
      <div className="pointer-events-auto flex flex-col items-end gap-2">
        <div className="flex gap-2">
          {([-1, 1] as const).map((direction) => (
            <button
              key={direction}
              type="button"
              tabIndex={-1}
              onPointerDown={(event) => {
                event.preventDefault();
                bridge.emit("rotateCamera", { direction });
              }}
              onContextMenu={(event) => event.preventDefault()}
              className="pixel-button size-12 touch-none bg-cloud/90 select-none active:bg-gold"
            >
              <PixelIcon name={direction < 0 ? "turnLeft" : "turnRight"} size={20} />
            </button>
          ))}
        </div>
        <button
          type="button"
          tabIndex={-1}
          disabled={!canInteract}
          onPointerDown={(event) => {
            event.preventDefault();
            bridge.emit("interact", null);
          }}
          className="pointer-events-auto pixel-button size-20 touch-none bg-gold text-2xl font-bold text-ink select-none disabled:bg-mist"
        >
          A
        </button>
      </div>
    </div>
  );
}
