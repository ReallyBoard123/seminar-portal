"use server";

/**
 * Server actions for the organiser page. Every one of these re-resolves the
 * caller from the session cookie and re-checks `isOrganizer` itself — the
 * page's own gate only protects the initial render, not a POST that could be
 * replayed or forged from the browser.
 *
 * The one exception is `bootstrapImport`, which has no session to check yet
 * (there is no organiser before the first import) and instead gates on the
 * edition having zero participants — see its own comment.
 */

import { revalidatePath } from "next/cache";
import { put } from "@vercel/blob";
import { z } from "zod";

import { currentParticipant } from "@/app/lib/auth";
import { readConfig, writeConfig } from "@/app/lib/config";
import {
  addFile,
  addParticipants,
  listParticipants,
  logEvent,
  resetPin,
  updateParticipant,
  type NewParticipant,
} from "@/app/lib/db";
import { demoGuard, httpUrl, dbId, parseObject, sanitizeFilename, text, type ActionResult } from "@/app/lib/forms";
import { FORMAT_KEYS, isFormatKey, type FormatKey, type Participant, type SeminarConfig } from "@/app/lib/types";

export type { ActionResult };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

async function requireOrganizer(): Promise<Participant | null> {
  const participant = await currentParticipant();
  return participant?.isOrganizer || participant?.isAdmin ? participant : null;
}

/**
 * The narrower gate. Only an admin may change the roster, reset somebody's
 * PIN, or grant rights — so an organiser cannot lock the others out, and the
 * set of people with power stays in one pair of hands.
 */
async function requireAdmin(): Promise<Participant | null> {
  const participant = await currentParticipant();
  return participant?.isAdmin ? participant : null;
}

// ---------------------------------------------------------------------------
// CSV import — all-or-nothing, every bad line reported with its line number.
// ---------------------------------------------------------------------------

type ParsedParticipant = { name: string; email: string; institution: string; format: FormatKey | "" };

/** Splits one CSV line, honouring double-quoted fields (institution names
 *  and titles sometimes contain a comma). */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields.map((f) => f.trim());
}

function parseParticipantCsv(text: string): { rows: ParsedParticipant[]; errors: string[] } {
  const lines = text.split(/\r?\n/);
  const errors: string[] = [];
  const rows: ParsedParticipant[] = [];
  let header: Record<string, number> | null = null;
  let headerSeen = false;

  lines.forEach((raw, i) => {
    const lineNo = i + 1;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) return; // blank line or comment — the template ships one

    const fields = splitCsvLine(raw);
    if (!headerSeen) {
      headerSeen = true;
      const names = fields.map((f) => f.toLowerCase());
      const required = ["name", "email", "institution", "format"];
      const missing = required.filter((r) => !names.includes(r));
      if (missing.length > 0) {
        errors.push(`line ${lineNo}: header is missing column(s): ${missing.join(", ")}`);
        return;
      }
      header = Object.fromEntries(names.map((n, idx) => [n, idx]));
      return;
    }
    if (!header) return; // bad header already reported; stop reading rows

    const get = (key: string) => (fields[header![key]] ?? "").trim();
    const name = get("name");
    const format = get("format");
    if (!name) {
      errors.push(`line ${lineNo}: name is required`);
      return;
    }
    if (format && !isFormatKey(format)) {
      errors.push(`line ${lineNo}: invalid format "${format}" — must be one of ${FORMAT_KEYS.join(", ")}, or blank`);
      return;
    }
    rows.push({ name, email: get("email"), institution: get("institution"), format: format as FormatKey | "" });
  });

  if (!headerSeen) return { rows: [], errors: ["line 1: file is empty — no header row"] };
  if (errors.length > 0) return { rows: [], errors }; // all-or-nothing
  if (rows.length === 0) return { rows: [], errors: ["no data rows found"] };
  return { rows, errors: [] };
}

/**
 * The bootstrap import. Before the first participant exists there is no
 * organiser to sign in as, so this is the only action that runs without a
 * session — gated instead on the edition having zero participants, checked
 * here and not only on the page, so it stops working the instant that stops
 * being true.
 */
