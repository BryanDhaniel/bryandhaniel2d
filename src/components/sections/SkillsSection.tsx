import { portfolio, type SkillGroup } from "@/content/portfolio";
import { Chip } from "./shared";

const GROUP_ACCENT: Record<SkillGroup["id"], string> = {
  mobile: "bg-sky",
  web: "bg-sun",
  "ai-ml": "bg-violet",
  tools: "bg-lime",
};

export function SkillsSection() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {portfolio.skills.map((group) => {
        const headingId = `skills-${group.id}`;
        return (
          <section
            key={group.id}
            aria-labelledby={headingId}
            className="border-2 border-ink bg-wheat shadow-pixel-sm"
          >
            <h3
              id={headingId}
              className="flex items-center gap-2 border-b-2 border-ink px-3 py-2 text-lg font-bold"
            >
              <span
                aria-hidden="true"
                className={`size-3 border-2 border-ink ${GROUP_ACCENT[group.id]}`}
              />
              {group.label}
            </h3>
            <ul className="flex flex-wrap gap-2 p-3">
              {group.skills.map((skill) => (
                <li key={skill}>
                  <Chip>{skill}</Chip>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
