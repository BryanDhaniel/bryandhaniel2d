/**
 * Every piece of portfolio content lives here. The village panels, the /plain page, the
 * metadata and the JSON-LD all read from this file, so editing it updates the whole site.
 *
 * Optional link fields (github, demo, linkedin, email, cvUrl, siteUrl) render only when set.
 */

export type SectionId = "about" | "projects" | "education" | "skills" | "contact";

export interface Profile {
  name: string;
  alias: string;
  roles: string[];
  location: string;
  tagline: string;
  bio: string[];
  /** Public site URL, e.g. "https://kiznaiver.dev". Falls back to the Vercel URL when unset. */
  siteUrl?: string;
}

export interface Project {
  id: string;
  name: string;
  summary: string;
  stack: string[];
  role: string;
  github?: string;
  demo?: string;
}

export type TimelineKind = "education" | "research" | "internship";

export interface TimelineEntry {
  id: string;
  kind: TimelineKind;
  title: string;
  organization: string;
  /** "YYYY" or "YYYY-MM", e.g. "2025-02". */
  start: string;
  /** "YYYY" or "YYYY-MM". */
  end: string;
  description?: string;
}

export interface SkillGroup {
  id: "mobile" | "web" | "ai-ml" | "tools";
  label: string;
  skills: string[];
}

export interface Contact {
  email?: string;
  github?: string;
  linkedin?: string;
  /** A path in /public (e.g. "/cv.pdf") or an absolute URL. */
  cvUrl?: string;
}

export interface SectionMeta {
  id: SectionId;
  title: string;
  building: string;
  summary: string;
}

export interface Portfolio {
  profile: Profile;
  sections: SectionMeta[];
  projects: Project[];
  timeline: TimelineEntry[];
  skills: SkillGroup[];
  contact: Contact;
}

export const portfolio: Portfolio = {
  profile: {
    name: "Bryan Dhaniel",
    alias: "Kiznaiver",
    roles: ["Software Engineer", "AI/ML Engineer"],
    location: "Bandung, Indonesia",
    tagline: "Software Engineer and AI/ML Engineer building apps and models from Bandung.",
    bio: [
      "I'm Bryan Dhaniel, also known as Kiznaiver: a Computer Science student at Telkom University in Bandung, Indonesia.",
      "I build cross-platform products with Flutter and Next.js, and I work on machine learning for image classification, audio classification, retrieval-augmented generation and multi-agent systems.",
      "I'm looking for roles as a Software Engineer or an AI/ML Engineer.",
    ],
  },

  sections: [
    {
      id: "about",
      title: "About",
      building: "Home",
      summary: "Who I am and the roles I'm aiming for.",
    },
    {
      id: "projects",
      title: "Projects",
      building: "Workshop",
      summary: "Things I've designed and built.",
    },
    {
      id: "education",
      title: "Education & Research",
      building: "Library",
      summary: "Where I've studied, researched and interned.",
    },
    {
      id: "skills",
      title: "Skills",
      building: "AI Lab",
      summary: "The tools and techniques I work with.",
    },
    {
      id: "contact",
      title: "Contact",
      building: "Inn",
      summary: "How to reach me.",
    },
  ],

  projects: [
    {
      id: "soulchess",
      name: "SoulChess",
      summary: "A chess variant that runs in the browser.",
      stack: ["Next.js", "TypeScript"],
      role: "Developer",
    },
    {
      id: "dendron",
      name: "Dendron",
      summary: "A tree rental platform.",
      stack: ["Flutter"],
      role: "Developer",
    },
    {
      id: "indokerja",
      name: "IndoKerja",
      summary: "A job and recruitment mobile app.",
      stack: ["Flutter"],
      role: "Full Stack Developer and sole mobile developer",
    },
    {
      id: "skin-cancer-detection",
      name: "Skin Cancer Detection",
      summary:
        "A DenseNet skin-lesion classifier served through a MERN web platform and a Flutter mobile app.",
      stack: ["DenseNet", "MongoDB", "Express", "React", "Node.js", "Flutter"],
      role: "Developer",
    },
    {
      id: "voice-emotion-bullying",
      name: "Voice Emotion & Bullying Detection",
      summary: "A web app that detects emotion and signs of bullying in voice audio.",
      stack: ["Next.js", "Web Audio API", "Audio classification", "REST APIs"],
      role: "Developer",
    },
    {
      id: "opendebate",
      name: "OpenDebate",
      summary: "A multi-agent AI system that stages debates between AI agents.",
      stack: ["Multi-agent systems", "LLM agents"],
      role: "Developer",
    },
    {
      id: "kaggriculture",
      name: "Kaggriculture Agent",
      summary: "A bot that plays the economy of a farming simulation on Kaggle.",
      stack: ["Kaggle", "Game AI agents"],
      role: "Developer",
    },
  ],

  timeline: [
    {
      id: "telkom-bs-cs",
      kind: "education",
      title: "BS Computer Science",
      organization: "Telkom University",
      start: "2022",
      end: "2026",
    },
    {
      id: "humic-researchship",
      kind: "research",
      title: "Researchship",
      organization: "HUMIC, Telkom University",
      start: "2025-02",
      end: "2025-06",
    },
    {
      id: "brin-internship",
      kind: "internship",
      title: "Internship",
      organization: "BRIN (National Research and Innovation Agency)",
      start: "2025-07",
      end: "2025-09",
    },
  ],

  skills: [
    {
      id: "mobile",
      label: "Mobile",
      skills: ["Flutter"],
    },
    {
      id: "web",
      label: "Web",
      skills: ["Next.js", "TypeScript", "Tailwind CSS", "React", "Node.js", "Express", "MongoDB"],
    },
    {
      id: "ai-ml",
      label: "AI / ML",
      skills: [
        "Image classification",
        "Audio classification",
        "Retrieval-augmented generation (RAG)",
        "Multi-agent systems",
      ],
    },
    {
      id: "tools",
      label: "Tools",
      skills: ["Git & GitHub", "REST APIs", "Web Audio API", "Kaggle", "Vercel"],
    },
  ],

  contact: {},
};

export function getSection(id: SectionId): SectionMeta {
  const section = portfolio.sections.find((entry) => entry.id === id);
  if (!section) {
    throw new Error(`Unknown portfolio section: ${id}`);
  }
  return section;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** "2025-02" -> "Feb 2025"; a bare year is returned as-is. */
export function formatYearMonth(value: string): string {
  const [year, month] = value.split("-");
  const monthIndex = Number(month) - 1;
  const label = MONTHS[monthIndex];
  return label ? `${label} ${year}` : value;
}

export function formatRange(entry: Pick<TimelineEntry, "start" | "end">): string {
  return `${formatYearMonth(entry.start)} – ${formatYearMonth(entry.end)}`;
}

export function hasAnyContact(contact: Contact): boolean {
  return Boolean(contact.email || contact.github || contact.linkedin || contact.cvUrl);
}