export async function bootstrapImport(_prev: ActionResult, payload: { csv: string }): Promise<ActionResult> {
  { const demo = demoGuard(); if (demo) return demo; }
  const config = await readConfig();
  const existing = await listParticipants(config.edition);
  if (existing.length > 0) {
    return { ok: false, message: "this edition already has participants — ask an organiser for your link" };
  }

  const { rows, errors } = parseParticipantCsv(payload.csv);
  if (errors.length > 0) return { ok: false, message: errors.join("\n") };

  const newRows: NewParticipant[] = rows.map((r, i) => ({
    edition: config.edition,
    ...r,
    // Whoever is listed first runs the edition, outright.
    isOrganizer: i === 0,
    isAdmin: i === 0,
  }));
  const created = await addParticipants(newRows);
  if (created === 0) return { ok: false, message: "nothing was imported" };

  const roster = await listParticipants(config.edition);
  const organizer = roster.find((p) => p.isOrganizer);
  // No session exists yet at bootstrap time — nobody to attribute this to.
  await logEvent({
    edition: config.edition,
    actor: null,
    action: "import_roster",
    detail: `bootstrap: imported ${created}${organizer ? `, organiser is ${organizer.name}` : ""}`,
  });
  revalidatePath("/admin");
  return {
    ok: true,
    message: organizer
      ? `Imported ${created} participant${created === 1 ? "" : "s"}. ${organizer.name} is now the organiser — sign in at /signin as "${organizer.name}" to set a PIN and open the admin page.`
      : `Imported ${created} participant${created === 1 ? "" : "s"}.`,
  };
}

export async function importParticipants(
  _prev: ActionResult,
  payload: { csv: string },
): Promise<ActionResult> {
  { const demo = demoGuard(); if (demo) return demo; }
  const organizer = await requireAdmin();
  if (!organizer) return { ok: false, message: "not authorised" };

  const { rows, errors } = parseParticipantCsv(payload.csv);
  if (errors.length > 0) return { ok: false, message: errors.join("\n") };

  const created = await addParticipants(rows.map((r) => ({ edition: organizer.edition, ...r })));
  const skipped = rows.length - created;
  await logEvent({
    edition: organizer.edition,
    actor: { id: organizer.id, name: organizer.name },
    action: "import_roster",
    detail: `imported ${created}, skipped ${skipped} duplicate${skipped === 1 ? "" : "s"}`,
  });
  revalidatePath("/admin");
  return {
    ok: true,
    message:
      `Imported ${created} participant${created === 1 ? "" : "s"}` +
      (skipped > 0 ? `, skipped ${skipped} duplicate name${skipped === 1 ? "" : "s"}` : "") +
      ".",
  };
}

// ---------------------------------------------------------------------------
// Per-participant assignment: format, reviewer 1, PostDoc reviewer.
// ---------------------------------------------------------------------------

const assignmentSchema = z
  .object({
    participantId: dbId,
    reviewer1Id: z.union([dbId, z.null()]),
    reviewer2Id: z.union([dbId, z.null()]),
    discussantId: z.union([dbId, z.null()]),
    postdocReviewer: z.string(),
    format: z.string(),
    isOrganizer: z.boolean(),
    isAdmin: z.boolean(),
    email: text(200, "Email"),
    institution: text(200, "Institution"),
    homepageUrl: httpUrl("Staff page"),
  })
  .superRefine((v, ctx) => {
    if (v.reviewer1Id === v.participantId || v.reviewer2Id === v.participantId) {
      ctx.addIssue({ code: "custom", message: "a participant cannot review themself", path: [] });
      return;
    }
    if (v.format !== "" && !isFormatKey(v.format)) {
      ctx.addIssue({ code: "custom", message: "invalid format", path: [] });
    }
  });

