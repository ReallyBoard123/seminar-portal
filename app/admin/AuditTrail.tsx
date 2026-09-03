/**
 * The organiser's full audit trail. Read-only and presentational — the page
 * fetches `listEvents(edition)` and passes the rows straight through.
 *
 * Every action's `detail` is already written as a natural-language clause by
 * the action that logged it (see me/actions.ts and admin/actions.ts), so most
 * rows read as "{actor} {detail}". Only `upload`/`delete_file` (whose detail
 * is the machine-shaped "kind · round N · filename") and the detail-less
 * actions (signin, pin_claim, pin_reset, download, config_saved) get their
 * own phrasing below.
 */

import type { Participant, SeminarEvent } from "@/app/lib/types";

const DAY_FMT = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const TIME_FMT = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

const ACTION_VERB: Record<SeminarEvent["action"], string> = {
  signin: "signed in",
  pin_claim: "claimed their account and set a PIN",
  pin_reset: "had their PIN reset",
  upload: "uploaded a file",
  delete_file: "deleted a file",
  download: "opened a file",
  review_submitted: "submitted a review",
  review_updated: "updated a review",
  response_submitted: "responded to a review",
  response_updated: "revised their response to a review",
  assign_reviewer1: "was assigned a reviewer",
  pick_reviewer2: "picked a second reviewer",
  pick_discussant: "picked a discussant",
  import_roster: "imported the roster",
  config_saved: "saved the edition settings",
  profile_saved: "updated their researcher profile",
  broadcast_sent: "emailed the cohort",
};

const KIND_LABEL: Record<string, string> = {
  submission: "a submission",
  review: "a review",
  change_history: "a change history",
  slide: "a slide",
};

type Named = Pick<Participant, "id" | "name">;

/** `upload`/`delete_file` detail is written as "kind · round N · filename",
 *  or "template: Label" for organiser template uploads. */
function parseFileDetail(detail: string): { template?: string; kind?: string; round?: string } | null {
  if (detail.startsWith("template: ")) return { template: detail.slice("template: ".length) };
  const parts = detail.split(" · ");
  if (parts.length !== 3) return null;
  return { kind: parts[0], round: parts[1].replace(/^round /, "") };
}

function nameOf(participants: Named[], id: number | null): string | null {
  if (id === null) return null;
  return participants.find((p) => p.id === id)?.name ?? null;
}

function actorLabel(event: SeminarEvent, participants: Named[]): string {
  if (event.actorId === null) return event.actorName || "The system";
  return nameOf(participants, event.actorId) ?? (event.actorName || "Someone");
}

function describeEvent(event: SeminarEvent, participants: Named[]): string {
  const actor = actorLabel(event, participants);
  const subject = nameOf(participants, event.subjectId);

  if (event.action === "upload" || event.action === "delete_file") {
    const verb = event.action === "upload" ? "uploaded" : "deleted";
    const parsed = parseFileDetail(event.detail);
    if (parsed?.template) return `${actor} ${verb} the template "${parsed.template}"`;
    const what = (parsed?.kind && KIND_LABEL[parsed.kind]) || "a file";
    const round = parsed?.round ? ` for round ${parsed.round}` : "";
    const forWhom = subject && subject !== actor ? `, for ${subject}` : "";
    return `${actor} ${verb} ${what}${round}${forWhom}`;
  }
  if (event.action === "download") {
    return `${actor} opened ${subject ? `${subject}'s file` : "a file"}`;
  }
  if (event.action === "pin_reset") {
    return `${actor} reset the PIN for ${subject ?? "a participant"}`;
  }
  if (event.action === "import_roster" || event.action === "config_saved") {
    return event.detail ? `${actor} ${event.detail}` : `${actor} ${ACTION_VERB[event.action]}`;
  }
  // pick_reviewer2, pick_discussant, assign_reviewer1, signin, pin_claim,
  // review_submitted, review_updated: detail already reads as a full clause.
  return event.detail ? `${actor} ${event.detail}` : `${actor} ${ACTION_VERB[event.action]}`;
}

function groupByDay(events: SeminarEvent[]): { key: string; events: SeminarEvent[] }[] {
  const groups: { key: string; events: SeminarEvent[] }[] = [];
  for (const event of events) {
    const key = event.at.slice(0, 10); // yyyy-mm-dd, events are stored in UTC
    const current = groups.at(-1);
    if (current && current.key === key) current.events.push(event);
    else groups.push({ key, events: [event] });
  }
  return groups;
}

export function AuditTrail({ events, participants }: { events: SeminarEvent[]; participants: Named[] }) {
  if (events.length === 0) {
    return <p className="text-muted-foreground text-sm">Nothing logged yet.</p>;
  }

  const days = groupByDay(events);

  return (
    <div className="divide-border/60 border-border/60 divide-y rounded-xl border">
      {days.map((day) => (
        <div key={day.key}>
          <h3 className="bg-muted/30 text-muted-foreground sticky top-0 px-3 py-1.5 text-xs font-medium">
            {DAY_FMT.format(new Date(`${day.key}T00:00:00Z`))}
          </h3>
          <ul className="divide-border/60 divide-y">
            {day.events.map((event) => (
              <li key={event.id} className="flex items-baseline gap-3 px-3 py-2 text-sm">
                <span className="text-muted-foreground w-11 shrink-0 font-mono text-[11px] tabular-nums">
                  {TIME_FMT.format(new Date(event.at))}
                </span>
                <span className="min-w-0">{describeEvent(event, participants)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
