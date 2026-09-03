"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

import { updateRoles, type ActionResult } from "./actions";
import type { FormatKey, PublicParticipant } from "../lib/types";

const INITIAL: ActionResult = { ok: true, message: "" };
const NONE = "none";

/** The facts that matter at decision time: where they are, what they are
 *  presenting, whether their draft exists. Everything richer lives behind
 *  their name on the Who does what page, which links to their official
 *  university profile. */
function PersonDetail({
  participant,
  formatLabels,
  hasSubmitted,
}: {
  participant: PublicParticipant | undefined;
  formatLabels: Partial<Record<FormatKey, string>>;
  hasSubmitted: boolean;
}) {
  if (!participant) return null;
  return (
    <div className="mt-1.5 w-72">
      <dl className="border-border/60 bg-muted/30 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 rounded-md border px-2.5 py-2 text-[11px]">
        <dt className="text-muted-foreground">Institution</dt>
        <dd className="truncate text-right">{participant.institution || "—"}</dd>
        <dt className="text-muted-foreground">Format</dt>
        <dd className="truncate text-right">
          {participant.format ? (formatLabels[participant.format] ?? participant.format) : "not assigned"}
        </dd>
        <dt className="text-muted-foreground">Submitted</dt>
        <dd className="text-right">{hasSubmitted ? "yes" : "not yet"}</dd>
        {participant.homepageUrl && (
          <>
            <dt className="text-muted-foreground">Who they are</dt>
            <dd className="truncate text-right">
              <a
                href={participant.homepageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                official page
              </a>
            </dd>
          </>
        )}
      </dl>
    </div>
  );
}

function nameFor(options: PublicParticipant[], picked: string): string {
  if (picked === NONE) return "Not chosen yet";
  return options.find((o) => String(o.id) === picked)?.name ?? "Not chosen yet";
}

export function ReviewerPicker({
  options,
  reviewer1Id,
  reviewer2Id,
  discussantId,
  formatLabels,
  submittedIds,
  showReviewer2,
  showDiscussant,
}: {
  options: PublicParticipant[];
  reviewer1Id: number | null;
  reviewer2Id: number | null;
  discussantId: number | null;
  /** Format key -> display label, from the edition config's format rules. */
  formatLabels: Partial<Record<FormatKey, string>>;
  /** Ids of participants with at least one deliverable uploaded. */
  submittedIds: number[];
  /** From the edition config: which of the two picks this process allows. */
  showReviewer2: boolean;
  showDiscussant: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateRoles, INITIAL);
  const [pickedReviewer2, setPickedReviewer2] = useState(reviewer2Id ? String(reviewer2Id) : NONE);
  const [pickedDiscussant, setPickedDiscussant] = useState(discussantId ? String(discussantId) : NONE);
  const reviewer2Options = options.filter((p) => p.id !== reviewer1Id);
  const submitted = new Set(submittedIds);

  const reviewer2 = options.find((p) => String(p.id) === pickedReviewer2);
  const discussant = options.find((p) => String(p.id) === pickedDiscussant);

  return (
    <form action={formAction} className="flex flex-wrap items-start gap-4">
      {showReviewer2 && (
      <div className="flex flex-col gap-1">
        <label className="text-muted-foreground text-xs">Reviewer 2</label>
        <div className="flex items-center gap-2">
          <Select
            name="reviewer2Id"
            value={pickedReviewer2}
            onValueChange={(value) => setPickedReviewer2(value ?? NONE)}
          >
            <SelectTrigger size="sm" className="w-56">
              <SelectValue>{nameFor(reviewer2Options, pickedReviewer2)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Not chosen yet</SelectItem>
              {reviewer2Options.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <PersonDetail
          participant={reviewer2}
          formatLabels={formatLabels}
          hasSubmitted={!!reviewer2 && submitted.has(reviewer2.id)}
        />
      </div>
      )}

      {showDiscussant && (
      <div className="flex flex-col gap-1">
        <label className="text-muted-foreground text-xs">Discussant</label>
        <Select
          name="discussantId"
          value={pickedDiscussant}
          onValueChange={(value) => setPickedDiscussant(value ?? NONE)}
        >
          <SelectTrigger size="sm" className="w-56">
            <SelectValue>{nameFor(options, pickedDiscussant)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Not chosen yet</SelectItem>
            {options.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <PersonDetail
          participant={discussant}
          formatLabels={formatLabels}
          hasSubmitted={!!discussant && submitted.has(discussant.id)}
        />
      </div>
      )}

      <Button type="submit" size="sm" variant="outline" disabled={pending} className="mt-5">
        {pending ? "Saving…" : "Save"}
      </Button>

      {state.message && (
        <p className={cn("basis-full text-xs", state.ok ? "text-settled" : "text-destructive")}>
          {state.message}
        </p>
      )}
    </form>
  );
}
