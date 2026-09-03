"use client";

import { useState } from "react";
import { useActionState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { submitResponse, type ActionResult } from "./response-actions";
import {
  displayPoints,
  POINT_CATEGORY_LABEL,
  type ReviewPointCategory,
  type SeminarResponse,
  type SeminarReview,
} from "../lib/types";

const INITIAL: ActionResult = { ok: true, message: "" };

type ReviewPoint = { id: string; category: ReviewPointCategory; text: string };

/** One reply slot per reviewer comment, in the review's own order. A legacy
 *  review (written before points existed) carries no `points`, so one slot
 *  is synthesised per non-empty free-text section instead — its pseudo-id is
 *  the category itself, which is also what response-actions.ts accepts for
 *  a review with no real points. */

type RowValue = { response: string; location: string };

function initialValues(
  points: ReviewPoint[],
  response: SeminarResponse | null,
): Record<string, RowValue> {
  const byId = new Map((response?.items ?? []).map((item) => [item.pointId, item]));
  return Object.fromEntries(
    points.map((p) => {
      const existing = byId.get(p.id);
      return [p.id, { response: existing?.response ?? "", location: existing?.location ?? "" }];
    }),
  );
}

export function ResponseForm({
  review,
  reviewerName,
  response,
}: {
  review: SeminarReview;
  reviewerName: string;
  response: SeminarResponse | null;
}) {
  const [state, formAction, pending] = useActionState(submitResponse, INITIAL);
  const [dirty, setDirty] = useState(false);
  const points = displayPoints(review);
  const [values, setValues] = useState<Record<string, RowValue>>(() => initialValues(points, response));

  // Clear "unsaved" the moment a new `state` arrives from a resolved action,
  // without an effect: adjust state during render and track what we've
  // already reacted to in a second piece of state — the same pattern
  // ReviewForm uses.
  const [syncedState, setSyncedState] = useState(state);
  if (state !== syncedState) {
    setSyncedState(state);
    setDirty(false);
  }

  function updateValue(id: string, field: keyof RowValue, value: string) {
    setValues((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
    setDirty(true);
  }

  return (
    <div>
      {/* The scores already sit under "Reviews you've received"; this block
          owns the comments and the replies to them — each shown exactly once. */}
      <h3 className="text-sm font-semibold">{reviewerName}&apos;s comments, your replies</h3>
      <form action={formAction} className="mt-4 space-y-6">
            <input type="hidden" name="reviewId" value={review.id} />

            <div className="flex flex-col gap-1.5">
              <label htmlFor="strategy" className="text-sm font-medium">
                Revision strategy
              </label>
              <p className="text-muted-foreground text-xs">
                Name the 3–5 major changes you made, separating the major critiques from the minor
                ones — the summary{" "}
                <a
                  href="https://doi.org/10.17705/1jais.00797"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2"
                >
                  Pang &amp; Thatcher (2023)
                </a>{" "}
                recommend leading with.
              </p>
              <Textarea
                id="strategy"
                name="strategy"
                rows={4}
                defaultValue={response?.strategy}
                onChange={() => setDirty(true)}
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-medium">Point by point</h4>
                <span className="text-muted-foreground text-xs">
                  Every comment gets a reply — where you couldn&apos;t address one, say why.
                </span>
              </div>

              {points.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  This review has no recorded comments yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {points.map((point) => {
                    const value = values[point.id] ?? { response: "", location: "" };
                    return (
                      <div key={point.id} className="border-border/60 border-l-2 pl-4">
                        <Badge variant="outline">{POINT_CATEGORY_LABEL[point.category]}</Badge>
                        <p className="text-foreground mt-2 text-sm whitespace-pre-wrap">{point.text}</p>

                        <input type="hidden" name="pointId" value={point.id} />

                        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_9rem]">
                          <div className="flex flex-col gap-1">
                            <label htmlFor={`response-${point.id}`} className="text-muted-foreground text-xs">
                              Your response
                            </label>
                            <Textarea
                              id={`response-${point.id}`}
                              name="response"
                              rows={2}
                              value={value.response}
                              onChange={(e) => updateValue(point.id, "response", e.target.value)}
                              placeholder="What you did about it"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label htmlFor={`location-${point.id}`} className="text-muted-foreground text-xs">
                              Where addressed
                            </label>
                            <Input
                              id={`location-${point.id}`}
                              name="location"
                              value={value.location}
                              onChange={(e) => updateValue(point.id, "location", e.target.value)}
                              placeholder="Section 3.2"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : response ? "Update response" : "Submit response"}
              </Button>
              <span className="text-muted-foreground text-xs">
                {pending
                  ? "Saving…"
                  : dirty
                    ? "Unsaved changes"
                    : response
                      ? `Saved · last updated ${new Date(response.updatedAt).toLocaleString()}`
                      : "Not submitted yet"}
              </span>
              {response && (
                <span className="text-muted-foreground text-xs">
                  Submitting again replaces this response.
                </span>
              )}
              {state.message && (
                <p className={cn("basis-full text-xs", state.ok ? "text-settled" : "text-destructive")}>
                  {state.message}
                </p>
              )}
            </div>
          </form>
    </div>
  );
}