export async function saveAssignment(
  _prev: ActionResult,
  payload: {
    participantId: number;
    reviewer1Id: number | null;
    reviewer2Id: number | null;
    discussantId: number | null;
    postdocReviewer: string;
    format: string;
    isOrganizer: boolean;
    isAdmin: boolean;
    email: string;
    institution: string;
    homepageUrl: string;
  },
): Promise<ActionResult> {
  { const demo = demoGuard(); if (demo) return demo; }
  const organizer = await requireOrganizer();
  if (!organizer) return { ok: false, message: "not authorised" };

  const parsed = parseObject(assignmentSchema, payload);
  if (!parsed.ok) return { ok: false, message: parsed.message };

  const roster = await listParticipants(organizer.edition);
  for (const id of [payload.reviewer1Id, payload.reviewer2Id, payload.discussantId]) {
    if (id !== null && !roster.some((p) => p.id === id)) {
      return { ok: false, message: "that person is not part of this edition" };
    }
  }
  const target = roster.find((p) => p.id === payload.participantId);

  await updateParticipant(payload.participantId, {
    email: parsed.data.email,
    institution: parsed.data.institution,
    homepageUrl: parsed.data.homepageUrl,
    reviewer1Id: parsed.data.reviewer1Id,
    reviewer2Id: parsed.data.reviewer2Id,
    discussantId: parsed.data.discussantId,
    postdocReviewer: parsed.data.postdocReviewer,
    format: parsed.data.format,
    // Rights are an admin's to grant; an organiser saving this row must not
    // be able to promote themselves or demote anyone else.
    ...(organizer.isAdmin
      ? { isOrganizer: parsed.data.isOrganizer, isAdmin: parsed.data.isAdmin }
      : {}),
  });

  if (target && target.reviewer1Id !== payload.reviewer1Id) {
    const reviewer = roster.find((p) => p.id === payload.reviewer1Id);
    await logEvent({
      edition: organizer.edition,
      actor: { id: organizer.id, name: organizer.name },
      action: "assign_reviewer1",
      subjectId: payload.participantId,
      detail: reviewer ? `assigned ${reviewer.name} as reviewer 1` : "cleared reviewer 1",
    });
  }

  revalidatePath("/admin");
  return { ok: true, message: "Saved." };
}

/**
 * Clear a name's PIN and rotate its token — see `resetPin` in db.ts. Only for
 * when the real owner of that name asks: it signs them out of every device
 * that had a session open, and the next person to type that name in gets to
 * set the new PIN.
 */
export async function resetPinAction(
  _prev: ActionResult,
  payload: { participantId: number },
): Promise<ActionResult> {
  { const demo = demoGuard(); if (demo) return demo; }
  const organizer = await requireAdmin();
  if (!organizer) return { ok: false, message: "not authorised" };

  const parsed = parseObject(z.object({ participantId: dbId }), payload);
  if (!parsed.ok) return { ok: false, message: parsed.message };

  await resetPin(payload.participantId);
  await logEvent({
    edition: organizer.edition,
    actor: { id: organizer.id, name: organizer.name },
    action: "pin_reset",
    subjectId: payload.participantId,
  });
  revalidatePath("/admin");
  return { ok: true, message: "PIN reset — that person is signed out everywhere and can set a new one next time." };
}

// ---------------------------------------------------------------------------
// Edition config.
// ---------------------------------------------------------------------------

const milestoneSchema = z.object({
  key: z.string(),
  label: z.string(),
  dueOn: z.string(),
  description: z.string(),
  // Absent means deadline. Without this line the parsed config would drop
  // the flag and every event would quietly become a deadline again.
  kind: z.enum(["deadline", "event"]).optional(),
});

const formatRuleSchema = z.object({
  // The four format keys are a closed union, and the config's consumers rely
  // on that — z.string() here would launder any typo into the type.
  key: z.enum(FORMAT_KEYS),
  label: z.string(),
  goal: z.string(),
  deliverable: z.string(),
  length: z.string(),
  lengthDisputed: z.boolean().optional(),
  lengthNote: z.string().optional(),
});

const templateLinkSchema = z.object({
  label: z.string(),
  url: z.string(),
  note: z.string().optional(),
  hidden: z.boolean().optional(),
});

/** Mirrors the old `validateConfig`: the type shape above is structural
 *  (every field must be the right kind of value), the business rules below
 *  run in the same order and stop at the first problem, same as before. */
const configSchema = z
  .object({
    edition: z.number(),
    title: z.string(),
    hosts: z.array(z.string()),
    city: z.string(),
    startsOn: z.string(),
    endsOn: z.string(),
    contactEmail: z.string(),
    techContactEmail: z.string(),
    socialActivity: z.string(),
    milestones: z.array(milestoneSchema),
    formats: z.array(formatRuleSchema),
    templates: z.array(templateLinkSchema),
    reviewerCircleNote: z.string(),
    discussantNote: z.string(),
    shortName: z.string(),
    reviewerCount: z.union([z.literal(1), z.literal(2)]),
    reviewerTwoSelfPick: z.boolean(),
    useDiscussant: z.boolean(),
  })
  .superRefine((config, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message, path: [] });
    if (!Number.isInteger(config.edition) || config.edition <= 0) return fail("edition must be a positive number");
    if (!config.title.trim()) return fail("title is required");
    if (!config.shortName.trim()) return fail("short name is required");
    if (!ISO_DATE.test(config.startsOn) || !ISO_DATE.test(config.endsOn)) return fail("dates must be yyyy-mm-dd");
    if (!config.contactEmail.trim()) return fail("contact email is required");
    const keys = new Set(config.formats.map((f) => f.key));
    for (const key of FORMAT_KEYS) {
      if (!keys.has(key)) return fail(`missing the format rule for ${key}`);
    }
    for (const m of config.milestones) {
      if (!m.label.trim()) return fail("every milestone needs a label");
      if (!ISO_DATE.test(m.dueOn)) return fail(`milestone "${m.label}" has an invalid date`);
    }
    for (const t of config.templates) {
      if (!t.label.trim()) return fail("every template needs a label");
    }
  });

