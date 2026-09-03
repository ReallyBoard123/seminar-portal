import { ExternalLink, FileText, PenLine } from "lucide-react";

import { cn } from "@/lib/utils";
import { currentParticipant } from "../lib/auth";
import { readConfig } from "../lib/config";
import { CANVASES, FORMAT_KEYS, type CanvasDefinition, type FormatKey } from "../lib/types";

import { PortalNav } from "../components/PortalNav";

/**
 * Everything that helps you write, in one place: the canvases (any format's,
 * not just your own), the official templates, and the papers the seminar's
 * process is built on. Nothing here is a deliverable — deliverables live on
 * the "My submissions" page.
 */

// The literature the portal cites elsewhere, gathered as a reading list.
const READINGS: { label: string; url: string; note: string }[] = [
  {
    label: "Van de Ven (2007) — Engaged Scholarship",
    url: "https://doi.org/10.1093/oso/9780199226290.001.0001",
    note: "Where the discussant criteria come from.",
  },
  {
    label: "Pang & Thatcher (2023) — Well-crafted revisions",
    url: "https://doi.org/10.17705/1jais.00797",
    note: "The guide the revision phase follows: respond to each comment, point by point.",
  },
  {
    label: "Rogers et al. (2026) — Responding to reviewers",
    url: "https://doi.org/10.5465/amr.2026.0147",
    note: "Companion piece on writing the response letter itself.",
  },
  {
    label: "Faff (2015) — Pitching Research",
    url: "https://doi.org/10.1111/acfi.12116",
    note: "The paper behind the Idea Talk canvas.",
  },
  {
    label: "Emerald — How to write an article abstract",
    url: "https://www.emeraldgrouppublishing.com/how-to/authoring-editing-reviewing/write-article-abstract",
    note: "The structured-abstract headings the Proposal and Journal Paper canvases use.",
  },
];

export default async function SeminarResourcesPage() {
  const [config, viewer] = await Promise.all([readConfig(), currentParticipant()]);

  // Group formats sharing one definition (Proposal + Journal Paper share the
  // Emerald canvas) into a single card.
  const canvasCards: { definition: CanvasDefinition; formats: FormatKey[] }[] = [];
  for (const key of FORMAT_KEYS) {
    const definition = CANVASES[key];
    if (!definition) continue;
    const existing = canvasCards.find((c) => c.definition === definition);
    if (existing) existing.formats.push(key);
    else canvasCards.push({ definition, formats: [key] });
  }
  const formatLabel = (key: FormatKey) => config.formats.find((f) => f.key === key)?.label ?? key;

  return (
    <main className="min-h-screen">
      <PortalNav active="/resources" signedInAs={viewer?.name} isOrganizer={viewer?.isOrganizer || viewer?.isAdmin} />
      <div className="mx-auto max-w-4xl px-6 py-8 sm:px-12">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Resources</h1>
          <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
            The canvases, templates and readings behind the seminar. All of it is open to everyone —
            use whichever helps, whatever your format.
          </p>
        </header>

        <section className="mt-10">
          <h2 className="text-muted-foreground mb-4 border-b border-border/60 pb-1.5 text-xs font-semibold tracking-wide uppercase">
            Canvases
          </h2>
          <div className="space-y-4">
            {canvasCards.map(({ definition, formats }) => {
              const mine = viewer?.format !== "" && formats.includes(viewer?.format as FormatKey);
              return (
                <a
                  key={definition.title}
                  href={`/resources/canvas?format=${mine ? viewer?.format : formats[0]}`}
                  className={cn(
                    "border-border/60 bg-card block rounded-xl border p-5 transition-colors hover:border-foreground/30",
                    mine &&
                      "bg-[oklch(0.97_0.02_240)] ring-1 ring-[oklch(0.62_0.11_240)]/45 dark:bg-[oklch(0.28_0.04_240)]",
                  )}
                >
                  {mine && (
                    <span className="text-[11px] font-semibold tracking-wide text-[oklch(0.45_0.11_240)] uppercase dark:text-[oklch(0.75_0.09_240)]">
                      Your format&apos;s canvas
                    </span>
                  )}
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <h3 className="inline-flex items-center gap-2 text-base font-semibold">
                      <PenLine className="text-muted-foreground size-4" />
                      {definition.title}
                    </h3>
                    <span className="text-muted-foreground text-[13px]">
                      {formats.map(formatLabel).join(" & ")}
                    </span>
                  </div>
                  <p className="text-muted-foreground mt-2 text-sm">{definition.subtitle}</p>
                  {definition.citation && (
                    <p className="text-muted-foreground mt-2 text-[13px]">
                      Template: {definition.citation.label}
                    </p>
                  )}
                </a>
              );
            })}
          </div>
          <p className="text-muted-foreground mt-3 text-[13px]">
            Canvases are editable in place, autosave as you type, and print to PDF. What you write
            is private to you.
          </p>
        </section>

        <section className="mt-12">
          <h2 className="text-muted-foreground mb-4 border-b border-border/60 pb-1.5 text-xs font-semibold tracking-wide uppercase">
            Templates
          </h2>
          <ul className="space-y-3">
            {config.templates.filter((t) => !t.hidden).map((t) => (
              <li key={t.label} className="flex flex-wrap items-baseline gap-x-2">
                {t.url ? (
                  <a
                    href={t.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-3 hover:text-foreground"
                  >
                    <FileText className="size-3.5" />
                    {t.label}
                  </a>
                ) : (
                  <span className="text-muted-foreground text-sm font-medium">
                    {t.label} <span className="italic">— not uploaded yet</span>
                  </span>
                )}
                {t.note && <span className="text-muted-foreground text-[13px]">{t.note}</span>}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-12 pb-12">
          <h2 className="text-muted-foreground mb-4 border-b border-border/60 pb-1.5 text-xs font-semibold tracking-wide uppercase">
            Key readings
          </h2>
          <ul className="space-y-4">
            {READINGS.map((r) => (
              <li key={r.url}>
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-3 hover:text-foreground"
                >
                  {r.label}
                  <ExternalLink className="size-3" />
                </a>
                <p className="text-muted-foreground mt-0.5 text-[13px]">{r.note}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
