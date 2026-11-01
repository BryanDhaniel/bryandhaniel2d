import type { AtlasGroup } from "@/game/assets/manifest";
import type { SpriteDef } from "./atlas";
import { buildingSprites } from "./buildings";
import {
  CHARACTER_LOOKS,
  FACINGS,
  WALK_FRAMES,
  characterFrame,
  type CharacterId,
  type Facing,
} from "./characters";
import { catSprites, propSprites } from "./props";

export function characterFrameName(
  id: CharacterId,
  facing: Facing,
  frame: number | "blink",
): string {
  return `${id}/${facing}/${frame}`;
}

function humanoidSprites(): SpriteDef[] {
  const defs: SpriteDef[] = [];
  for (const id of Object.keys(CHARACTER_LOOKS) as CharacterId[]) {
    const look = CHARACTER_LOOKS[id];
    for (const facing of FACINGS) {
      const flipX = facing === "left";
      for (let frame = 0; frame < WALK_FRAMES; frame += 1) {
        const art = characterFrame(look, facing, frame);
        defs.push({
          name: characterFrameName(id, facing, frame),
          width: 16,
          height: 16,
          paint: (p) => p.art(art, 0, 0, { roles: look.roles, flipX }),
        });
      }
      const blink = characterFrame(look, facing, 0, true);
      defs.push({
        name: characterFrameName(id, facing, "blink"),
        width: 16,
        height: 16,
        paint: (p) => p.art(blink, 0, 0, { roles: look.roles, flipX }),
      });
    }
  }
  return defs;
}

/** The generated sprites for each atlas group. Frame names are the swap-in contract. */
export const ATLAS_SPRITES: Record<AtlasGroup, () => SpriteDef[]> = {
  characters: () => [...humanoidSprites(), ...catSprites()],
  buildings: buildingSprites,
  props: propSprites,
};
