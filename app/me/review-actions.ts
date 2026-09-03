"use server";

/**
 * The one server action behind the in-browser review sheet. Mirrors the
 * authorisation shape of `uploadFile` in ./actions.ts: resolve the caller
 * from the session, then re-check them against a freshly-read participant
 * row rather than trusting anything the form posted.
 */

import { revalidatePath } from "next/cache";

import { z } from "zod";

import { currentParticipant } from "../lib/auth";
import { readConfig } from "../lib/config";
import { notify, portalUrl } from "../lib/mail";
import { reviewReceived } from "../lib/mail-templates";
import { listParticipants, logEvent, saveReview } from "../lib/db";
import { demoGuard,
  arrayOf,
  dbId,
  parseForm,
  pointCategory,
  score,
  text,
  type ActionResult,
} from "../lib/forms";
import {
  REVIEW_CRITERIA,
  type ReviewCriterionKey,
  type ReviewPoint,
} from "../lib/types";

export type { ActionResult };

/** Every review targets round 2: reviews go back to the author once, after
 *  the round-1 submission — there is no per-round review to pick. */
const REVIEW_ROUND = 2;

const reviewSchema = z.object({
  participantId: dbId,
  note: text(500, "Note to the author"),
  point_id: arrayOf(z.string().trim()),
  point_category: arrayOf(pointCategory),
  point_text: arrayOf(z.string().trim()),
  // score_<criterion>, each optional: a reviewer may leave one blank.
  ...Object.fromEntries(
    REVIEW_CRITERIA.map(({ key }) => [`score_${key}`, z.union([z.literal(""), score]).optional()]),
  ),
});

type ReviewForm = z.infer<typeof reviewSchema>;

function collectScores(data: ReviewForm): Partial<Record<ReviewCriterionKey, number>> {
  const scores: Partial<Record<ReviewCriterionKey, number>> = {};
  for (const { key } of REVIEW_CRITERIA) {
    const raw = (data as Record<string, unknown>)[`score_${key}`];
    if (typeof raw === "number") scores[key] = raw;
  }
  return scores;
}

/**
 * Comments arrive as parallel rows. Blank rows are dropped. An id supplied by
 * the form is reused so a response already written against that comment stays
 * attached; a row without one, or with a duplicate, gets a fresh id.
 */
function collectPoints(data: ReviewForm): ReviewPoint[] {
  const points: ReviewPoint[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < data.point_text.length; i += 1) {
    const text = data.point_text[i];
    if (!text) continue;
    const category = data.point_category[i] ?? "comment";
    let id = data.point_id[i] ?? "";
    if (!id || seen.has(id)) id = crypto.randomUUID().slice(0, 8);
    seen.add(id);
    points.push({ id, category, text });
  }
  return points;
}

export async function submitReview(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  { const demo = demoGuard(); if (demo) return demo; }
  const caller = await currentParticipant();
  if (!caller) return { ok: false, message: "Sign in first." };

  const form = parseForm(reviewSchema, formData);
  if (!form.ok) return { ok: false, message: form.message };
  const { participantId } = form.data;

  const target = (await listParticipants(caller.edition)).find((p) => p.id === participantId);
  if (!target || (target.reviewer1Id !== caller.id && target.reviewer2Id !== caller.id)) {
    return { ok: false, message: "You are not a reviewer for this participant." };
  }

  const points = collectPoints(form.data);
  if (points.length === 0) {
    return { ok: false, message: "Add at least one comment — the author replies to these one by one." };
  }

  const replaced = await saveReview({
    participantId,
    reviewerId: caller.id,
    round: REVIEW_ROUND,
    scores: collectScores(form.data),
    points,
    note: form.data.note,
  });

  await logEvent({
    edition: caller.edition,
    actor: { id: caller.id, name: caller.name },
    action: replaced ? "review_updated" : "review_submitted",
    subjectId: participantId,
  });

  // Only on the first submission: a reviewer polishing their wording should
  // not mail the author again each time.
  if (!replaced) {
    const config = await readConfig();
    await notify(
      target.email,
      reviewReceived(config, portalUrl(), {
        name: target.name,
        reviewerName: caller.name,
        comments: points.length,
      }),
    );
  }

  revalidatePath("/me");
  return { ok: true, message: replaced ? "Review updated." : "Review submitted." };
}
