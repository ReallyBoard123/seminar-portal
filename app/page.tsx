import { Mail } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { currentParticipant } from "@/app/lib/auth";
import { readConfig } from "@/app/lib/config";
import { Refs } from "@/app/lib/refs";
import { daysUntil, nextMilestone } from "@/app/lib/types";

import { deadlineTone } from "./components/deadline-tone";
import { MilestoneTimeline } from "./components/MilestoneTimeline";
import { PortalNav } from "./components/PortalNav";

const DATE_FMT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
const DATE_FMT_YEAR = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function formatRange(startIso: string, endIso: string): string {
  const start = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);
  const sameMonth = start.getUTCMonth() === end.getUTCMonth() && start.getUTCFullYear() === end.getUTCFullYear();
  return sameMonth
    ? `${start.getUTCDate()}–${DATE_FMT_YEAR.format(end)}`
    : `${DATE_FMT.format(start)} – ${DATE_FMT_YEAR.format(end)}`;
}

export default async function SeminarHubPage() {
  const [config, viewer] = await Promise.all([readConfig(), currentParticipant()]);

  const next = nextMilestone(config.milestones);
  const days = next ? daysUntil(next.dueOn) : 0;
  const tone = next ? deadlineTone(days) : null;

  return (
    <main className="min-h-screen">
      <PortalNav active="/" signedInAs={viewer?.name} isOrganizer={viewer?.isOrganizer || viewer?.isAdmin} />
      <div className="mx-auto max-w-4xl px-6 py-8 sm:px-12">
        <header>
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            Edition {config.edition}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-balance">{config.title}</h1>
          <p className="text-muted-foreground mt-2 text-[13px]">
            {config.hosts.join(" & ")} · {config.city} · {formatRange(config.startsOn, config.endsOn)}
          </p>
                    
        </header>

        {next && tone && (
          <Link
            href="/me"
            className={cn(
              "mt-8 block rounded-2xl p-8 transition hover:brightness-[0.97] sm:p-10 dark:hover:brightness-110",
              tone.surface,
            )}
          >
            <p className={cn("text-xs font-semibold tracking-wide uppercase", tone.text)}>Next deadline</p>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className={cn("text-6xl leading-none font-bold tabular-nums", tone.text)}>
                {days === 0 ? "today" : Math.abs(days)}
              </span>
              {days !== 0 && (
                <span className="text-lg font-medium">
                  day{Math.abs(days) === 1 ? "" : "s"} {days < 0 ? "overdue" : "away"}
                </span>
              )}
            </div>
            <p className="mt-3 text-base font-medium">{next.label}</p>
            <p className="text-muted-foreground mt-1 max-w-xl text-sm">{next.description}</p>
            <p className="text-muted-foreground mt-1 text-[13px]">{DATE_FMT_YEAR.format(new Date(`${next.dueOn}T00:00:00Z`))}</p>
            <p className={cn("mt-4 text-[13px] font-medium", tone.text)}>Go to my submissions →</p>
          </Link>
        )}

        <section className="mt-12">
          <h2 className="text-muted-foreground mb-4 border-b border-border/60 pb-1.5 text-xs font-semibold tracking-wide uppercase">
            Timeline
          </h2>
          <MilestoneTimeline milestones={config.milestones} nextKey={next?.key ?? null} />
        </section>

        <section className="mt-12">
          <h2 className="text-muted-foreground mb-4 border-b border-border/60 pb-1.5 text-xs font-semibold tracking-wide uppercase">
            Formats
          </h2>
          <div className="space-y-6">
            {config.formats.map((rule) => (
              <div
                key={rule.key}
                className={cn(
                  "border-border/60 bg-card rounded-xl border p-5",
                  // Signed in, this is the one card that concerns you: a calm
                  // blue wash on yours, the other three stepped back. Signed
                  // out, all four stand equal.
                  viewer?.format === rule.key &&
                    "bg-[oklch(0.97_0.02_240)] ring-1 ring-[oklch(0.62_0.11_240)]/45 dark:bg-[oklch(0.28_0.04_240)]",
                  viewer?.format && viewer.format !== rule.key && "opacity-60",
                )}
              >
                {viewer?.format === rule.key && (
                  <span className="text-[11px] font-semibold tracking-wide text-[oklch(0.45_0.11_240)] uppercase dark:text-[oklch(0.75_0.09_240)]">
                    Your format
                  </span>
                )}
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h3 className="text-base font-semibold">{rule.label}</h3>
                  <span className="font-mono text-[13px] tabular-nums">{rule.length}</span>
                </div>
                <p className="text-muted-foreground mt-2 text-sm">{rule.goal}</p>
                <p className="mt-2 text-sm">{rule.deliverable}</p>
                {rule.lengthDisputed && rule.lengthNote && (
                  <p className="text-soon bg-soon-surface mt-3 rounded-md px-3 py-2 text-[13px]">
                    ⚠ {rule.lengthNote}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12 grid gap-6 sm:grid-cols-2">
          <div>
            <h2 className="text-muted-foreground mb-2 border-b border-border/60 pb-1.5 text-xs font-semibold tracking-wide uppercase">
              Reviewing
            </h2>
            <p className="text-sm"><Refs text={config.reviewerCircleNote} /></p>
          </div>
          <div>
            <h2 className="text-muted-foreground mb-2 border-b border-border/60 pb-1.5 text-xs font-semibold tracking-wide uppercase">
              Discussant
            </h2>
            <p className="text-sm"><Refs text={config.discussantNote} /></p>
          </div>
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
                    className="text-sm font-medium underline underline-offset-3 hover:text-foreground"
                  >
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

        <footer className="border-border/60 mt-16 flex flex-col gap-2 border-t pt-6 pb-8">
          <a
            href={`mailto:${config.contactEmail}`}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-[13px]"
          >
            <Mail className="size-3.5" />
            Questions about the seminar — formats, deadlines, reviewers: {config.contactEmail}
          </a>
          {config.techContactEmail && (
            <a
              href={`mailto:${config.techContactEmail}`}
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-[13px]"
            >
              <Mail className="size-3.5" />
              Something wrong with this site: {config.techContactEmail}
            </a>
          )}
        </footer>
      </div>
    </main>
  );
}
