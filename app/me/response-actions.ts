"use server";

/**
 * The server action behind the point-by-point response form. Mirrors
 * review-actions.ts: resolve the caller from the session, then check them
 * against a freshly-read row rather than trusting the posted ids.
 */

import { revalidatePath } from "next/cache";

import { z } from "zod";

import { currentParticipant } from "../lib/auth";
import { listReviewsFor, logEvent, saveResponse } from "../lib/db";
import { arrayOf, dbId, parseForm, text, type ActionResult } from "../lib/forms";
import { REVIEW_POINT_CATEGORIES, type ResponseItem } from "../lib/types";

export type { ActionResult };

const responseSchema = z.object({
  reviewId: dbId,
  strategy: text(4000, "Revision strategy"),
  pointId: arrayOf(z.string().trim()),
  response: arrayOf(z.string().trim()),
  location: arrayOf(z.string().trim()),
});

/**
 * Zip the parallel row fields into items, dropping rows where nothing was
 * said. `validIds` is the set of comments this review can be answered
 * against — the real point ids, or the three fixed categories for a legacy
 * review with none, which is what ResponseForm synthesises for it. zod can
 * check the shape of a row but not which review it belongs to.
 */
function collectItems(
  rows: { pointId: string[]; response: string[]; location: string[] },
  validIds: Set<string>,
): { items: ResponseItem[] } | { error: string } {
  const rowCount = Math.max(rows.pointId.length, rows.response.length, rows.location.length);
  const items: ResponseItem[] = [];
  for (let i = 0; i < rowCount; i += 1) {
    const pointId = rows.pointId[i] ?? "";
    const response = rows.response[i] ?? "";
    const location = rows.location[i] ?? "";
    if (!response && !location) continue; // nothing said, nothing to keep
    if (!validIds.has(pointId)) return { error: "That comment no longer matches this review." };
    items.push({ pointId, response, location });
  }
  return { items };
}

/** The author's point-by-point response to one review of their own work.
 *  Only the author the review is about may write it — never the reviewer,
 *  and never a third participant. */
export async function submitResponse(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const caller = await currentParticipant();
  if (!caller) return { ok: false, message: "Sign in first." };

  const form = parseForm(responseSchema, formData);
  if (!form.ok) return { ok: false, message: form.message };

  // listReviewsFor(caller.id) only ever returns reviews about the caller, so
  // finding the id there IS the authorisation check.
  const review = (await listReviewsFor(caller.id)).find((r) => r.id === form.data.reviewId);
  if (!review) return { ok: false, message: "That review isn't yours to respond to." };

  const validIds = new Set<string>(
    review.points.length > 0 ? review.points.map((p) => p.id) : REVIEW_POINT_CATEGORIES,
  );

  const parsed = collectItems(form.data, validIds);
  if ("error" in parsed) return { ok: false, message: parsed.error };

  const replaced = await saveResponse({
    reviewId: review.id,
    participantId: caller.id,
    reviewerId: review.reviewerId,
    strategy: form.data.strategy,
    items: parsed.items,
  });

  // No dedicated EVENT_ACTIONS entry for a revision response exists —
  // EVENT_ACTIONS is a closed union outside this file's remit, so this rides
  // "upload" with a detail that names what it actually was.
  await logEvent({
    edition: caller.edition,
    actor: { id: caller.id, name: caller.name },
    action: replaced ? "response_updated" : "response_submitted",
    subjectId: review.reviewerId,
    detail: `review #${review.id}`,
  });

  revalidatePath("/me");
  return { ok: true, message: replaced ? "Response updated." : "Response submitted." };
}
