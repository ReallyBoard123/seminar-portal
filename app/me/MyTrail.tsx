/**
 * A participant's own slice of the audit trail — read-only, short, and
 * answers one question: who has opened my submission, and when. The page
 * passes `listEventsAbout(edition, participantId)` straight through.
 */

import type { Participant, SeminarEvent } from "@/app/lib/types";

const WHEN_FMT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

type Named = Pick<Participant, "id" | "name">;

function nameOf(participants: Named[], id: number | null): string | null {
  if (id === null) return null;
  return participants.find((p) => p.id === id)?.name ?? null;
}

/** Second person from `participantId`'s point of view: "you" for their own
 *  side of an event, the other person's name for the other side. */
function describeEvent(event: SeminarEvent, participants: Named[], participantId: number): string {
  const isMe = (id: number | null) => id === participantId;
  const otherActor = () => nameOf(participants, event.actorId) ?? (event.actorName || "Someone");

  if (event.action === "download") {
    if (isMe(event.subjectId) && !isMe(event.actorId)) return `${otherActor()} opened your file`;
    if (isMe(event.actorId) && !isMe(event.subjectId)) {
      const owner = nameOf(participants, event.subjectId);
      return `You opened ${owner ? `${owner}'s file` : "a file"}`;
    }
    return "You opened your own file";
  }
  if (event.action === "upload") {
    return isMe(event.actorId) ? "You uploaded a file" : `${otherActor()} uploaded a review for you`;
  }
  if (event.action === "delete_file") {
    return isMe(event.actorId) ? "You deleted a file" : `${otherActor()} deleted a file`;
  }
  if (event.action === "assign_reviewer1") {
    return "An organiser assigned your reviewer 1";
  }
  if (event.action === "pin_reset") {
    return "An organiser reset your PIN";
  }
  if (event.action === "review_submitted" || event.action === "review_updated") {
    const verb = event.action === "review_updated" ? "revised" : "submitted";
    if (isMe(event.subjectId) && !isMe(event.actorId)) return `${otherActor()} ${verb} a review of your work`;
    const author = nameOf(participants, event.subjectId);
    return `You ${verb} a review${author ? ` of ${author}'s work` : ""}`;
  }
  if (event.action === "response_submitted" || event.action === "response_updated") {
    const verb = event.action === "response_updated" ? "revised" : "wrote";
    if (isMe(event.actorId)) return `You ${verb} your response to a review`;
    return `${otherActor()} ${verb} a response to your review`;
  }
  if (event.action === "pick_reviewer2") return `You chose reviewer 2${event.detail ? `: ${event.detail}` : ""}`;
  if (event.action === "pick_discussant") return `You chose a discussant${event.detail ? `: ${event.detail}` : ""}`;
  if (event.action === "profile_saved") return "You updated your profile";
  if (event.action === "signin") return "You signed in";
  if (event.action === "pin_claim") return "You set your PIN";
  // Organiser-side actions (import_roster, config_saved) can surface here only
  // when the organiser is looking at their own trail.
  return event.detail || `Recorded: ${event.action.replace(/_/g, " ")}`;
}

export function MyTrail({
  events,
  participants,
  participantId,
}: {
  events: SeminarEvent[];
  participants: Named[];
  participantId: number;
}) {
  if (events.length === 0) {
    return <p className="text-muted-foreground text-sm">No activity yet.</p>;
  }

  return (
    <ul className="divide-border/60 divide-y text-sm">
      {events.map((event) => (
        <li key={event.id} className="flex items-baseline gap-3 py-2">
          <span className="text-muted-foreground w-24 shrink-0 font-mono text-[11px] tabular-nums">
            {WHEN_FMT.format(new Date(event.at))}
          </span>
          <span className="min-w-0">{describeEvent(event, participants, participantId)}</span>
        </li>
      ))}
    </ul>
  );
}
