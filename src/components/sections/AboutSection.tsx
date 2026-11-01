import { portfolio } from "@/content/portfolio";
import { PixelIcon } from "@/components/PixelIcon";
import { Chip } from "./shared";

export function AboutSection() {
  const { profile } = portfolio;
  return (
    <div className="space-y-5">
      <div className="space-y-3 text-lg leading-relaxed">
        {profile.bio.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
      <dl className="grid gap-4 sm:grid-cols-2">
        <div className="border-2 border-ink bg-wheat p-3">
          <dt className="text-sm tracking-wide text-slate uppercase">Based in</dt>
          <dd className="mt-1 flex items-center gap-2 text-lg">
            <PixelIcon name="pin" size={20} />
            {profile.location}
          </dd>
        </div>
        <div className="border-2 border-ink bg-wheat p-3">
          <dt className="text-sm tracking-wide text-slate uppercase">Roles I&apos;m targeting</dt>
          <dd className="mt-2 flex flex-wrap gap-2">
            {profile.roles.map((role) => (
              <Chip key={role}>{role}</Chip>
            ))}
          </dd>
        </div>
      </dl>
    </div>
  );
}
