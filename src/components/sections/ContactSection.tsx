import { hasAnyContact, portfolio } from "@/content/portfolio";
import { PixelIcon } from "@/components/PixelIcon";
import { PixelLink } from "./shared";

export function ContactSection() {
  const { contact, profile } = portfolio;
  return (
    <div className="space-y-5">
      <p className="text-lg leading-relaxed">
        Open to {profile.roles.join(" and ")} roles. I&apos;m based in {profile.location}.
      </p>
      {hasAnyContact(contact) ? (
        <ul className="flex flex-wrap gap-3">
          {contact.email ? (
            <li>
              <PixelLink href={`mailto:${contact.email}`} icon="envelope" variant="primary">
                {contact.email}
              </PixelLink>
            </li>
          ) : null}
          {contact.github ? (
            <li>
              <PixelLink href={contact.github} icon="code">
                GitHub
              </PixelLink>
            </li>
          ) : null}
          {contact.linkedin ? (
            <li>
              <PixelLink href={contact.linkedin} icon="link">
                LinkedIn
              </PixelLink>
            </li>
          ) : null}
          {contact.cvUrl ? (
            <li>
              <PixelLink href={contact.cvUrl} icon="download" download>
                Download CV
              </PixelLink>
            </li>
          ) : null}
        </ul>
      ) : (
        <p className="flex items-center gap-2 border-2 border-ink bg-wheat p-3">
          <PixelIcon name="pin" size={20} />
          Contact links haven&apos;t been published yet.
        </p>
      )}
    </div>
  );
}
