import * as THREE from "three";
import { ICONS, type IconName } from "@/game/art/icons";
import { drawArt } from "@/game/art/pixels";
import type { BuildingId } from "@/game/map/village";
import type { LightKind } from "@/game3d/config/visuals";
import type { EmissiveName, MaterialLibrary } from "@/game3d/shaders/materials";
import { pixelCanvas, pixelTexture } from "@/game3d/textures/canvas";
import type { SurfaceName } from "@/game3d/textures/surfaces";
import type { BuildingLayout } from "@/game3d/world/layout";
import {
  Kit,
  pyramid,
  texturedBox,
  texturedCylinder,
  texturedPlane,
  wallShape,
  type Hole,
} from "./kit";

/**
 * Procedural HD-2D buildings, one blueprint per portfolio building, each with its own
 * silhouette: walls with real window and door openings, trim, overhanging roofs, chimneys,
 * signs, props and a furnished interior that shows when the roof fades. Parts are merged per
 * material; walls and roofs are grouped by side so the cutaway can fade them.
 */

export type Side = "s" | "e" | "w" | "n";

export interface LightSource {
  kind: LightKind;
  x: number;
  y: number;
  z: number;
  seed: number;
}

export interface FadePart {
  mesh: THREE.Mesh;
  /** "roof" or "wall-<side>". */
  group: string;
  material: THREE.MeshStandardMaterial;
}

export interface BuildingModel {
  id: BuildingId;
  root: THREE.Group;
  fadeParts: FadePart[];
  lights: LightSource[];
  /** World-space smoke origins (chimney tops) and the forge's spark origin. */
  chimneys: THREE.Vector3[];
  forge: THREE.Vector3 | null;
  spinners: { object: THREE.Object3D; axis: "x" | "y" | "z"; speed: number }[];
  swingers: { object: THREE.Object3D; amplitude: number; phase: number }[];
  /** World-space anchor for the HTML "E / Tap" prompt. */
  prompt: THREE.Vector3;
  /** Where dust motes drift in the window light (Library). */
  dustSpots: THREE.Vector3[];
}

interface WindowSpec {
  at: number;
  y: number;
  width: number;
  height: number;
}

interface WallsSpec {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  base: number;
  height: number;
  surface: SurfaceName;
  glass: EmissiveName;
  ridge: "x" | "z" | null;
  rise: number;
  windows: Partial<Record<Side, WindowSpec[]>>;
  door?: { at: number; width: number; height: number };
  /** Window sills and lintels in this trim surface. */
  trim?: SurfaceName;
  shutters?: SurfaceName;
}

const WALL = 0.16;

/** Draws the sign boards (an icon on a framed plank) once per world. */
export function createSignTextures(): Record<IconName, THREE.CanvasTexture> {
  const names = Object.keys(ICONS) as IconName[];
  const entries = names.map((name) => {
    const { canvas, ctx } = pixelCanvas(16, 16);
    ctx.fillStyle = "#4b2e2b";
    ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = "#ecd3a0";
    ctx.fillRect(1, 1, 14, 14);
    drawArt(ctx, ICONS[name], 3, 3);
    return [name, pixelTexture(canvas)] as const;
  });
  return Object.fromEntries(entries) as Record<IconName, THREE.CanvasTexture>;
}

class Blueprint {
  readonly kit = new Kit();
  readonly lights: LightSource[] = [];
  readonly chimneys: THREE.Vector3[] = [];
  readonly extras: THREE.Object3D[] = [];
  readonly spinners: BuildingModel["spinners"] = [];
  readonly swingers: BuildingModel["swingers"] = [];
  readonly dust: THREE.Vector3[] = [];
  forge: THREE.Vector3 | null = null;
  doorHeight = 1.5;

  constructor(
    readonly layout: BuildingLayout,
    readonly m: MaterialLibrary,
    readonly signs: Record<IconName, THREE.Texture>,
  ) {}

  get W(): number {
    return this.layout.rect.width;
  }

  get D(): number {
    return this.layout.rect.height;
  }

  /** Door centre in local coordinates. */
  get doorX(): number {
    return this.layout.doorX - this.layout.rect.x;
  }

  light(kind: LightKind, x: number, y: number, z: number): void {
    this.lights.push({ kind, x, y, z, seed: this.lights.length * 1.7 + x * 0.31 + z * 0.57 });
  }

  box(
    group: string,
    surface: SurfaceName | THREE.Material,
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    rotY = 0,
  ): void {
    const material = typeof surface === "string" ? this.m.surface(surface) : surface;
    this.kit.box(group, material, w, h, d, { x, y: y + h / 2, z, rotY });
  }

