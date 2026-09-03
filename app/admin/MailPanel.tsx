"use client";

import { Mail, Send } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { useActionState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Milestone, Participant, Round, SeminarFile } from "@/app/lib/types";

import { mailStatus, remindRound, sendSignInInvites, type ActionResult, type MailStatus } from "./mail-actions";

const ROUNDS: Round[] = [1, 2, 3];
const INITIAL: ActionResult = { ok: true, message: "" };

type Props = {
  /** The roster — same shape CompletionMatrix and ParticipantsPanel take;
   *  the organiser's own row is filtered out defensively either way. */
  participants: Participant[];
  files: SeminarFile[];
  milestones: Milestone[];
};

type Mode = { kind: "round"; round: Round } | { kind: "signin" };

/**
 * Organiser-triggered batch email. Replaces the mailto link that stopped
 * scaling past a couple of rounds — pick who to nudge, see exactly who that
 * is, then send. No blind fire: the recipient list renders before the send
 * button does anything.
 */
export function MailPanel({ participants, files, milestones }: Props) {
  // An organiser who also presents still owes a submission, so they still get
  // the reminder. Only faculty accounts, which carry no format, are skipped.
  const roster = participants.filter((p) => !p.isOrganizer || p.format !== "");
  const [status, setStatus] = useState<MailStatus | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: "round", round: 1 });

  useEffect(() => {
    let alive = true;
    mailStatus().then((s) => {
      if (alive) setStatus(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  const [roundState, dispatchRound, roundPending] = useActionState(remindRound, INITIAL);
  const [signinState, dispatchSignin, signinPending] = useActionState(sendSignInInvites, INITIAL);
  const [, startTransition] = useTransition();

  const recipients =
    mode.kind === "round"
      ? roster.filter(
          (p) => !files.some((f) => f.participantId === p.id && f.kind === "submission" && f.round === mode.round),
        )
      : roster.filter((p) => !p.claimedAt);

  const milestone =
    mode.kind === "round" ? milestones.find((m) => m.key === `submission_${mode.round}`) : undefined;

  const pending = mode.kind === "round" ? roundPending : signinPending;
  const state = mode.kind === "round" ? roundState : signinState;

  const send = () => {
    if (recipients.length === 0) return;
    if (
      !window.confirm(
        `Email ${recipients.length} participant${recipients.length === 1 ? "" : "s"}? This sends real mail, right now.`,
      )
    ) {
      return;
    }
    if (mode.kind === "round") {
      startTransition(() => dispatchRound({ round: mode.round }));
    } else {
      startTransition(() => dispatchSignin());
    }
  };

  if (status && !status.configured) {
    return (
      <div className="rounded-xl border border-border/60 bg-card p-5">
        <h3 className="font-heading flex items-center gap-2 text-base font-semibold">
          <Mail className="size-4" />
          Email is not configured
        </h3>
        <p className="text-muted-foreground mt-1 text-[13px]">
          Set {status.missing.join(" and ")} in the environment to send reminders and invitations from here. Until
          then, use the mailto links in the completion table above.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card p-5">
      <h3 className="font-heading flex items-center gap-2 text-base font-semibold">
        <Mail className="size-4" />
        Email participants
      </h3>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex overflow-hidden rounded-lg border border-border/60">
          <button
            type="button"
            className={cn(
              "px-3 py-1.5 text-[13px] font-medium",
              mode.kind === "round" ? "bg-primary text-primary-foreground" : "hover:bg-muted",
            )}
            onClick={() => setMode({ kind: "round", round: mode.kind === "round" ? mode.round : 1 })}
          >
            Round reminder
          </button>
          <button
            type="button"
            className={cn(
              "px-3 py-1.5 text-[13px] font-medium",
              mode.kind === "signin" ? "bg-primary text-primary-foreground" : "hover:bg-muted",
            )}
            onClick={() => setMode({ kind: "signin" })}
          >
            Sign-in invitation
          </button>
        </div>

        {mode.kind === "round" && (
          <Select value={String(mode.round)} onValueChange={(v) => setMode({ kind: "round", round: Number(v) as Round })}>
            <SelectTrigger size="sm" className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROUNDS.map((r) => (
                <SelectItem key={r} value={String(r)}>
                  Round {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {mode.kind === "round" && milestone && (
        <p className="text-muted-foreground mt-2 text-[12px]">
          {milestone.label} · due {milestone.dueOn}
        </p>
      )}

      <div className="mt-4">
        <p className="text-muted-foreground text-[12px] font-medium tracking-wide uppercase">
          {recipients.length === 0
            ? "Nobody to email"
            : `Will email ${recipients.length} participant${recipients.length === 1 ? "" : "s"}`}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {recipients.map((p) => (
            <Badge key={p.id} variant={p.email ? "secondary" : "outline"} title={p.email || "no email on file — will be skipped"}>
              {p.name}
              {!p.email && " (no email)"}
            </Badge>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button type="button" disabled={pending || recipients.length === 0} onClick={send}>
          <Send className="size-3.5" />
          {pending ? "Sending…" : "Send"}
        </Button>
        {state.message && (
          <p className={cn("text-[13px] whitespace-pre-line", state.ok ? "text-settled" : "text-destructive")}>
            {state.message}
          </p>
        )}
      </div>
    </div>
  );
}
