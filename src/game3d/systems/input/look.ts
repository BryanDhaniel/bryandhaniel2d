/**
 * Camera look from the pointer, active only in third-person: drag with the mouse (left or
 * right button), or with pointer lock on, click once to capture the mouse and just move it
 * (Esc releases it). On touch screens a drag that starts on the right half of the screen
 * looks around (the left half belongs to the joystick). Deltas accumulate in pixels and are
 * consumed once per frame.
 */

/** A press that travels further than this (CSS px) is a drag, not a click-to-walk tap. */
const DRAG_THRESHOLD = 4;

export class LookHandler {
  enabled = false;
  pointerLock = false;
  /** Pixels moved since the last frame (mouse and touch are scaled differently). */
  readonly mouse = { x: 0, y: 0 };
  readonly touch = { x: 0, y: 0 };
  /** True while the pointer is captured. */
  locked = false;
  private element: HTMLElement | null = null;
  private drag: { id: number; x: number; y: number; moved: boolean; touch: boolean } | null = null;
  private onLockChange: ((locked: boolean) => void) | null = null;

  private readonly onPointerDown = (event: PointerEvent) => {
    if (!this.enabled || this.locked || this.drag) return;
    if (event.pointerType === "touch") {
      const rect = this.element?.getBoundingClientRect();
      if (!rect || event.clientX < rect.left + rect.width / 2) return;
    } else if (event.button !== 0 && event.button !== 2) {
      return;
    }
    this.drag = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      moved: false,
      touch: event.pointerType === "touch",
    };
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    if (this.locked) {
      if (event.pointerType === "mouse") {
        this.mouse.x += event.movementX;
        this.mouse.y += event.movementY;
      }
      return;
    }
    const drag = this.drag;
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    drag.moved = true;
    drag.x = event.clientX;
    drag.y = event.clientY;
    const target = drag.touch ? this.touch : this.mouse;
    target.x += dx;
    target.y += dy;
  };

  private readonly onPointerUp = (event: PointerEvent) => {
    const drag = this.drag;
    if (!drag || drag.id !== event.pointerId) return;
    this.drag = null;
    // A mouse click without a drag captures the pointer when mouse look is on.
    if (!drag.moved && !drag.touch && this.enabled && this.pointerLock && !this.locked) {
      this.element?.requestPointerLock?.();
    }
  };

  private readonly onContextMenu = (event: Event) => {
    if (this.enabled) event.preventDefault();
  };

  private readonly onLockChangeEvent = () => {
    const locked = document.pointerLockElement === this.element && this.element !== null;
    if (locked !== this.locked) {
      this.locked = locked;
      this.onLockChange?.(locked);
    }
  };

  attach(element: HTMLElement, onLockChange: (locked: boolean) => void): void {
    this.detach();
    this.element = element;
    this.onLockChange = onLockChange;
    element.addEventListener("pointerdown", this.onPointerDown);
    element.addEventListener("contextmenu", this.onContextMenu);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerUp);
    document.addEventListener("pointerlockchange", this.onLockChangeEvent);
  }

  detach(): void {
    this.release();
    const element = this.element;
    if (element) {
      element.removeEventListener("pointerdown", this.onPointerDown);
      element.removeEventListener("contextmenu", this.onContextMenu);
    }
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);
    document.removeEventListener("pointerlockchange", this.onLockChangeEvent);
    this.element = null;
    this.onLockChange = null;
  }

  /** Lets go of a drag and of the captured pointer (a panel opened, or the view changed). */
  release(): void {
    this.drag = null;
    this.mouse.x = 0;
    this.mouse.y = 0;
    this.touch.x = 0;
    this.touch.y = 0;
    if (
      typeof document !== "undefined" &&
      this.element &&
      document.pointerLockElement === this.element
    ) {
      document.exitPointerLock();
    }
  }

  /** Drops the current drag without touching pointer lock (a pinch started). */
  cancelDrag(): void {
    this.drag = null;
  }

  /** True while a mouse or touch drag is turning the camera. */
  get dragging(): boolean {
    return this.drag?.moved ?? false;
  }
}