  /** Four walls with openings, gables across the ridge, sills, lintels and glass. */
  walls(spec: WallsSpec): void {
    const t = WALL;
    const material = this.m.surface(spec.surface);
    const glass = this.m.emissive(spec.glass);
    const spanX = spec.x1 - spec.x0;
    const spanZ = spec.z1 - spec.z0;
    const sides: {
      side: Side;
      length: number;
      gable: boolean;
      origin: THREE.Vector3;
      rotY: number;
    }[] = [
      {
        side: "s",
        length: spanX,
        gable: spec.ridge === "z",
        origin: new THREE.Vector3(spec.x0, spec.base, spec.z1 - t),
        rotY: 0,
      },
      {
        side: "n",
        length: spanX,
        gable: spec.ridge === "z",
        origin: new THREE.Vector3(spec.x1, spec.base, spec.z0 + t),
        rotY: Math.PI,
      },
      {
        side: "e",
        length: spanZ - 2 * t,
        gable: spec.ridge === "x",
        origin: new THREE.Vector3(spec.x1, spec.base, spec.z0 + t),
        rotY: -Math.PI / 2,
      },
      {
        side: "w",
        length: spanZ - 2 * t,
        gable: spec.ridge === "x",
        origin: new THREE.Vector3(spec.x0, spec.base, spec.z1 - t),
        rotY: Math.PI / 2,
      },
    ];
    const halfSpan = (spec.ridge === "x" ? spanZ : spanX) / 2;
    for (const wall of sides) {
      const group = `wall-${wall.side}`;
      const holes: Hole[] = (spec.windows[wall.side] ?? []).map((w) => ({
        x: w.at,
        y: w.y,
        width: w.width,
        height: w.height,
      }));
      const door: Hole | undefined =
        wall.side === "s" && spec.door
          ? {
              x: spec.door.at - spec.door.width / 2,
              y: 0,
              width: spec.door.width,
              height: spec.door.height,
            }
          : undefined;
      const gable = wall.gable ? (spec.rise * (wall.length / 2)) / halfSpan : 0;
      this.kit.add(group, material, wallShape(wall.length, spec.height, t, holes, gable, door), {
        x: wall.origin.x,
        y: wall.origin.y,
        z: wall.origin.z,
        rotY: wall.rotY,
      });
      // Window glass sits in the middle of the wall; sills and lintels stick out a little.
      for (const w of spec.windows[wall.side] ?? []) {
        const along = w.at + w.width / 2;
        const local = new THREE.Vector3(along, w.y + w.height / 2, t / 2);
        // One full pane texture per window (the mullions stay centred whatever its size).
        const pane = texturedPlane(1, 1);
        pane.scale(w.width, w.height, 1);
        this.addOnWall(group, glass, pane, wall.origin, wall.rotY, local);
        if (spec.trim) {
          const trim = this.m.surface(spec.trim);
          this.addOnWall(
            group,
            trim,
            texturedBox(w.width + 0.16, 0.08, t + 0.12),
            wall.origin,
            wall.rotY,
            new THREE.Vector3(along, w.y - 0.04, t / 2),
          );
          this.addOnWall(
            group,
            trim,
            texturedBox(w.width + 0.12, 0.08, t + 0.08),
            wall.origin,
            wall.rotY,
            new THREE.Vector3(along, w.y + w.height + 0.04, t / 2),
          );
        }
        if (spec.shutters) {
          const shutter = this.m.surface(spec.shutters);
          for (const dir of [-1, 1]) {
            this.addOnWall(
              group,
              shutter,
              texturedBox(0.22, w.height, 0.05),
              wall.origin,
              wall.rotY,
              new THREE.Vector3(along + dir * (w.width / 2 + 0.13), w.y + w.height / 2, -0.03),
            );
          }
        }
      }
    }
    if (spec.door) {
      const { at, width, height } = spec.door;
      this.doorHeight = height;
      const origin = sides[0]?.origin ?? new THREE.Vector3();
      this.addOnWall(
        "wall-s",
        this.m.surface("door"),
        texturedBox(width, height, 0.06),
        origin,
        0,
        new THREE.Vector3(at, height / 2, t * 0.3),
      );
      const trim = this.m.surface(spec.trim ?? "trim");
      this.addOnWall(
        "wall-s",
        trim,
        texturedBox(width + 0.24, 0.12, t + 0.1),
        origin,
        0,
        new THREE.Vector3(at, height + 0.06, t / 2),
      );
      for (const dir of [-1, 1]) {
        this.addOnWall(
          "wall-s",
          trim,
          texturedBox(0.1, height, t + 0.08),
          origin,
          0,
          new THREE.Vector3(at + dir * (width / 2 + 0.05), height / 2, t / 2),
        );
      }
    }
  }

