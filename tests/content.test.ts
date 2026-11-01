import { describe, expect, it } from "vitest";
import { formatRange, formatYearMonth, portfolio, type SectionId } from "@/content/portfolio";
import { personJsonLd, serializeJsonLd } from "@/lib/site";

const SECTION_IDS: SectionId[] = ["about", "projects", "education", "skills", "contact"];

function expectOptionalUrl(value: string | undefined, label: string) {
  if (value === undefined) return;
  expect(() => new URL(value, "https://example.com"), label).not.toThrow();
  expect(value.trim(), label).not.toBe("");
}

describe("portfolio content", () => {
  it("defines each section once", () => {
    expect(portfolio.sections.map((section) => section.id)).toEqual(SECTION_IDS);
  });

  it("has complete project cards", () => {
    const ids = new Set<string>();
    for (const project of portfolio.projects) {
      expect(ids.has(project.id)).toBe(false);
      ids.add(project.id);
      expect(project.name).not.toBe("");
      expect(project.summary).not.toBe("");
      expect(project.role).not.toBe("");
      expect(project.stack.length).toBeGreaterThan(0);
      expectOptionalUrl(project.github, `${project.id}.github`);
      expectOptionalUrl(project.demo, `${project.id}.demo`);
    }
  });

  it("only uses well-formed optional links", () => {
    const { contact } = portfolio;
    expectOptionalUrl(contact.github, "contact.github");
    expectOptionalUrl(contact.linkedin, "contact.linkedin");
    expectOptionalUrl(contact.cvUrl, "contact.cvUrl");
    if (contact.email) {
      expect(contact.email).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/);
    }
  });

  it("formats timeline dates", () => {
    expect(formatYearMonth("2025-02")).toBe("Feb 2025");
    expect(formatYearMonth("2022")).toBe("2022");
    expect(formatRange({ start: "2025-07", end: "2025-09" })).toBe("Jul 2025 – Sep 2025");
  });
});

describe("structured data", () => {
  it("describes a Person and omits unset links", () => {
    const data = personJsonLd();
    expect(data["@type"]).toBe("Person");
    expect(data.name).toBe(portfolio.profile.name);
    expect(data.address.addressLocality).toBe("Bandung");
    if (!portfolio.contact.github && !portfolio.contact.linkedin) {
      expect(data.sameAs).toBeUndefined();
    }
  });

  it("escapes < so the script tag cannot be closed early", () => {
    expect(serializeJsonLd({ text: "</script>" })).not.toContain("</script>");
  });
});
