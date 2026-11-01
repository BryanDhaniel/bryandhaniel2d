import { portfolio } from "@/content/portfolio";
import { Chip, PixelLink } from "./shared";

export function ProjectsSection() {
  return (
    <ul className="grid gap-4 md:grid-cols-2">
      {portfolio.projects.map((project) => {
        const headingId = `project-${project.id}`;
        return (
          <li key={project.id} className="flex">
            <article
              aria-labelledby={headingId}
              className="flex w-full flex-col gap-3 border-2 border-ink bg-wheat p-4 shadow-pixel-sm"
            >
              <h3 id={headingId} className="text-xl leading-tight font-bold">
                {project.name}
              </h3>
              <p className="leading-relaxed">{project.summary}</p>
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="tracking-wide text-slate uppercase">Role</dt>
                  <dd className="text-base">{project.role}</dd>
                </div>
                <div>
                  <dt className="tracking-wide text-slate uppercase">Stack</dt>
                  <dd className="mt-1 flex flex-wrap gap-1.5">
                    {project.stack.map((tech) => (
                      <Chip key={tech}>{tech}</Chip>
                    ))}
                  </dd>
                </div>
              </dl>
              {project.github || project.demo ? (
                <div className="mt-auto flex flex-wrap gap-3 pt-1">
                  {project.github ? (
                    <PixelLink
                      href={project.github}
                      icon="code"
                      aria-label={`${project.name} source code`}
                    >
                      Code
                    </PixelLink>
                  ) : null}
                  {project.demo ? (
                    <PixelLink
                      href={project.demo}
                      icon="link"
                      variant="primary"
                      aria-label={`${project.name} live demo`}
                    >
                      Live demo
                    </PixelLink>
                  ) : null}
                </div>
              ) : null}
            </article>
          </li>
        );
      })}
    </ul>
  );
}