  private addOnWall(
    group: string,
    material: THREE.Material,
    geometry: THREE.BufferGeometry,
    origin: THREE.Vector3,
    rotY: number,
    local: THREE.Vector3,
  ): void {
    const offset = local.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
    this.kit.add(group, material, geometry, {
      x: origin.x + offset.x,
      y: origin.y + offset.y,
      z: origin.z + offset.z,
      rotY,
    });
  }

  /** Gable roof: two thick slabs meeting at a ridge along X or Z, plus a ridge cap. */
  gableRoof(
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    top: number,
    rise: number,
    overhang: number,
    surface: SurfaceName,
    ridge: "x" | "z",
  ): void {
    const material = this.m.surface(surface);
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const along = ridge === "x" ? x1 - x0 : z1 - z0;
    const half = (ridge === "x" ? z1 - z0 : x1 - x0) / 2;
    const theta = Math.atan2(rise, half);
    const length = (half + overhang) / Math.cos(theta);
    const thickness = 0.12;
    for (const dir of [1, -1]) {
      const slab = texturedBox(along + overhang * 2, thickness, length);
      const down = new THREE.Vector3(0, -Math.sin(theta), Math.cos(theta) * dir);
      const normal = new THREE.Vector3(0, Math.cos(theta), Math.sin(theta) * dir);
      const centre = new THREE.Vector3(0, top + rise, 0)
        .addScaledVector(down, length / 2)
        .addScaledVector(normal, thickness / 2);
      slab.rotateX(theta * dir);
      slab.translate(centre.x, centre.y, centre.z);
      if (ridge === "z") slab.rotateY(Math.PI / 2);
      this.kit.add("roof", material, slab, { x: cx, z: cz });
    }
    const cap = texturedBox(along + overhang * 2 + 0.1, 0.12, 0.2);
    cap.translate(0, top + rise + 0.1, 0);
    if (ridge === "z") cap.rotateY(Math.PI / 2);
    this.kit.add("roof", this.m.surface("trim"), cap, { x: cx, z: cz });
  }

  chimney(x: number, z: number, from: number, to: number, surface: SurfaceName): void {
    this.box("static", surface, 0.46, to - from, 0.46, x, from, z);
    this.box("static", "trim", 0.56, 0.1, 0.56, x, to, z);
    this.chimneys.push(new THREE.Vector3(x, to + 0.15, z));
  }

  /** A board with an icon; `hanging` signs swing from a bracket and sway in the wind. */
  sign(icon: IconName, x: number, y: number, z: number, rotY: number, hanging: boolean): void {
    const material = this.m.track(
      new THREE.MeshStandardMaterial({ map: this.signs[icon], roughness: 0.9 }),
    );
    const board = new THREE.Mesh(texturedBox(0.62, 0.62, 0.06), material);
    board.castShadow = true;
    if (!hanging) {
      board.position.set(x, y, z);
      board.rotation.y = rotY;
      this.extras.push(board);
      return;
    }
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    pivot.rotation.y = rotY;
    board.position.set(0, -0.42, 0);
    pivot.add(board);
    const chains = new THREE.Mesh(texturedBox(0.5, 0.1, 0.03), this.m.surface("iron"));
    chains.position.set(0, -0.08, 0);
    pivot.add(chains);
    this.extras.push(pivot);
    this.swingers.push({ object: pivot, amplitude: 0.12, phase: x * 0.7 + z });
    // The bracket the sign hangs from.
    this.box("static", "iron", 0.06, 0.06, 0.7, x, y, z - 0.3);
  }

  build(): BuildingModel {
    const { rect } = this.layout;
    const root = new THREE.Group();
    root.position.set(rect.x, 0, rect.y);
    const fadeParts: FadePart[] = [];
    for (const mesh of this.kit.build()) {
      const group = String(mesh.userData.group);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (group !== "static" && mesh.material instanceof THREE.MeshStandardMaterial) {
        const material = this.m.cloneFor(mesh.material);
        mesh.material = material;
        fadeParts.push({ mesh, group, material });
      }
      root.add(mesh);
    }
    for (const extra of this.extras) root.add(extra);
    const origin = new THREE.Vector3(rect.x, 0, rect.y);
    const world = (v: THREE.Vector3) => v.clone().add(origin);
    return {
      id: this.layout.id,
      root,
      fadeParts,
      lights: this.lights.map((light) => ({ ...light, x: light.x + rect.x, z: light.z + rect.y })),
      chimneys: this.chimneys.map(world),
      forge: this.forge ? world(this.forge) : null,
      spinners: this.spinners,
      swingers: this.swingers,
      prompt: new THREE.Vector3(
        this.layout.doorX,
        this.doorHeight + 0.75,
        this.layout.doorZ + 0.25,
      ),
      dustSpots: this.dust.map(world),
    };
  }
}

