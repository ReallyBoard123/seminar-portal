/**
 * the seminar data layer: two tables in the same Turso database the review desk
 * already mirrors into. Participants and their uploaded files.
 *
 * Every upload — a submission, a review, a change history, a slide — is one
 * `file` row, so there is one upload path and one listing path instead
 * of four of each. `participant_id` is whose deliverable the file concerns and
 * `author_id` is who uploaded it; they differ exactly when a reviewer uploads
 * a review.
 */

import type { Row } from "@libsql/client";

import { client } from "./client";
import { nameKeys, normaliseNameInput } from "./names";
import {
  isFormatKey,
  type EventAction,
  type FileKind,
  type Participant,
  type Round,
  type SeminarEvent,
  type SeminarFile,
  type ResponseItem,
  type ReviewPoint,
  type SeminarResponse,
  type SeminarCanvas,
  type SeminarReview,
} from "./types";

const SCHEMA = [
  // Normally created by the backend's push.py. Repeated here so a local
  // `file:` database works without running a sync first — writeConfig stores
  // the edition config as one row of it.
  `CREATE TABLE IF NOT EXISTS snapshot (
     key TEXT PRIMARY KEY, json TEXT NOT NULL, updated_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS participant (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     edition INTEGER NOT NULL,
     name TEXT NOT NULL,
     email TEXT NOT NULL DEFAULT '',
     institution TEXT NOT NULL DEFAULT '',
     format TEXT NOT NULL DEFAULT '',
     token TEXT NOT NULL,
     reviewer1_id INTEGER,
     reviewer2_id INTEGER,
     postdoc_reviewer TEXT NOT NULL DEFAULT '',
     discussant_id INTEGER,
     is_organizer INTEGER NOT NULL DEFAULT 0,
     is_admin INTEGER NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL,
     pin_hash TEXT NOT NULL DEFAULT '',
     claimed_at TEXT NOT NULL DEFAULT '',
     working_title TEXT NOT NULL DEFAULT '',
     interests TEXT NOT NULL DEFAULT '',
     methods TEXT NOT NULL DEFAULT '',
     phase TEXT NOT NULL DEFAULT '',
     bio TEXT NOT NULL DEFAULT '',
     homepage_url TEXT NOT NULL DEFAULT '',
     scholar_url TEXT NOT NULL DEFAULT '',
     orcid TEXT NOT NULL DEFAULT ''
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS participant_token
     ON participant (token)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS participant_edition_name
     ON participant (edition, name)`,
  `CREATE TABLE IF NOT EXISTS file (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     participant_id INTEGER NOT NULL,
     author_id INTEGER NOT NULL,
     kind TEXT NOT NULL,
     round INTEGER NOT NULL DEFAULT 1,
     blob_url TEXT NOT NULL,
     filename TEXT NOT NULL,
     size INTEGER NOT NULL DEFAULT 0,
     note TEXT NOT NULL DEFAULT '',
     uploaded_at TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS file_participant
     ON file (participant_id)`,
  `CREATE TABLE IF NOT EXISTS review (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     participant_id INTEGER NOT NULL,
     reviewer_id INTEGER NOT NULL,
     round INTEGER NOT NULL DEFAULT 2,
     scores TEXT NOT NULL DEFAULT '{}',
     points TEXT NOT NULL DEFAULT '[]',
     note TEXT NOT NULL DEFAULT '',
     strengths TEXT NOT NULL DEFAULT '',
     weaknesses TEXT NOT NULL DEFAULT '',
     comments TEXT NOT NULL DEFAULT '',
     submitted_at TEXT NOT NULL,
     updated_at TEXT NOT NULL
   )`,
  // One review per reviewer per author per round; re-submitting edits it.
  `CREATE UNIQUE INDEX IF NOT EXISTS review_unique
     ON review (participant_id, reviewer_id, round)`,
  `CREATE TABLE IF NOT EXISTS event (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     at TEXT NOT NULL,
     edition INTEGER NOT NULL,
     actor_id INTEGER,
     actor_name TEXT NOT NULL DEFAULT '',
     action TEXT NOT NULL,
     subject_id INTEGER,
     file_id INTEGER,
     detail TEXT NOT NULL DEFAULT ''
   )`,
  `CREATE INDEX IF NOT EXISTS event_at ON event (at)`,
  `CREATE TABLE IF NOT EXISTS canvas (
     participant_id INTEGER PRIMARY KEY,
     fields TEXT NOT NULL DEFAULT '{}',
     updated_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS response (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     review_id INTEGER NOT NULL,
     participant_id INTEGER NOT NULL,
     reviewer_id INTEGER NOT NULL,
     strategy TEXT NOT NULL DEFAULT '',
     items TEXT NOT NULL DEFAULT '[]',
     submitted_at TEXT NOT NULL,
     updated_at TEXT NOT NULL
   )`,
  // One response per review; re-submitting edits it.
  `CREATE UNIQUE INDEX IF NOT EXISTS response_unique
     ON response (review_id)`,
];

