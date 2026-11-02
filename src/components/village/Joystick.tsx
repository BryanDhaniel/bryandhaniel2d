"use client";

import { useRef, useState, type PointerEvent } from "react";
import type { GameBridge } from "@/game/bridge";
import { PixelIcon } from "@/components/PixelIcon";

const RADIUS = 56;

interface JoystickProps {
  bridge: GameBridge;
  /** Shows the action button as active while a doorway is in reach. */
  canInteract: boolean;
}

/**
 * Third-person touch controls: a virtual joystick on the left (camera-relative walking; push
 * it all the way to walk at full speed), and on the right an action button and a run toggle.
 * Dragging anywhere else on the right half of the screen turns the camera (handled by the
 * canvas). Hidden from assistive tech, like the D-pad: keyboard play and the plain view are
 * the accessible routes.
 */
export function Joystick({ bridge, canInteract }: JoystickProps) {
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLSpanElement>(null);
  const pointer = useRef<number | null>(null);
  const [running, setRunning] = useState(false);

  const moveKnob = (x: number, y: number) => {
    const knob = knobRef.current;
    if (knob)
      knob.style.transform = `translate(${Math.round(x * RADIUS)}px, ${Math.round(-y * RADIUS)}px)`;
  };

  const update = (event: PointerEvent<HTMLDivElement>) => {
    const rect = baseRef.current?.getBoundingClientRect();
    if (!rect) return;
    let x = (event.clientX - (rect.left + rect.width / 2)) / RADIUS;
    let y = -(event.clientY - (rect.top + rect.height / 2)) / RADIUS;
    const length = Math.hypot(x, y);
    if (length > 1) {
      x /= length;
      y /= length;
    }
    moveKnob(x, y);
    bridge.emit("move", { x, y });
  };

  const release = () => {
    pointer.current = null;
    moveKnob(0, 0);
    bridge.emit("move", { x: 0, y: 0 });
  };

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex items-end justify-between p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <div
        ref={baseRef}
        onPointerDown={(event) => {
          event.preventDefault();
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            // Released already; the press still counts.
          }
          pointer.current = event.pointerId;
          update(event);
        }}
        onPointerMove={(event) => {
          if (pointer.current === event.pointerId) update(event);
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={release}
        onContextMenu={(event) => event.preventDefault()}
        className="pointer-events-auto relative grid size-36 touch-none place-items-center rounded-full border-4 border-ink bg-cloud/50 select-none"
      >
        <span
          ref={knobRef}
          className="block size-14 rounded-full border-4 border-ink bg-gold shadow-pixel-sm"
        />
      </div>
      <div className="pointer-events-auto flex flex-col items-end gap-2">
        <button
          type="button"
          tabIndex={-1}
          aria-pressed={running}
          onPointerDown={(event) => {
            event.preventDefault();
            const next = !running;
            setRunning(next);
            bridge.emit("run", { on: next });
          }}
          onContextMenu={(event) => event.preventDefault()}
          className="pixel-button size-12 touch-none bg-cloud/90 select-none aria-pressed:bg-gold"
        >
          <PixelIcon name="run" size={20} />
        </button>
        <button
          type="button"
          tabIndex={-1}
          onPointerDown={(event) => {
            event.preventDefault();
            bridge.emit("interact", null);
          }}
          className={`pixel-button size-20 touch-none text-2xl font-bold text-ink select-none ${canInteract ? "bg-gold" : "bg-mist"}`}
        >
          A
        </button>
      </div>
    </div>
  );
}
