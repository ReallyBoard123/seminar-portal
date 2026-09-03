"use client";

import { useState } from "react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { submitReview, type ActionResult } from "./review-actions";
import {
  POINT_CATEGORY_LABEL,
  REVIEW_CRITERIA,
  REVIEW_POINT_CATEGORIES,
  SCORE_MAX,
  SCORE_MIN,
  type ReviewPoint,
  type ReviewPointCategory,
  type SeminarReview,
} from "../lib/types";
import type { PublicParticipant } from "../lib/types";

const INITIAL: ActionResult = { ok: true, message: "" };
const SCALE = Array.from({ length: SCORE_MAX - SCORE_MIN + 1 }, (_, i) => SCORE_MIN + i);

/** One criterion's 0–7 pick, as a joined pill group of native radios rather
 *  than a slider — arrow keys move between values, Tab moves past the whole
 *  group, and each option carries its own accessible name. */
function ScoreField({
  criterionKey,
  label,
  defaultValue,
}: {
  criterionKey: string;
  label: string;
  defaultValue: number | undefined;
}) {
  return (
    <fieldset className="flex flex-col gap-1.5 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <legend className="text-foreground pr-4 text-sm sm:w-[26rem] sm:shrink-0">{label}</legend>
      <div className="inline-flex w-fit overflow-hidden rounded-md border border-input">
        {SCALE.map((n) => (
          <label
            key={n}
            className={cn(
              "has-focus-visible:ring-3 has-focus-visible:ring-ring/50 relative flex size-8 cursor-pointer items-center justify-center border-r border-input text-xs tabular-nums transition-colors last:border-r-0",
              "has-checked:bg-primary has-checked:text-primary-foreground hover:bg-muted has-checked:hover:bg-primary",
            )}
          >
            <input
              type="radio"
              name={`score_${criterionKey}`}
              value={n}
              defaultChecked={defaultValue === n}
              className="sr-only"
              aria-label={`${label}: ${n}${n === SCORE_MIN ? " (poor)" : n === SCORE_MAX ? " (high)" : ""}`}
            />
            {n}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** One comment row. Kept as component state so rows can be added and removed;
 *  the ids ride along in hidden inputs so an existing comment keeps its id and
 *  any response already written against it stays attached. */
type DraftPoint = { id: string; category: ReviewPointCategory; text: string };

function blankPoint(category: ReviewPointCategory): DraftPoint {
  return { id: "", category, text: "" };
}

/** A review written before comments were split into rows still has its prose
 *  in the legacy fields; offer it as the starting rows rather than losing it. */
function seedFrom(review: SeminarReview | null): DraftPoint[] {
  const legacy: DraftPoint[] = [];
  if (review?.strengths) legacy.push({ id: "", category: "strength", text: review.strengths });
  if (review?.weaknesses) legacy.push({ id: "", category: "weakness", text: review.weaknesses });
  if (review?.comments) legacy.push({ id: "", category: "comment", text: review.comments });
  return legacy;
}

function PointEditor({ initial, legacy }: { initial: ReviewPoint[]; legacy: SeminarReview | null }) {
  const seeded: DraftPoint[] =
    initial.length > 0
      ? initial
      : seedFrom(legacy).length > 0
        ? seedFrom(legacy)
        : [blankPoint("strength"), blankPoint("strength"), blankPoint("weakness"), blankPoint("weakness"), blankPoint("comment")];
  const [points, setPoints] = useState<DraftPoint[]>(seeded);

  const update = (index: number, patch: Partial<DraftPoint>) =>
    setPoints((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const add = (category: ReviewPointCategory) =>
    setPoints((rows) => [...rows, blankPoint(category)]);
  const remove = (index: number) => setPoints((rows) => rows.filter((_, i) => i !== index));

  const counts = {
    strength: points.filter((p) => p.category === "strength" && p.text.trim()).length,
    weakness: points.filter((p) => p.category === "weakness" && p.text.trim()).length,
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h4 className="text-sm font-medium">Your comments</h4>
        <p className="text-muted-foreground mt-1 text-xs">
          One point per row. The author replies to each of these individually during the
          revision phase, so keep them separate rather than writing one long note. The sheet
          asks for at least two strengths and two weaknesses — you have {counts.strength} and{" "}
          {counts.weakness}.
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {points.map((point, index) => (
          <li key={index} className="border-border/60 flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-start">
            <select
              aria-label={`Category for comment ${index + 1}`}
              className="border-input bg-background h-8 shrink-0 rounded-md border px-2 text-xs"
              value={point.category}
              onChange={(e) => update(index, { category: e.target.value as ReviewPointCategory })}
            >
              {REVIEW_POINT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {POINT_CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
            <Textarea
              aria-label={`Comment ${index + 1}`}
              rows={2}
              className="flex-1"
              value={point.text}
              onChange={(e) => update(index, { text: e.target.value })}
              placeholder="One specific point the author can act on."
            />
            <input type="hidden" name="point_id" value={point.id} />
            <input type="hidden" name="point_category" value={point.category} />
            <input type="hidden" name="point_text" value={point.text} />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive shrink-0"
              onClick={() => remove(index)}
              aria-label={`Remove comment ${index + 1}`}
            >
              Remove
            </Button>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-2">
        {REVIEW_POINT_CATEGORIES.map((c) => (
          <Button key={c} type="button" variant="outline" size="sm" onClick={() => add(c)}>
            Add {POINT_CATEGORY_LABEL[c].toLowerCase()}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function ReviewForm({
  participant,
  review,
}: {
  participant: PublicParticipant;
  review: SeminarReview | null;
}) {
  const [state, formAction, pending] = useActionState(submitReview, INITIAL);
  const [dirty, setDirty] = useState(false);

  // Clear "unsaved" the moment a new `state` arrives from a resolved action,
  // without an effect: adjust state during render and track what we've
  // already reacted to in a second piece of state, the pattern React's own
  // docs recommend over useEffect for "reset on prop change".
  const [syncedState, setSyncedState] = useState(state);
  if (state !== syncedState) {
    setSyncedState(state);
    setDirty(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Review: {participant.name}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} onChange={() => setDirty(true)} className="space-y-6">
          <input type="hidden" name="participantId" value={participant.id} />

          <div>
            <div className="text-muted-foreground mb-1 flex justify-between text-[11px]">
              <span>{SCORE_MIN} = poor</span>
              <span>{SCORE_MAX} = high</span>
            </div>
            <div className="divide-border/60 divide-y">
              {REVIEW_CRITERIA.map((c) => (
                <ScoreField
                  key={c.key}
                  criterionKey={c.key}
                  label={c.label}
                  defaultValue={review?.scores[c.key]}
                />
              ))}
            </div>
          </div>

          <PointEditor initial={review?.points ?? []} legacy={review} />

          <div className="flex flex-col gap-1.5">
            <label htmlFor={`note-${participant.id}`} className="text-sm font-medium">
              A note to {participant.name.split(" ")[0]} <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <p className="text-muted-foreground text-xs">
              Personal, not part of the review — &quot;sorry it&apos;s late&quot;, &quot;happy to talk this
              through over coffee&quot;.
            </p>
            <Textarea id={`note-${participant.id}`} name="note" rows={2} defaultValue={review?.note} />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : review ? "Update review" : "Submit review"}
            </Button>
            <span className="text-muted-foreground text-xs">
              {pending
                ? "Saving…"
                : dirty
                  ? "Unsaved changes"
                  : review
                    ? `Saved · last updated ${new Date(review.updatedAt).toLocaleString()}`
                    : "Not submitted yet"}
            </span>
            {review && (
              <span className="text-muted-foreground text-xs">
                Submitting again replaces this review.
              </span>
            )}
            {state.message && (
              <p className={cn("basis-full text-xs", state.ok ? "text-settled" : "text-destructive")}>
                {state.message}
              </p>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
