import type { SectionId } from "@/content/portfolio";
import { AboutSection } from "./AboutSection";
import { ContactSection } from "./ContactSection";
import { ProjectsSection } from "./ProjectsSection";
import { SkillsSection } from "./SkillsSection";
import { TimelineSection } from "./TimelineSection";

export { SECTION_ICONS } from "./shared";

/** Renders a section's body. Used by both the village panels and the /plain page. */
export function SectionContent({ id }: { id: SectionId }) {
  switch (id) {
    case "about":
      return <AboutSection />;
    case "projects":
      return <ProjectsSection />;
    case "education":
      return <TimelineSection />;
    case "skills":
      return <SkillsSection />;
    case "contact":
      return <ContactSection />;
  }
}