// Columns added after the first edition shipped. CREATE TABLE IF NOT EXISTS
// leaves an existing table alone, so they are patched in explicitly — the
// same approach backend/app/db.py takes for the assignment table.
const ADDED_COLUMNS: Record<string, string> = {
  pin_hash: "ALTER TABLE participant ADD COLUMN pin_hash TEXT NOT NULL DEFAULT ''",
  claimed_at: "ALTER TABLE participant ADD COLUMN claimed_at TEXT NOT NULL DEFAULT ''",
  is_admin: "ALTER TABLE participant ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0",
  working_title: "ALTER TABLE participant ADD COLUMN working_title TEXT NOT NULL DEFAULT ''",
  interests: "ALTER TABLE participant ADD COLUMN interests TEXT NOT NULL DEFAULT ''",
  methods: "ALTER TABLE participant ADD COLUMN methods TEXT NOT NULL DEFAULT ''",
  phase: "ALTER TABLE participant ADD COLUMN phase TEXT NOT NULL DEFAULT ''",
  bio: "ALTER TABLE participant ADD COLUMN bio TEXT NOT NULL DEFAULT ''",
  homepage_url: "ALTER TABLE participant ADD COLUMN homepage_url TEXT NOT NULL DEFAULT ''",
  scholar_url: "ALTER TABLE participant ADD COLUMN scholar_url TEXT NOT NULL DEFAULT ''",
  orcid: "ALTER TABLE participant ADD COLUMN orcid TEXT NOT NULL DEFAULT ''",
};

const ADDED_REVIEW_COLUMNS: Record<string, string> = {
  points: "ALTER TABLE review ADD COLUMN points TEXT NOT NULL DEFAULT '[]'",
  note: "ALTER TABLE review ADD COLUMN note TEXT NOT NULL DEFAULT ''",
};

let schemaReady: Promise<void> | null = null;

/** Create the tables on first use. Cached per server instance, so the common
 *  case is one resolved promise rather than four round trips. */
export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const db = client();
      for (const sql of SCHEMA) await db.execute(sql);
      const info = await db.execute("PRAGMA table_info(participant)");
      const existing = new Set(info.rows.map((r) => String(r.name)));
      for (const [column, sql] of Object.entries(ADDED_COLUMNS)) {
        if (!existing.has(column)) await db.execute(sql);
      }
      const reviewInfo = await db.execute("PRAGMA table_info(review)");
      const reviewCols = new Set(reviewInfo.rows.map((r) => String(r.name)));
      for (const [column, sql] of Object.entries(ADDED_REVIEW_COLUMNS)) {
        if (!reviewCols.has(column)) await db.execute(sql);
      }
    })().catch((error: unknown) => {
      schemaReady = null; // a failed migration must be retried, not cached
      throw error;
    });
  }
  return schemaReady;
}

