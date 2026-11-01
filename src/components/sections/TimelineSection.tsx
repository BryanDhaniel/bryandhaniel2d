import { formatRange, portfolio, type TimelineKind } from "@/content/portfolio";

const KIND_LABEL: Record<TimelineKind, string> = {
  education: "Education",
  research: "Research",
  internship: "Internship",
};

const KIND_MARKER: Record<TimelineKind, string> = {
  education: "bg-water",
  research: "bg-violet",
  internship: "bg-sun",
};

export function TimelineSection() {
  const entries = [...portfolio.timeline].sort((a, b) => b.start.localeCompare(a.start));
  return (
    <ol className="relative ml-3 space-y-6 border-l-4 border-ink pl-6">
      {entries.map((entry) => (
        <li key={entry.id} className="relative">
          <span
            aria-hidden="true"
            className={`absolute top-1.5 -left-[38px] size-5 border-4 border-ink ${KIND_MARKER[entry.kind]}`}
          />
          <p className="text-sm tracking-wide text-slate uppercase">
            <time dateTime={entry.start}>{formatRange(entry)}</time>
            <span aria-hidden="true"> · </span>
            <span>{KIND_LABEL[entry.kind]}</span>
          </p>
          <h3 className="mt-1 text-xl leading-tight font-bold">{entry.title}</h3>
          <p className="text-lg">{entry.organization}</p>
          {entry.description ? <p className="mt-2 leading-relaxed">{entry.description}</p> : null}
        </li>
      ))}
    </ol>
  );
}
