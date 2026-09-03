"use server";

/**
 * Server actions for the participant page. Every action resolves the caller
 * from the session cookie and re-checks authorisation against the database —
 * a participant id or file id arriving from the browser is never trusted on
 * its own.
 */

import { put } from "@vercel/blob";
import { revalidatePath } from "next/cache";

import { z } from "zod";

import { currentParticipant } from "../lib/auth";
import { readConfig } from "../lib/config";
import { notify, portalUrl } from "../lib/mail";
import {
  pickedAsDiscussant,
  pickedAsReviewer,
  submissionReceived,
} from "../lib/mail-templates";
import { addFile, deleteFile, getFile, listParticipants, logEvent, updateParticipant } from "../lib/db";
import { demoGuard, text, dbId, optionalId, parseForm, round as roundField, sanitizeFilename, type ActionResult } from "../lib/forms";
import { PARTICIPANT_FILE_KINDS, type FileKind, type Round } from "../lib/types";

export type { ActionResult };

const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED_EXT = [".pdf", ".doc", ".docx", ".pptx", ".md", ".txt"];

function extOf(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx === -1 ? "" : filename.slice(idx).toLowerCase();
}

// Not FILE_KINDS: "template" is organiser-only and world-readable inside the
// portal, so a participant must never be able to post one.
const uploadSchema = z.object({
  participantId: dbId,
  note: text(500, "Note"),
  kind: z.enum(PARTICIPANT_FILE_KINDS as unknown as [string, ...string[]], {
    message: "Unrecognised upload type.",
  }),
  round: roundField,
});

/** Upload a the seminar file. `kind: "review"` targets someone else's row and
 *  requires the caller to be one of their two reviewers; every other kind
 *  targets the caller's own row. */
export async function uploadFile(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  { const demo = demoGuard(); if (demo) return demo; }
  const caller = await currentParticipant();
  if (!caller) return { ok: false, message: "Sign in first." };

  const form = parseForm(uploadSchema, formData);
  if (!form.ok) return { ok: false, message: form.message };
  const { participantId: targetId, kind, round, note } = form.data;
  // The File itself is not describable as a zod string schema, so it stays a
  // FormData lookup and is checked below on size, extension and name.
  const file = formData.get("file");

  let targetEdition = caller.edition;
  if (kind === "review") {
    const target = (await listParticipants(caller.edition)).find((p) => p.id === targetId);
    if (!target || (target.reviewer1Id !== caller.id && target.reviewer2Id !== caller.id)) {
      return { ok: false, message: "You are not a reviewer for this participant." };
    }
    targetEdition = target.edition;
  } else {
    if (targetId !== caller.id) {
      return { ok: false, message: "You can only upload your own deliverable." };
    }
    if (kind === "change_history" && round !== 3) {
      return { ok: false, message: "Change history is uploaded in round 3." };
    }
    if (kind === "slide" && caller.format !== "full_paper") {
      return { ok: false, message: "Only the journal paper format uploads a slide." };
    }
  }

  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose a file first." };
  if (file.size > MAX_BYTES) return { ok: false, message: "Files must be 20 MB or smaller." };

  const filename = sanitizeFilename(file.name);
  if (!ALLOWED_EXT.includes(extOf(filename))) {
    return { ok: false, message: "Allowed types: PDF, Word, PowerPoint, Markdown, plain text." };
  }

  const blob = await put(`submissions/${targetEdition}/${targetId}/${kind}-r${round}-${filename}`, file, {
    access: "private",
    addRandomSuffix: true,
  });

  const fileId = await addFile({
    participantId: targetId,
    authorId: caller.id,
    kind: kind as FileKind,
    round: round as Round,
    blobUrl: blob.url,
    filename,
    size: file.size,
    note,
  });

  await logEvent({
    edition: targetEdition,
    actor: { id: caller.id, name: caller.name },
    action: "upload",
    subjectId: targetId,
    fileId,
    detail: `${kind} · round ${round} · ${filename}`,
  });

  if (kind !== "review") {
    const config = await readConfig();
    await notify(
      caller.email,
      submissionReceived(config, portalUrl(), {
        name: caller.name,
        kind,
        round,
        filename,
      }),
    );
  }

  revalidatePath("/me");
  return { ok: true, message: "Uploaded." };
}