function home(b: Blueprint): void {
  const { W, D } = b;
  const m = 0.15;
  const height = 2;
  const rise = 1.3;
  const door = b.doorX - m;
  b.walls({
    x0: m,
    z0: m,
    x1: W - m,
    z1: D - m,
    base: 0,
    height,
    surface: "plaster",
    glass: "windowWarm",
    ridge: "x",
    rise,
    trim: "trim",
    shutters: "planks",
    windows: {
      s: [
        { at: 0.55, y: 0.75, width: 0.7, height: 0.75 },
        { at: W - 2 * m - 1.25, y: 0.75, width: 0.7, height: 0.75 },
      ],
      e: [{ at: 1.3, y: 0.8, width: 0.6, height: 0.7 }],
      w: [{ at: 1.3, y: 0.8, width: 0.6, height: 0.7 }],
      n: [
        { at: 0.9, y: 0.8, width: 0.6, height: 0.7 },
        { at: 3, y: 0.8, width: 0.6, height: 0.7 },
      ],
    },
    door: { at: door, width: 0.9, height: 1.45 },
  });
  // Half-timbering: corner posts and a top beam in dark wood.
  for (const [x, z] of [
    [m, m],
    [W - m, m],
    [m, D - m],
    [W - m, D - m],
  ] as const) {
    b.box("static", "darkPlanks", 0.2, height, 0.2, x, 0, z);
  }
  b.box("wall-s", "darkPlanks", W - 2 * m, 0.14, 0.06, W / 2, height - 0.14, D - m + 0.02);
  b.gableRoof(m, m, W - m, D - m, height, rise, 0.32, "roofClay", "x");
  b.chimney(W - 1.1, 1.25, 1.4, height + rise + 0.45, "brick");
  // Door canopy, flower boxes, a step and the sign.
  b.box("static", "roofShingle", 1.25, 0.08, 0.5, b.doorX, 1.62, D - m + 0.22);
  for (const x of [m + 0.9, W - m - 0.9]) {
    b.box("static", "planks", 0.8, 0.16, 0.2, x, 0.6, D - m + 0.1);
    b.box("static", "bush", 0.72, 0.14, 0.14, x, 0.76, D - m + 0.1);
  }
  b.box("static", "kerb", 1.15, 0.05, 0.4, b.doorX, 0, D - m + 0.2);
  b.sign("house", b.doorX + 0.95, 1.7, D - m + 0.32, 0, true);
  // Interior: floor, rug, bed, table and the hearth.
  b.box("static", "floor", W - 2 * m - 0.3, 0.04, D - 2 * m - 0.3, W / 2, 0, D / 2);
  b.box("static", "rug", 1.2, 0.02, 0.9, W / 2 - 0.2, 0.04, D / 2 + 0.3);
  b.box("static", "planks", 0.9, 0.35, 1.5, 0.85, 0, 1.15);
  b.box("static", "clothRed", 0.86, 0.06, 1.1, 0.85, 0.35, 1.3);
  b.box("static", "planks", 0.8, 0.55, 0.55, W / 2 + 0.2, 0, D / 2 - 0.3);
  b.box("static", "stone", 0.8, 0.8, 0.45, W - 1.1, 0, 0.55);
  b.box("static", b.m.emissive("forge"), 0.45, 0.28, 0.06, W - 1.1, 0.12, 0.79);
  b.light("window", 1.2, 1.1, D - m + 0.4);
  b.light("window", W - 1.2, 1.1, D - m + 0.4);
  b.light("fire", W - 1.1, 0.5, 1.1);
}

