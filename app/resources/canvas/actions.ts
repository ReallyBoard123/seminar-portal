"use server";

/**
 * Save the caller's own canvas — whichever one their format has.
 *
 * No participantId travels through the form: the caller is always resolved
 * from the session cookie, and the write always targets that row — the same
 * shape as profile-actions.ts, for the same reason. The schema accepts every
 * canvas's field keys, since one save only ever posts the keys of the
 * definition the caller is looking at, but this action has no idea which one
 * that was.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { currentParticipant } from "../../lib/auth";
import { logEvent, saveCanvas } from "../../lib/db";
import { parseForm, pickPosted, text, type ActionResult } from "../../lib/forms";
import { CANVASES, type CanvasFieldKey } from "../../lib/types";

export type { ActionResult };

// Most cells are open-ended prose; a few short ones (a title, a one-line
// question, a headline word) get a tighter ceiling than the default.
const SHORT_MAX: Partial<Record<CanvasFieldKey, number>> = {
  workingTitle: 300,
  researchQuestion: 400,
  whatsNew: 500,
  soWhat: 500,
  contribution: 600,
};
const DEFAULT_MAX = 800;

const shape = {} as Record<CanvasFieldKey, ReturnType<typeof text>>;
for (const def of Object.values(CANVASES)) {
  for (const f of def.fields) shape[f.key] = text(SHORT_MAX[f.key] ?? DEFAULT_MAX, f.label);
}
const canvasSchema = z.object(shape);

export async function saveCanvasFields(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const caller = await currentParticipant();
  if (!caller) return { ok: false, message: "Sign in first." };

  const parsed = parseForm(canvasSchema, formData);
  if (!parsed.ok) return parsed;

  // Only the keys this form actually posted — the schema's defaults would
  // otherwise blank every other canvas sharing the caller's blob.
  await saveCanvas(caller.id, pickPosted(parsed.data, formData));

  // "profile_saved" is the closest fit in the closed EVENT_ACTIONS union — the
  // canvas is self-entered free text about the caller's own work, same as the
  // researcher profile, and profile-actions.ts already sets this precedent.
  await logEvent({
    edition: caller.edition,
    actor: { id: caller.id, name: caller.name },
    action: "profile_saved",
    subjectId: caller.id,
    detail: "canvas updated",
  });

  revalidatePath("/resources/canvas");
  return { ok: true, message: "Saved." };
}