/** Bind `fileId` on the caller side (`removeFile.bind(null, id)`) so the
 *  remaining `(prevState, formData)` shape fits useActionState. */
/* eslint-disable @typescript-eslint/no-unused-vars -- prevState/formData required by useActionState's action signature */
export async function removeFile(
  fileId: number,
  _prev: ActionResult,
  _formData: FormData,
): Promise<ActionResult> {
  /* eslint-enable @typescript-eslint/no-unused-vars */
  const caller = await currentParticipant();
  if (!caller) return { ok: false, message: "Sign in first." };

  const file = await getFile(fileId);
  if (!file || file.authorId !== caller.id) {
    return { ok: false, message: "You can only remove files you uploaded." };
  }

  await deleteFile(fileId);
  await logEvent({
    edition: caller.edition,
    actor: { id: caller.id, name: caller.name },
    action: "delete_file",
    subjectId: file.participantId,
    fileId: file.id,
    detail: `${file.kind} · round ${file.round} · ${file.filename}`,
  });
  revalidatePath("/me");
  return { ok: true, message: "Removed." };
}

// An unpicked select posts "" or "none"; both mean "nobody".
const rolesSchema = z.object({
  reviewer2Id: optionalId,
  discussantId: optionalId,
});

/** Save the caller's own reviewer-2 and discussant picks. */
export async function updateRoles(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  { const demo = demoGuard(); if (demo) return demo; }
  const caller = await currentParticipant();
  if (!caller) return { ok: false, message: "Sign in first." };

  const form = parseForm(rolesSchema, formData);
  if (!form.ok) return { ok: false, message: form.message };
  // The config decides which picks exist; a pick the process doesn't offer is
  // silently kept at its current value rather than trusted from the form.
  const processConfig = await readConfig();
  const selfPick = processConfig.reviewerCount === 2 && processConfig.reviewerTwoSelfPick;
  const reviewer2Id = selfPick ? form.data.reviewer2Id : caller.reviewer2Id;
  const discussantId = processConfig.useDiscussant ? form.data.discussantId : caller.discussantId;

  if (reviewer2Id === caller.id || discussantId === caller.id) {
    return { ok: false, message: "You cannot pick yourself." };
  }
  if (reviewer2Id !== null && reviewer2Id === caller.reviewer1Id) {
    return { ok: false, message: "Reviewer 2 must be different from reviewer 1." };
  }

  const roster = await listParticipants(caller.edition);
  const editionIds = new Set(roster.map((p) => p.id));
  if (reviewer2Id !== null && !editionIds.has(reviewer2Id)) {
    return { ok: false, message: "Unknown reviewer." };
  }
  if (discussantId !== null && !editionIds.has(discussantId)) {
    return { ok: false, message: "Unknown discussant." };
  }

  await updateParticipant(caller.id, { reviewer2Id, discussantId });

  // One line per pick, and only when it actually changed — resaving the same
  // choice must not write another line into the trail.
  if (reviewer2Id !== caller.reviewer2Id) {
    const picked = roster.find((p) => p.id === reviewer2Id);
    await logEvent({
      edition: caller.edition,
      actor: { id: caller.id, name: caller.name },
      action: "pick_reviewer2",
      subjectId: caller.id,
      detail: picked ? `picked ${picked.name} as reviewer 2` : "cleared reviewer 2",
    });
    if (picked) {
      const config = await readConfig();
      await notify(
        picked.email,
        pickedAsReviewer(config, portalUrl(), {
          name: picked.name,
          authorName: caller.name,
          workingTitle: caller.workingTitle,
        }),
      );
    }
  }
  if (discussantId !== caller.discussantId) {
    const picked = roster.find((p) => p.id === discussantId);
    await logEvent({
      edition: caller.edition,
      actor: { id: caller.id, name: caller.name },
      action: "pick_discussant",
      subjectId: caller.id,
      detail: picked ? `picked ${picked.name} as discussant` : "cleared discussant",
    });
    if (picked) {
      const config = await readConfig();
      await notify(
        picked.email,
        pickedAsDiscussant(config, portalUrl(), {
          name: picked.name,
          authorName: caller.name,
        }),
      );
    }
  }

  revalidatePath("/me");
  return { ok: true, message: "Saved." };
}