export async function saveConfig(
  _prev: ActionResult,
  payload: { config: SeminarConfig },
): Promise<ActionResult> {
  { const demo = demoGuard(); if (demo) return demo; }
  const organizer = await requireOrganizer();
  if (!organizer) return { ok: false, message: "not authorised" };

  const parsed = parseObject(configSchema, payload.config);
  if (!parsed.ok) return { ok: false, message: parsed.message };

  await writeConfig(parsed.data);
  await logEvent({
    edition: organizer.edition,
    actor: { id: organizer.id, name: organizer.name },
    action: "config_saved",
  });
  revalidatePath("/admin");
  revalidatePath("/");
  revalidatePath("/people");
  revalidatePath("/me");
  return { ok: true, message: "Saved." };
}

// ---------------------------------------------------------------------------
// Template uploads.
// ---------------------------------------------------------------------------

// ponytail: Next's server-action body cap defaults to 1MB, which a
// Georgia-styled Word template can exceed — raise
// experimental.serverActions.bodySizeLimit in next.config.ts if uploads
// start failing before ever reaching this check.
// The kick-off deck is a slide export, so the ceiling is not a Word document's.
const MAX_TEMPLATE_BYTES = 25 * 1024 * 1024;

const templateUploadSchema = z.object({
  label: z.string(),
  file: z
    .instanceof(File)
    .refine((f) => f.size > 0, "choose a file first")
    .refine((f) => f.size <= MAX_TEMPLATE_BYTES, "file is too large")
    // Templates are Word files; the kick-off deck and the revision guide are
    // PDFs. Both are things the organiser hands out, so both belong here.
    .refine(
      (f) => /\.(docx?|pdf|pptx?)$/i.test(f.name),
      "expected a .doc, .docx, .pdf or .pptx file",
    ),
});

export async function saveTemplateUpload(
  _prev: ActionResult,
  payload: { label: string; file: File },
): Promise<ActionResult> {
  { const demo = demoGuard(); if (demo) return demo; }
  const organizer = await requireOrganizer();
  if (!organizer) return { ok: false, message: "not authorised" };

  const parsed = parseObject(templateUploadSchema, payload);
  if (!parsed.ok) return { ok: false, message: parsed.message };

  const { file, label } = payload;
  // Same treatment participant uploads get: this name becomes a blob path and
  // a `content-disposition` value in /api/file.
  const filename = sanitizeFilename(file.name);

  const config = await readConfig();
  if (!config.templates.some((t) => t.label === label)) {
    return { ok: false, message: "unknown template slot — save the label first" };
  }

  const blob = await put(`templates/${config.edition}/${filename}`, file, {
    access: "private",
    addRandomSuffix: true,
  });

  // Templates ride the same /api/file download path as everything else,
  // so a blob URL never reaches the browser. They belong to nobody, so that
  // route serves `template` files to anyone already past the portal password
  // rather than requiring a session.
  const fileId = await addFile({
    participantId: organizer.id,
    authorId: organizer.id,
    kind: "template",
    round: 1,
    blobUrl: blob.url,
    filename,
    size: file.size,
    note: `template: ${label}`,
  });

  await logEvent({
    edition: organizer.edition,
    actor: { id: organizer.id, name: organizer.name },
    action: "upload",
    fileId,
    detail: `template: ${label}`,
  });

  await writeConfig({
    ...config,
    templates: config.templates.map((t) => (t.label === label ? { ...t, url: `/api/file?id=${fileId}` } : t)),
  });
  revalidatePath("/admin");
  revalidatePath("/");
  return { ok: true, message: `Uploaded ${filename}.` };
}
