/**
 * Form parsing for the portal's server actions.
 *
 * Every action takes a `FormData` full of strings and has to coerce, trim,
 * range-check and length-cap it before touching the database. Seven actions
 * doing that by hand had already started to drift — each with its own idea of
 * what "invalid" reads like. One schema per action, declared here.
 *
 * This is a plain module, not a "use server" file: it exports schemas and a
 * parser, and a server-action file may only export async functions.
 */

import { z } from "zod";

import { REVIEW_POINT_CATEGORIES, SCORE_MAX, SCORE_MIN } from "./types";

export type ActionResult = { ok: boolean; message: string };

/**
 * FormData allows repeated keys. Collect them into arrays so a schema can
 * describe `point_text` as a list, and leave single values as strings.
 */
function formToObject(formData: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of new Set(formData.keys())) {
    const all = formData.getAll(key);
    out[key] = all.length > 1 ? all : all[0];
  }
  return out;
}

/**
 * Parse against a schema, returning the first problem as a sentence rather
 * than throwing. Actions report `{ ok, message }` to the UI, so a thrown
 * ZodError would only have to be caught and flattened at every call site.
 */
export function parseForm<T extends z.ZodType>(
  schema: T,
  formData: FormData,
): { ok: true; data: z.infer<T> } | { ok: false; message: string } {
  return parseObject(schema, formToObject(formData));
}

/**
 * The same, for the actions called as `dispatch({ ... })` with a plain object
 * rather than a FormData. Without this each of those actions grows its own
 * copy of the issue-flattening.
 */
export function parseObject<T extends z.ZodType>(
  schema: T,
  value: unknown,
): { ok: true; data: z.infer<T> } | { ok: false; message: string } {
  const result = schema.safeParse(value);
  if (result.success) return { ok: true, data: result.data };
  const first = result.error.issues[0];
  const where = first?.path.length ? `${String(first.path[0])}: ` : "";
  return { ok: false, message: `${where}${first?.message ?? "That input could not be read."}` };
}

// ---------------------------------------------------------------------------
// Field vocabulary
// ---------------------------------------------------------------------------

/** A field that may be repeated. One value arrives as a string, not an array. */
export const arrayOf = <T extends z.ZodType>(inner: T) =>
  z.preprocess(
    (v) => (Array.isArray(v) ? v : v === undefined || v === "" ? [] : [v]),
    z.array(inner),
  );

/** Trimmed free text with a stated ceiling, empty allowed. */
export const text = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} is limited to ${max} characters.`)
    .default("");

/**
 * Restrict a parsed object to the keys the form actually carried. Schemas
 * with `.default("")` invent values for absent fields; anything persisting a
 * partial update (the canvases share one JSON blob) must drop those.
 */
export function pickPosted<T extends Record<string, unknown>>(data: T, formData: FormData): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(data) as (keyof T)[]) {
    if (formData.has(key as string)) out[key] = data[key];
  }
  return out;
}

export const requiredText = (max: number, label: string) =>
  z.string().trim().min(1, `${label} is required.`).max(max, `${label} is limited to ${max} characters.`);

export const dbId = z.coerce.number().int().positive("That record could not be identified.");

export const round = z.coerce
  .number()
  .int()
  .refine((n) => n === 1 || n === 2 || n === 3, "Unrecognised round.");

export const score = z.coerce
  .number()
  .int()
  .min(SCORE_MIN, `Scores run from ${SCORE_MIN} to ${SCORE_MAX}.`)
  .max(SCORE_MAX, `Scores run from ${SCORE_MIN} to ${SCORE_MAX}.`);

export const pointCategory = z.enum(REVIEW_POINT_CATEGORIES);

/**
 * A link another participant's browser will follow. Empty is fine; anything
 * that is not http or https is refused outright rather than coerced, because
 * a `javascript:` URL rendered into an anchor on a page the whole cohort
 * reads is the one genuine injection vector in this app.
 */
export const httpUrl = (label: string, max = 500) =>
  z
    .string()
    .trim()
    .default("")
    // Length first, so a value that is both too long and not http(s) reports
    // the length — the same order the hand-written checks used.
    .refine((v) => v.length <= max, `${label} is limited to ${max} characters.`)
    .refine((v) => {
      if (!v) return true;
      try {
        const url = new URL(v);
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    }, `${label} must be a full http:// or https:// address.`);

export const orcid = z
  .string()
  .trim()
  .default("")
  .refine(
    (v) => v === "" || /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(v),
    "ORCID looks like 0000-0002-1825-0097.",
  );

/**
 * An uploaded file's name, reduced to something safe to put in a blob path
 * and in a `content-disposition` header. A browser never sends a path or a
 * newline here, but a server action is an RPC and the payload is whatever the
 * caller posts — and a CRLF in that header makes the download route throw.
 */
export function sanitizeFilename(raw: string): string {
  const base = raw.split(/[/\\]/).pop() || "upload";
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "");
  return cleaned.slice(0, 120) || "upload";
}

/** A checkbox or select that should resolve to a participant id or nothing. */
export const optionalId = z
  .union([z.literal(""), z.literal("none"), z.coerce.number().int().positive()])
  .transform((v) => (v === "" || v === "none" ? null : v));