function num(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function participantFrom(row: Row): Participant {
  const format = String(row.format ?? "");
  return {
    id: Number(row.id),
    edition: Number(row.edition),
    name: String(row.name ?? ""),
    email: String(row.email ?? ""),
    institution: String(row.institution ?? ""),
    format: isFormatKey(format) ? format : "",
    token: String(row.token ?? ""),
    reviewer1Id: num(row.reviewer1_id),
    reviewer2Id: num(row.reviewer2_id),
    postdocReviewer: String(row.postdoc_reviewer ?? ""),
    discussantId: num(row.discussant_id),
    isOrganizer: Number(row.is_organizer ?? 0) === 1,
    isAdmin: Number(row.is_admin ?? 0) === 1,
    createdAt: String(row.created_at ?? ""),
    pinHash: String(row.pin_hash ?? ""),
    claimedAt: String(row.claimed_at ?? ""),
    workingTitle: String(row.working_title ?? ""),
    interests: String(row.interests ?? ""),
    methods: String(row.methods ?? ""),
    phase: String(row.phase ?? ""),
    bio: String(row.bio ?? ""),
    homepageUrl: String(row.homepage_url ?? ""),
    scholarUrl: String(row.scholar_url ?? ""),
    orcid: String(row.orcid ?? ""),
  };
}

function fileFrom(row: Row): SeminarFile {
  return {
    id: Number(row.id),
    participantId: Number(row.participant_id),
    authorId: Number(row.author_id),
    kind: String(row.kind ?? "submission") as FileKind,
    round: Number(row.round ?? 1) as Round,
    blobUrl: String(row.blob_url ?? ""),
    filename: String(row.filename ?? ""),
    size: Number(row.size ?? 0),
    note: String(row.note ?? ""),
    uploadedAt: String(row.uploaded_at ?? ""),
  };
}

/** A URL-safe secret for one participant's private page. */
export function newToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

export async function listParticipants(edition: number): Promise<Participant[]> {
  await ensureSchema();
  const result = await client().execute({
    sql: "SELECT * FROM participant WHERE edition = ? ORDER BY name",
    args: [edition],
  });
  return result.rows.map(participantFrom);
}

export async function getParticipantByToken(token: string): Promise<Participant | null> {
  if (!token) return null;
  await ensureSchema();
  const result = await client().execute({
    sql: "SELECT * FROM participant WHERE token = ?",
    args: [token],
  });
  const row = result.rows[0];
  return row ? participantFrom(row) : null;
}

/**
 * Find one participant of an edition by what they typed — last name or full
 * name, accents and German transliteration allowed. Returns null when nothing
 * matches, and also when more than one does: an ambiguous name must never
 * silently resolve to whichever row sorted first.
 */
export async function getParticipantByName(
  edition: number,
  nameInput: string,
): Promise<Participant | null> {
  const wanted = normaliseNameInput(nameInput);
  if (!wanted) return null;
  const matches = (await listParticipants(edition)).filter((p) => nameKeys(p.name).includes(wanted));
  return matches.length === 1 ? matches[0] : null;
}

/** Claim a name, or reset it. PIN writes go through here rather than the
 *  generic patch path so `pin_hash` can never be set from a form payload. */
export async function setPinHash(id: number, pinHash: string): Promise<void> {
  await ensureSchema();
  await client().execute({
    sql: "UPDATE participant SET pin_hash = ?, claimed_at = ? WHERE id = ?",
    args: [pinHash, pinHash ? new Date().toISOString() : "", id],
  });
}

/** Organiser action: unclaim a name so its owner can set a new PIN. Also
 *  rotates the token, so a session opened with the old PIN stops working. */
export async function resetPin(id: number): Promise<void> {
  await ensureSchema();
  await client().execute({
    sql: "UPDATE participant SET pin_hash = '', claimed_at = '', token = ? WHERE id = ?",
    args: [newToken(), id],
  });
}

export type NewParticipant = {
  edition: number;
  name: string;
  email?: string;
  institution?: string;
  format?: string;
  isOrganizer?: boolean;
  isAdmin?: boolean;
};

/** Insert participants, skipping names the edition already has. Returns how
 *  many rows were actually created. */
export async function addParticipants(rows: NewParticipant[]): Promise<number> {
  await ensureSchema();
  const db = client();
  let created = 0;
  for (const row of rows) {
    const name = row.name.trim();
    if (!name) continue;
    const result = await db.execute({
      sql: `INSERT OR IGNORE INTO participant
              (edition, name, email, institution, format, token, is_organizer, is_admin, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        row.edition,
        name,
        (row.email ?? "").trim(),
        (row.institution ?? "").trim(),
        (row.format ?? "").trim(),
        newToken(),
        row.isOrganizer ? 1 : 0,
        row.isAdmin ? 1 : 0,
        new Date().toISOString(),
      ],
    });
    created += Number(result.rowsAffected ?? 0);
  }
  return created;
}

const EDITABLE = {
  email: "email",
  institution: "institution",
  format: "format",
  reviewer1Id: "reviewer1_id",
  reviewer2Id: "reviewer2_id",
  postdocReviewer: "postdoc_reviewer",
  discussantId: "discussant_id",
  isOrganizer: "is_organizer",
  isAdmin: "is_admin",
  workingTitle: "working_title",
  interests: "interests",
  methods: "methods",
  phase: "phase",
  bio: "bio",
  homepageUrl: "homepage_url",
  scholarUrl: "scholar_url",
  orcid: "orcid",
} as const;

export type ParticipantPatch = Partial<{
  [K in keyof typeof EDITABLE]: K extends "isOrganizer" | "isAdmin"
    ? boolean
    : K extends "reviewer1Id" | "reviewer2Id" | "discussantId"
      ? number | null
      : string;
}>;

/** Update only the named fields. Columns come from a fixed map, never from
 *  caller-supplied strings, so a patch key can't reach the SQL. */
export async function updateParticipant(id: number, patch: ParticipantPatch): Promise<void> {
  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  for (const [key, column] of Object.entries(EDITABLE)) {
    if (!(key in patch)) continue;
    const value = patch[key as keyof ParticipantPatch];
    if (value === undefined) continue;
    sets.push(`${column} = ?`);
    args.push(typeof value === "boolean" ? (value ? 1 : 0) : value);
  }
  if (sets.length === 0) return;
  await ensureSchema();
  args.push(id);
  await client().execute({
    sql: `UPDATE participant SET ${sets.join(", ")} WHERE id = ?`,
    args,
  });
}

export async function listFiles(edition: number): Promise<SeminarFile[]> {
  await ensureSchema();
  const result = await client().execute({
    sql: `SELECT f.* FROM file f
            JOIN participant p ON p.id = f.participant_id
           WHERE p.edition = ?
           ORDER BY f.uploaded_at DESC`,
    args: [edition],
  });
  return result.rows.map(fileFrom);
}

export async function listFilesFor(participantId: number): Promise<SeminarFile[]> {
  await ensureSchema();
  const result = await client().execute({
    sql: "SELECT * FROM file WHERE participant_id = ? ORDER BY uploaded_at DESC",
    args: [participantId],
  });
  return result.rows.map(fileFrom);
}

/** Files this participant uploaded for somebody else — the reviews they owe. */
export async function listFilesBy(authorId: number): Promise<SeminarFile[]> {
  await ensureSchema();
  const result = await client().execute({
    sql: "SELECT * FROM file WHERE author_id = ? ORDER BY uploaded_at DESC",
    args: [authorId],
  });
  return result.rows.map(fileFrom);
}

export async function getFile(id: number): Promise<SeminarFile | null> {
  await ensureSchema();
  const result = await client().execute({
    sql: "SELECT * FROM file WHERE id = ?",
    args: [id],
  });
  const row = result.rows[0];
  return row ? fileFrom(row) : null;
}

export type NewFile = Omit<SeminarFile, "id" | "uploadedAt">;

export async function addFile(file: NewFile): Promise<number> {
  await ensureSchema();
  const result = await client().execute({
    sql: `INSERT INTO file
            (participant_id, author_id, kind, round, blob_url, filename, size, note, uploaded_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      file.participantId,
      file.authorId,
      file.kind,
      file.round,
      file.blobUrl,
      file.filename,
      file.size,
      file.note,
      new Date().toISOString(),
    ],
  });
  return Number(result.lastInsertRowid ?? 0);
}

/** Remove a file row. The blob itself is left in place — storage is cheap and
 *  an accidental delete stays recoverable from the Vercel Blob console. */
export async function deleteFile(id: number): Promise<void> {
  await ensureSchema();
  await client().execute({ sql: "DELETE FROM file WHERE id = ?", args: [id] });
}

// ---------------------------------------------------------------------------
// Reviews — the paper review sheet, filled in the browser
// ---------------------------------------------------------------------------

function reviewFrom(row: Row): SeminarReview {
  let scores: SeminarReview["scores"] = {};
  try {
    scores = JSON.parse(String(row.scores ?? "{}")) as SeminarReview["scores"];
  } catch {
    scores = {}; // a corrupt blob loses the scores, never the whole review
  }
  let points: ReviewPoint[] = [];
  try {
    const parsed: unknown = JSON.parse(String(row.points ?? "[]"));
    if (Array.isArray(parsed)) points = parsed as ReviewPoint[];
  } catch {
    points = [];
  }
  return {
    id: Number(row.id),
    participantId: Number(row.participant_id),
    reviewerId: Number(row.reviewer_id),
    round: Number(row.round ?? 2) as Round,
    scores,
    points,
    note: String(row.note ?? ""),
    strengths: String(row.strengths ?? ""),
    weaknesses: String(row.weaknesses ?? ""),
    comments: String(row.comments ?? ""),
    submittedAt: String(row.submitted_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export type ReviewInput = Pick<
  SeminarReview,
  "participantId" | "reviewerId" | "round" | "scores" | "points" | "note"
>;

/** Insert or edit one review. Returns true when it replaced an existing one. */
export async function saveReview(review: ReviewInput): Promise<boolean> {
  await ensureSchema();
  const db = client();
  const now = new Date().toISOString();
  const existing = await db.execute({
    sql: "SELECT id FROM review WHERE participant_id = ? AND reviewer_id = ? AND round = ?",
    args: [review.participantId, review.reviewerId, review.round],
  });
  if (existing.rows[0]) {
    await db.execute({
      sql: "UPDATE review SET scores = ?, points = ?, note = ?, updated_at = ? WHERE id = ?",
      args: [
        JSON.stringify(review.scores),
        JSON.stringify(review.points),
        review.note,
        now,
        Number(existing.rows[0].id),
      ],
    });
    return true;
  }
  await db.execute({
    sql: `INSERT INTO review
            (participant_id, reviewer_id, round, scores, points, note, submitted_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      review.participantId,
      review.reviewerId,
      review.round,
      JSON.stringify(review.scores),
      JSON.stringify(review.points),
      review.note,
      now,
      now,
    ],
  });
  return false;
}

export async function listReviews(edition: number): Promise<SeminarReview[]> {
  await ensureSchema();
  const result = await client().execute({
    sql: `SELECT r.* FROM review r
            JOIN participant p ON p.id = r.participant_id
           WHERE p.edition = ?
           ORDER BY r.updated_at DESC`,
    args: [edition],
  });
  return result.rows.map(reviewFrom);
}

/** Reviews written about one author. */
export async function listReviewsFor(participantId: number): Promise<SeminarReview[]> {
  await ensureSchema();
  const result = await client().execute({
    sql: "SELECT * FROM review WHERE participant_id = ? ORDER BY updated_at DESC",
    args: [participantId],
  });
  return result.rows.map(reviewFrom);
}

/** Reviews written by one reviewer. */
export async function listReviewsBy(reviewerId: number): Promise<SeminarReview[]> {
  await ensureSchema();
  const result = await client().execute({
    sql: "SELECT * FROM review WHERE reviewer_id = ? ORDER BY updated_at DESC",
    args: [reviewerId],
  });
  return result.rows.map(reviewFrom);
}

// ---------------------------------------------------------------------------
// Audit trail
// ---------------------------------------------------------------------------

function eventFrom(row: Row): SeminarEvent {
  return {
    id: Number(row.id),
    at: String(row.at ?? ""),
    edition: Number(row.edition ?? 0),
    actorId: num(row.actor_id),
    actorName: String(row.actor_name ?? ""),
    action: String(row.action ?? "") as EventAction,
    subjectId: num(row.subject_id),
    fileId: num(row.file_id),
    detail: String(row.detail ?? ""),
  };
}

export type EventInput = {
  edition: number;
  actor: Pick<Participant, "id" | "name"> | null;
  action: EventAction;
  subjectId?: number | null;
  fileId?: number | null;
  detail?: string;
};

/**
 * Append one line to the audit trail.
 *
 * Never throws: a failed audit write must not fail the upload or review it
 * was recording. That is the right trade for an internal coordination log —
 * it would be the wrong one for a compliance log.
 * ponytail: best-effort append; add a durable queue only if the log is ever
 * relied on for something other than "who saw my draft".
 */
export async function logEvent(event: EventInput): Promise<void> {
  try {
    await ensureSchema();
    await client().execute({
      sql: `INSERT INTO event
              (at, edition, actor_id, actor_name, action, subject_id, file_id, detail)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        new Date().toISOString(),
        event.edition,
        event.actor?.id ?? null,
        event.actor?.name ?? "",
        event.action,
        event.subjectId ?? null,
        event.fileId ?? null,
        event.detail ?? "",
      ],
    });
  } catch (error: unknown) {
    console.error("portal audit write failed", error);
  }
}

export async function listEvents(edition: number, limit = 200): Promise<SeminarEvent[]> {
  await ensureSchema();
  const result = await client().execute({
    sql: "SELECT * FROM event WHERE edition = ? ORDER BY id DESC LIMIT ?",
    args: [edition, limit],
  });
  return result.rows.map(eventFrom);
}

/** The trail concerning one participant — what they did, and what was done
 *  to their work. This is the "who opened my draft" view. */
export async function listEventsAbout(edition: number, participantId: number): Promise<SeminarEvent[]> {
  await ensureSchema();
  const result = await client().execute({
    sql: `SELECT * FROM event
           WHERE edition = ? AND (actor_id = ? OR subject_id = ?)
           ORDER BY id DESC LIMIT 200`,
    args: [edition, participantId, participantId],
  });
  return result.rows.map(eventFrom);
}

// ---------------------------------------------------------------------------
// Revision phase — the author's point-by-point response to one review
// ---------------------------------------------------------------------------

function responseFrom(row: Row): SeminarResponse {
  let items: ResponseItem[] = [];
  try {
    const parsed: unknown = JSON.parse(String(row.items ?? "[]"));
    if (Array.isArray(parsed)) items = parsed as ResponseItem[];
  } catch {
    items = []; // a corrupt blob loses the table, never the whole response
  }
  return {
    id: Number(row.id),
    reviewId: Number(row.review_id),
    participantId: Number(row.participant_id),
    reviewerId: Number(row.reviewer_id),
    strategy: String(row.strategy ?? ""),
    items,
    submittedAt: String(row.submitted_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export type ResponseInput = Pick<
  SeminarResponse,
  "reviewId" | "participantId" | "reviewerId" | "strategy" | "items"
>;

/** Insert or edit the response to one review. True when it replaced one. */
export async function saveResponse(input: ResponseInput): Promise<boolean> {
  await ensureSchema();
  const db = client();
  const now = new Date().toISOString();
  const existing = await db.execute({
    sql: "SELECT id FROM response WHERE review_id = ?",
    args: [input.reviewId],
  });
  if (existing.rows[0]) {
    await db.execute({
      sql: "UPDATE response SET strategy = ?, items = ?, updated_at = ? WHERE id = ?",
      args: [input.strategy, JSON.stringify(input.items), now, Number(existing.rows[0].id)],
    });
    return true;
  }
  await db.execute({
    sql: `INSERT INTO response
            (review_id, participant_id, reviewer_id, strategy, items, submitted_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      input.reviewId,
      input.participantId,
      input.reviewerId,
      input.strategy,
      JSON.stringify(input.items),
      now,
      now,
    ],
  });
  return false;
}

/** Responses written by one author, across all their reviews. */
export async function listResponsesBy(participantId: number): Promise<SeminarResponse[]> {
  await ensureSchema();
  const result = await client().execute({
    sql: "SELECT * FROM response WHERE participant_id = ? ORDER BY updated_at DESC",
    args: [participantId],
  });
  return result.rows.map(responseFrom);
}

/** Responses addressed to one reviewer — what the author did with their review. */
export async function listResponsesTo(reviewerId: number): Promise<SeminarResponse[]> {
  await ensureSchema();
  const result = await client().execute({
    sql: "SELECT * FROM response WHERE reviewer_id = ? ORDER BY updated_at DESC",
    args: [reviewerId],
  });
  return result.rows.map(responseFrom);
}

// ---------------------------------------------------------------------------
// Pitching Research Canvas — one per participant
// ---------------------------------------------------------------------------

export async function readCanvas(participantId: number): Promise<SeminarCanvas> {
  await ensureSchema();
  const result = await client().execute({
    sql: "SELECT * FROM canvas WHERE participant_id = ?",
    args: [participantId],
  });
  const row = result.rows[0];
  if (!row) return { participantId, fields: {}, updatedAt: "" };
  let fields: SeminarCanvas["fields"] = {};
  try {
    fields = JSON.parse(String(row.fields ?? "{}")) as SeminarCanvas["fields"];
  } catch {
    fields = {};
  }
  return { participantId, fields, updatedAt: String(row.updated_at ?? "") };
}

export async function saveCanvas(
  participantId: number,
  fields: SeminarCanvas["fields"],
): Promise<void> {
  await ensureSchema();
  await client().execute({
    // json_patch, not overwrite: every canvas shares this one row, and a save
    // posts only the keys of the canvas being edited. Replacing the blob would
    // erase the other canvases' cells (it did, once).
    sql: `INSERT INTO canvas (participant_id, fields, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(participant_id) DO UPDATE SET fields = json_patch(canvas.fields, excluded.fields),
                                                    updated_at = excluded.updated_at`,
    args: [participantId, JSON.stringify(fields), new Date().toISOString()],
  });
}