function workshop(b: Blueprint): void {
  const { W, D } = b;
  const m = 0.15;
  const barnX1 = W - 1.6;
  const height = 2.2;
  const rise = 1.45;
  b.walls({
    x0: m,
    z0: m,
    x1: barnX1,
    z1: D - m,
    base: 0,
    height,
    surface: "planks",
    glass: "windowWarm",
    ridge: "z",
    rise,
    trim: "darkPlanks",
    windows: {
      s: [{ at: 0.35, y: 0.9, width: 0.6, height: 0.6 }],
      w: [{ at: 1.4, y: 0.9, width: 0.7, height: 0.6 }],
      n: [{ at: 1.2, y: 0.9, width: 0.7, height: 0.6 }],
    },
    door: { at: b.doorX - m, width: 1.25, height: 1.7 },
  });
  b.gableRoof(m, m, barnX1, D - m, height, rise, 0.3, "roofShingle", "z");
  // A big gear on the gable, turning slowly.
  const gear = new THREE.Group();
  const gearGeometry = texturedCylinder(0.34, 0.34, 0.08, 12);
  gearGeometry.rotateX(Math.PI / 2);
  const iron = b.m.surface("iron");
  const wheel = new THREE.Mesh(gearGeometry, iron);
  wheel.castShadow = true;
  gear.add(wheel);
  for (let i = 0; i < 8; i += 1) {
    const tooth = new THREE.Mesh(texturedBox(0.12, 0.16, 0.08), iron);
    const angle = (i / 8) * Math.PI * 2;
    tooth.position.set(Math.cos(angle) * 0.38, Math.sin(angle) * 0.38, 0);
    tooth.rotation.z = angle + Math.PI / 2;
    tooth.castShadow = true;
    gear.add(tooth);
  }
  gear.position.set((m + barnX1) / 2, height + 0.62, D - m + 0.06);
  b.extras.push(gear);
  b.spinners.push({ object: gear, axis: "z", speed: 0.35 });
  // The open forge shed: posts, a lean-to roof, the forge, its chimney and an anvil.
  for (const z of [m + 0.15, D - m - 0.15]) {
    b.box("static", "darkPlanks", 0.16, 1.75, 0.16, W - m - 0.1, 0, z);
  }
  const shed = texturedBox(1.75, 0.1, D - 2 * m + 0.4);
  shed.rotateZ(-0.3);
  b.kit.add("static", b.m.surface("roofShingle"), shed, { x: W - 0.85, y: 2.0, z: D / 2 });
  b.box("static", "stone", 0.95, 0.85, 0.9, W - 0.85, 0, 1.35);
  b.box("static", b.m.emissive("forge"), 0.5, 0.32, 0.06, W - 0.85, 0.28, 1.81);
  b.chimney(W - 0.85, 1.1, 0.85, 3.1, "stone");
  b.box("static", "bark", 0.4, 0.35, 0.4, W - 0.8, 0, 2.75);
  b.box("static", "iron", 0.55, 0.2, 0.22, W - 0.8, 0.35, 2.75);
  b.forge = new THREE.Vector3(W - 0.85, 0.5, 1.9);
  b.box("static", "floor", barnX1 - m - 0.3, 0.04, D - 2 * m - 0.3, (m + barnX1) / 2, 0, D / 2);
  b.box("static", "planks", 1.4, 0.7, 0.55, 1.2, 0, 0.75);
  b.box("static", "iron", 0.3, 0.12, 0.3, 1.0, 0.7, 0.75);
  b.sign("gear", m + 0.55, 1.75, D - m + 0.3, 0, true);
  b.light("forge", W - 0.85, 0.7, 2.15);
  b.light("window", m + 0.65, 1.2, D - m + 0.4);
}

