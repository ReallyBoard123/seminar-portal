"use client";

import { Copy, Mail } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { daysUntil, type FileKind, type Milestone, type Participant, type Round, type SeminarFile } from "@/app/lib/types";

import { deadlineTone } from "../components/deadline-tone";

const ROUNDS: Round[] = [1, 2, 3];
const ROUND_MILESTONE_KEY: Record<Round, string> = { 1: "submission_1", 2: "submission_2", 3: "submission_3" };
const KIND_LABEL: Record<FileKind, string> = { submission: "sub", review: "rev", change_history: "hist", slide: "slide", template: "tpl" };

type Props = {
  participants: Participant[];
  files: SeminarFile[];
  milestones: Milestone[];
};

function fileHref(fileId: number): string {
  return `/api/file?id=${fileId}`;
}

/**
 * The organiser's at-a-glance view: who has and hasn't turned in each round.
 * "Missing round N" means no file at all is recorded for that person in that
 * round — the matrix doesn't try to model which kind each format owes in
 * which round (that mapping lives in the format rules, not the schema), it
 * just shows what's there and lets the organiser judge whether it's enough.
 */
export function CompletionMatrix({ participants, files, milestones }: Props) {
  const [copiedRound, setCopiedRound] = useState<Round | null>(null);

  const byParticipant = new Map<number, SeminarFile[]>();
  for (const f of files) {
    const list = byParticipant.get(f.participantId) ?? [];
    list.push(f);
    byParticipant.set(f.participantId, list);
  }

  // A `review` row hangs off the author it is about but was uploaded by their
  // reviewer, so counting it would mark an author complete for a round they
  // never turned anything in for — and disagree with the reminder mail, which
  // only ever looks at what the participant themself uploaded. A `template`
  // row hangs off whichever organiser uploaded it, and organisers can present
  // too, so counting those would mark that person complete for handing out
  // the paperwork.
  const ownWork = (p: { id: number }) =>
    (byParticipant.get(p.id) ?? []).filter((f) => f.kind !== "review" && f.kind !== "template");

  const missingByRound = (round: Round) =>
    participants.filter((p) => !ownWork(p).some((f) => f.round === round));

  const copyMissing = async (round: Round) => {
    const emails = missingByRound(round)
      .map((p) => p.email)
      .filter(Boolean);
    await navigator.clipboard.writeText(emails.join(", "));
    setCopiedRound(round);
    setTimeout(() => setCopiedRound((r) => (r === round ? null : r)), 1500);
  };

  const mailtoMissing = (round: Round) => {
    const emails = missingByRound(round)
      .map((p) => p.email)
      .filter(Boolean);
    const subject = encodeURIComponent(`Still waiting on your round ${round} submission`);
    return `mailto:?bcc=${emails.map(encodeURIComponent).join(",")}&subject=${subject}`;
  };

  if (participants.length === 0) {
    return <p className="text-muted-foreground text-sm">No participants yet.</p>;
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-3">
        {ROUNDS.map((round) => {
          const missing = missingByRound(round);
          const done = participants.length - missing.length;
          const milestone = milestones.find((m) => m.key === ROUND_MILESTONE_KEY[round]);
          const days = milestone ? daysUntil(milestone.dueOn) : null;
          const tone = days !== null ? deadlineTone(days) : null;
          return (
            <div key={round} className={cn("min-w-40 flex-1 rounded-xl p-4", tone?.surface ?? "bg-muted")}>
              <p className={cn("text-xs font-semibold tracking-wide uppercase", tone?.text ?? "text-muted-foreground")}>
                Round {round}
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums">
                {done}
                <span className="text-muted-foreground text-base font-normal">/{participants.length}</span>
              </p>
              <p className="text-muted-foreground text-[12px]">{tone ? tone.word : "no deadline set"}</p>
            </div>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-xl border border-border/60">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="bg-muted/40 sticky left-0 z-10 font-medium">Participant</TableHead>
              {ROUNDS.map((round) => {
                const milestone = milestones.find((m) => m.key === ROUND_MILESTONE_KEY[round]);
                const missing = missingByRound(round);
                return (
                  <TableHead key={round} className="bg-muted/40 font-medium">
                    <div className="flex items-center justify-between gap-3">
                      <span>
                        Round {round}
                        {milestone && <span className="text-muted-foreground ml-1.5 font-normal">{milestone.dueOn}</span>}
                      </span>
                      <div className="flex items-center gap-0.5">
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          disabled={missing.length === 0}
                          onClick={() => copyMissing(round)}
                          title={`Copy the email addresses of everyone missing round ${round}`}
                        >
                          <Copy className="size-3" />
                          {copiedRound === round ? "copied" : "copy"}
                        </Button>
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="ghost"
                          disabled={missing.length === 0}
                          nativeButton={false}
                          render={<a href={mailtoMissing(round)} title={`Email everyone missing round ${round}`} />}
                        >
                          <Mail className="size-3" />
                        </Button>
                      </div>
                    </div>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {participants.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="bg-card sticky left-0 z-10">
                  <div className="font-medium">{p.name}</div>
                  <div className="text-muted-foreground text-[12px]">{p.format || "no format"}</div>
                </TableCell>
                {ROUNDS.map((round) => {
                  // Templates are cohort handouts, not this person's work; a "tpl" chip
                  // in an organiser-presenter's cell would just be clutter.
                  const cellFiles = (byParticipant.get(p.id) ?? []).filter(
                    (f) => f.round === round && f.kind !== "template",
                  );
                  const milestone = milestones.find((m) => m.key === ROUND_MILESTONE_KEY[round]);
                  const days = milestone ? daysUntil(milestone.dueOn) : null;
                  // Reviews other people filed still show as links, but they
                  // do not clear the cell — same rule the header count uses.
                  const hasOwnWork = cellFiles.some((f) => f.kind !== "review" && f.kind !== "template");
                  const tone = !hasOwnWork && days !== null ? deadlineTone(days) : null;
                  return (
                    <TableCell key={round} className="align-top whitespace-normal">
                      <div className="flex flex-wrap gap-1">
                        {cellFiles.map((f) => (
                          <a
                            key={f.id}
                            href={fileHref(f.id)}
                            className="bg-settled-surface text-settled inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] hover:opacity-80"
                            title={f.filename}
                          >
                            {KIND_LABEL[f.kind]}
                          </a>
                        ))}
                        {tone ? (
                          <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px]", tone.surface, tone.text)}>
                            <span className={cn("size-1.5 rounded-full", tone.dot)} />
                            {tone.word}
                          </span>
                        ) : (
                          cellFiles.length === 0 && <span className="text-muted-foreground text-[12px]">—</span>
                        )}
                      </div>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
