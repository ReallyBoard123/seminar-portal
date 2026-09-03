import { cn } from "@/lib/utils";
import { daysUntil, isDeadline, type Milestone } from "@/app/lib/types";

import { deadlineTone } from "./deadline-tone";

const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** The full edition timeline as an actual timeline: a spine with one node per
 *  milestone, past ones muted, the next one lit up, the rest plain. */
export function MilestoneTimeline({ milestones, nextKey }: { milestones: Milestone[]; nextKey: string | null }) {
  const sorted = [...milestones].sort((a, b) => a.dueOn.localeCompare(b.dueOn));

  return (
    <ol className="relative border-l border-border/60 pl-6">
      {sorted.map((m) => {
        const days = daysUntil(m.dueOn);
        const isNext = m.key === nextKey;
        const isPast = days < 0 && !isNext;
        // Events pass; only deadlines can be missed, so an event never gets
        // the overdue treatment however long ago it was.
        const event = !isDeadline(m);
        const tone = event ? deadlineTone(Math.max(days, 0)) : deadlineTone(days);

        return (
          <li key={m.key} className="relative pb-8 last:pb-0">
            <span
              className={cn(
                "absolute top-1 -left-[29px] size-3 rounded-full border-2 border-background",
                isPast ? "bg-muted-foreground/40" : isNext ? tone.dot : "bg-border",
              )}
            />
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <span
                className={cn(
                  "font-mono text-[11px] tabular-nums",
                  isPast ? "text-muted-foreground" : "text-foreground",
                )}
              >
                {DATE_FMT.format(new Date(`${m.dueOn}T00:00:00Z`))}
              </span>
              <span className={cn("text-sm font-medium", isPast && "text-muted-foreground")}>{m.label}</span>
              {isNext && (
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", tone.surface, tone.text)}>
                  next
                </span>
              )}
              {event && (
                <span className="border-border/60 text-muted-foreground rounded-full border px-2 py-0.5 text-[11px]">
                  event
                </span>
              )}
            </div>
            <p className={cn("mt-1 max-w-2xl text-[13px]", isPast ? "text-muted-foreground/80" : "text-muted-foreground")}>
              {m.description}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