function library(b: Blueprint): void {
  const { W, D } = b;
  const m = 0.15;
  const front = D - 0.85;
  const height = 3;
  b.walls({
    x0: m,
    z0: m,
    x1: W - m,
    z1: front,
    base: 0,
    height,
    surface: "stone",
    glass: "windowWarm",
    ridge: null,
    rise: 0,
    trim: "kerb",
    windows: {
      s: [
        { at: 0.45, y: 0.9, width: 0.6, height: 1.4 },
        { at: W - 2 * m - 1.05, y: 0.9, width: 0.6, height: 1.4 },
      ],
      e: [
        { at: 0.6, y: 0.9, width: 0.55, height: 1.3 },
        { at: 2.2, y: 0.9, width: 0.55, height: 1.3 },
      ],
      w: [
        { at: 0.6, y: 0.9, width: 0.55, height: 1.3 },
        { at: 2.2, y: 0.9, width: 0.55, height: 1.3 },
      ],
      n: [
        { at: 1.2, y: 1, width: 0.55, height: 1.2 },
        { at: 3, y: 1, width: 0.55, height: 1.2 },
      ],
    },
    door: { at: b.doorX - m, width: 1.05, height: 1.85 },
  });
  // Cornice, hip roof and a little clock turret.
  b.box("roof", "kerb", W - 2 * m + 0.3, 0.16, front - m + 0.3, W / 2, height, (m + front) / 2);
  b.kit.add("roof", b.m.surface("roofSlate"), pyramid(W - 2 * m + 0.2, front - m + 0.2, 1.35), {
    x: W / 2,
    y: height + 0.16,
    z: (m + front) / 2,
  });
  b.box("roof", "stone", 0.8, 0.75, 0.8, W / 2, height + 0.75, (m + front) / 2);
  b.kit.add("roof", b.m.surface("roofSlate"), pyramid(1.05, 1.05, 0.7), {
    x: W / 2,
    y: height + 1.5,
    z: (m + front) / 2,
  });
  b.box("roof", "plaster", 0.42, 0.42, 0.04, W / 2, height + 0.92, (m + front) / 2 + 0.41);
  // The portico: a raised floor, four columns and a pediment.
  b.box("static", "kerb", W - 2 * m, 0.14, D - front - m + 0.05, W / 2, 0, (front + D - m) / 2);
  const pediment = wallShape(W - 2 * m, 0.22, 0.6, [], 0.55);
  b.kit.add("wall-s", b.m.surface("kerb"), pediment, { x: m, y: 2.45, z: front });
  for (const x of [m + 0.3, m + 1.25, W - m - 1.25, W - m - 0.3]) {
    b.kit.add("static", b.m.surface("kerb"), texturedCylinder(0.13, 0.15, 2.32, 8), {
      x,
      y: 0.14 + 1.16,
      z: D - m - 0.25,
    });
  }
  // Banners on the facade.
  for (const x of [m + 0.2, W - m - 0.2]) {
    const banner = texturedBox(0.34, 0.95, 0.03);
    banner.translate(0, -0.48, 0);
    b.kit.add("wall-s", b.m.surface("clothViolet"), banner, { x, y: 2.75, z: front + 0.05 });
  }
  // Shelves of books and a reading desk with a lamp.
  b.box("static", "floor", W - 2 * m - 0.3, 0.04, front - m - 0.3, W / 2, 0, (m + front) / 2);
  for (const x of [0.75, 1.75, 3.25, 4.25])
    b.box("static", "books", 0.9, 1.7, 0.32, x, 0, m + 0.35);
  b.box("static", "books", 0.32, 1.7, 1.6, m + 0.35, 0, 2);
  b.box("static", "planks", 1.2, 0.6, 0.6, W / 2, 0, 2.3);
  b.box("static", b.m.emissive("lamp"), 0.14, 0.18, 0.14, W / 2 + 0.35, 0.6, 2.3);
  b.sign("book", W / 2, 2.25, D - m - 0.1, 0, false);
  b.light("window", 1.05, 1.5, front + 0.6);
  b.light("window", W - 1.05, 1.5, front + 0.6);
  b.light("lantern", W / 2 + 0.35, 0.95, 2.3);
  b.dust.push(
    new THREE.Vector3(1.05, 1.2, front + 0.55),
    new THREE.Vector3(W - 1.05, 1.2, front + 0.55),
  );
}

function ailab(b: Blueprint): void {
  const { W, D } = b;
  const m = 0.2;
  const base = 0.3;
  const height = 2.35;
  b.box("static", "stone", W - 2 * m + 0.2, base, D - 2 * m + 0.2, W / 2, 0, D / 2);
  b.walls({
    x0: m,
    z0: m,
    x1: W - m,
    z1: D - m,
    base,
    height,
    surface: "metal",
    glass: "windowCool",
    ridge: null,
    rise: 0,
    trim: "iron",
    windows: {
      s: [
        { at: 0.3, y: 0.8, width: 1.3, height: 0.9 },
        { at: W - 2 * m - 1.6, y: 0.8, width: 1.3, height: 0.9 },
      ],
      e: [{ at: 0.6, y: 0.8, width: 2.8, height: 0.8 }],
      w: [{ at: 0.6, y: 0.8, width: 2.8, height: 0.8 }],
    },
    door: { at: b.doorX - m, width: 1, height: 1.65 },
  });
  const top = base + height;
  b.box("roof", "roofMetal", W - 2 * m + 0.16, 0.14, D - 2 * m + 0.16, W / 2, top, D / 2);
  for (const [w, d, x, z] of [
    [W - 2 * m + 0.16, 0.1, W / 2, m - 0.03],
    [W - 2 * m + 0.16, 0.1, W / 2, D - m + 0.03],
    [0.1, D - 2 * m + 0.16, m - 0.03, D / 2],
    [0.1, D - 2 * m + 0.16, W - m + 0.03, D / 2],
  ] as const) {
    b.box("roof", "metal", w, 0.28, d, x, top + 0.14, z);
  }
  // The satellite dish turns on the roof; the mast blinks.
  const dish = new THREE.Group();
  dish.position.set(W - 1.35, top + 0.14, 1.5);
  const metal = b.m.surface("metal");
  const pedestal = new THREE.Mesh(texturedCylinder(0.12, 0.2, 0.5, 8), metal);
  pedestal.position.y = 0.25;
  const bowlPoints = Array.from(
    { length: 7 },
    (_, i) => new THREE.Vector2(0.05 + i * 0.1, i * i * 0.012),
  );
  const bowl = new THREE.Mesh(new THREE.LatheGeometry(bowlPoints, 12), metal);
  bowl.material = b.m.track(metal.clone());
  (bowl.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  bowl.rotation.x = -0.9;
  bowl.position.y = 0.62;
  const feed = new THREE.Mesh(texturedCylinder(0.025, 0.025, 0.5, 4), b.m.surface("iron"));
  feed.position.set(0, 0.8, 0.2);
  feed.rotation.x = 0.68;
  for (const part of [pedestal, bowl, feed]) {
    part.castShadow = true;
    dish.add(part);
  }
  b.extras.push(dish);
  b.spinners.push({ object: dish, axis: "y", speed: 0.3 });
  b.kit.add("static", b.m.surface("iron"), texturedCylinder(0.04, 0.05, 1.6, 6), {
    x: m + 0.5,
    y: top + 0.14 + 0.8,
    z: m + 0.5,
  });
  b.box("static", "rack", 1.2, 0.08, 0.8, m + 1.3, top + 0.3, D - m - 0.7, 0.2);
  // Inside: server racks with blinking lights and a desk with two monitors.
  b.box("static", "floor", W - 2 * m - 0.3, 0.04, D - 2 * m - 0.3, W / 2, base, D / 2);
  const ledPositions: THREE.Vector3[] = [new THREE.Vector3(m + 0.5, top + 0.14 + 1.62, m + 0.5)];
  for (const x of [0.75, 1.55, 2.35]) {
    b.box("static", "rack", 0.62, 1.7, 0.5, x, base, m + 0.4);
    for (let row = 0; row < 5; row += 1) {
      for (const dx of [-0.16, 0.12])
        ledPositions.push(new THREE.Vector3(x + dx, base + 0.3 + row * 0.28, m + 0.66));
    }
  }
  b.box("static", "planks", 1.6, 0.62, 0.6, W - 1.45, base, D / 2 + 0.6);
  for (const dx of [-0.4, 0.4]) {
    b.box(
      "static",
      b.m.emissive("screen"),
      0.62,
      0.42,
      0.05,
      W - 1.45 + dx,
      base + 0.66,
      D / 2 + 0.45,
      0,
    );
  }
  const leds = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.06, 0.06, 0.03),
    b.m.led,
    ledPositions.length,
  );
  const matrix = new THREE.Matrix4();
  const palette = [
    new THREE.Color(0.3, 1.6, 1.4),
    new THREE.Color(0.8, 1.8, 0.4),
    new THREE.Color(1.8, 0.5, 0.3),
  ];
  ledPositions.forEach((position, i) => {
    leds.setMatrixAt(i, matrix.makeTranslation(position.x, position.y, position.z));
    leds.setColorAt(
      i,
      i === 0
        ? new THREE.Color(2.2, 0.4, 0.3)
        : (palette[i % palette.length] ?? new THREE.Color(1, 1, 1)),
    );
  });
  b.extras.push(leds);
  b.sign("chip", b.doorX, base + 1.95, D - m + 0.05, 0, false);
  b.light("monitor", W - 1.45, base + 1, D / 2 + 0.9);
  b.light("monitor", 1.5, base + 1, m + 1.2);
  b.doorHeight = 1.95;
}

function inn(b: Blueprint): void {
  const { W, D } = b;
  const m = 0.15;
  const ground = 1.6;
  const upper = 1.45;
  const rise = 1.7;
  b.walls({
    x0: m,
    z0: m,
    x1: W - m,
    z1: D - m,
    base: 0,
    height: ground,
    surface: "stone",
    glass: "windowWarm",
    ridge: null,
    rise: 0,
    trim: "trim",
    windows: {
      s: [
        { at: 0.4, y: 0.65, width: 0.75, height: 0.65 },
        { at: W - 2 * m - 1.15, y: 0.65, width: 0.75, height: 0.65 },
      ],
      e: [{ at: 1.2, y: 0.65, width: 0.7, height: 0.65 }],
      w: [{ at: 1.2, y: 0.65, width: 0.7, height: 0.65 }],
    },
    door: { at: b.doorX - m, width: 0.95, height: 1.4 },
  });
  b.walls({
    x0: m - 0.05,
    z0: m,
    x1: W - m + 0.05,
    z1: D - m + 0.12,
    base: ground,
    height: upper,
    surface: "plaster",
    glass: "windowWarm",
    ridge: "z",
    rise,
    trim: "darkPlanks",
    windows: {
      s: [
        { at: 0.8, y: 0.45, width: 0.6, height: 0.6 },
        { at: W - 2 * m - 1.3, y: 0.45, width: 0.6, height: 0.6 },
        { at: (W - 2 * m) / 2 - 0.25, y: 1.65, width: 0.5, height: 0.45 },
      ],
      e: [{ at: 1.3, y: 0.45, width: 0.6, height: 0.6 }],
      w: [{ at: 1.3, y: 0.45, width: 0.6, height: 0.6 }],
    },
  });
  // Timber frame on the upper storey and the jetty beam.
  b.box("wall-s", "darkPlanks", W - 2 * m + 0.2, 0.16, 0.08, W / 2, ground - 0.08, D - m + 0.16);
  for (const x of [m, m + 1.5, W - m - 1.5, W - m]) {
    b.box("wall-s", "darkPlanks", 0.14, upper, 0.06, x, ground, D - m + 0.15);
  }
  b.gableRoof(
    m - 0.05,
    m,
    W - m + 0.05,
    D - m + 0.12,
    ground + upper,
    rise,
    0.35,
    "roofThatch",
    "z",
  );
  b.chimney(m + 0.75, 1.6, 2.4, ground + upper + rise + 0.2, "stone");
  // Lanterns either side of the door and the hanging sign.
  for (const dir of [-1, 1]) {
    const x = b.doorX + dir * 0.75;
    b.box("static", "iron", 0.06, 0.06, 0.24, x, 1.32, D - m + 0.1);
    b.box("static", b.m.emissive("lamp"), 0.16, 0.22, 0.16, x, 1.12, D - m + 0.22);
    b.light("lantern", x, 1.2, D - m + 0.45);
  }
  b.sign("envelope", b.doorX + 1.45, 1.55, D - m + 0.62, 0, true);
  // Bar counter, stools and the hearth.
  b.box("static", "floor", W - 2 * m - 0.3, 0.04, D - 2 * m - 0.3, W / 2, 0, D / 2);
  b.box("static", "planks", 2.4, 0.75, 0.45, W / 2 - 0.3, 0, 1.2);
  for (const x of [1.4, 2.1, 2.8])
    b.kit.add("static", b.m.surface("bark"), texturedCylinder(0.13, 0.13, 0.45, 6), {
      x,
      y: 0.225,
      z: 1.8,
    });
  b.box("static", "stone", 0.9, 0.85, 0.45, W - 0.9, 0, 0.55);
  b.box("static", b.m.emissive("forge"), 0.5, 0.3, 0.06, W - 0.9, 0.12, 0.79);
  b.light("window", 1.0, 1.0, D - m + 0.4);
  b.light("window", W - 1.0, 1.0, D - m + 0.4);
  b.light("fire", W - 0.9, 0.5, 1.1);
}

function mailbox(b: Blueprint): void {
  b.box("static", "planks", 0.12, 1, 0.12, 0.5, 0, 0.55);
  b.box("static", "brick", 0.46, 0.34, 0.32, 0.5, 1, 0.55);
  b.box("static", "roofClay", 0.54, 0.06, 0.4, 0.5, 1.34, 0.55);
  b.box("static", "iron", 0.04, 0.3, 0.04, 0.76, 1.05, 0.5);
  b.box("static", b.m.surface("clothRed"), 0.02, 0.12, 0.16, 0.77, 1.25, 0.58);
  b.doorHeight = 1.0;
}

const BLUEPRINTS: Record<BuildingId, (b: Blueprint) => void> = {
  home,
  workshop,
  library,
  ailab,
  inn,
  mailbox,
};

export function buildBuilding(
  layout: BuildingLayout,
  materials: MaterialLibrary,
  signs: Record<IconName, THREE.Texture>,
): BuildingModel {
  const blueprint = new Blueprint(layout, materials, signs);
  BLUEPRINTS[layout.id](blueprint);
  return blueprint.build();
}

/** Frees the geometry of a building model (materials and textures are owned elsewhere). */
export function disposeBuilding(model: BuildingModel): void {
  model.root.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.InstancedMesh) {
      object.geometry.dispose();
    }
  });
}
