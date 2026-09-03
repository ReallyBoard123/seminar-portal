/**
 * Edition config: dates, milestones, format rules, template links, review
 * process knobs.
 *
 * These are a couple of dozen values that change once a year, so they live in
 * a single JSON row of the `snapshot` table rather than in tables of their
 * own. `DEFAULT_CONFIG` is example content — a plausible small internal
 * conference — and is what the portal serves until an organiser saves an
 * edit. Formats and canvases are the one thing configured in code: see
 * FORMAT_KEYS and CANVASES in types.ts.
 */

import { client } from "./client";
import { ensureSchema } from "./db";
import type { SeminarConfig } from "./types";

const CONFIG_KEY = "portal_config";

export const DEFAULT_CONFIG: SeminarConfig = {
  edition: 1,
  title: "1st Internal Research Seminar",
  shortName: "Seminar",
  hosts: ["Your University"],
  city: "Your City",
  startsOn: "2027-09-01",
  endsOn: "2027-09-03",
  contactEmail: "organiser@example.org",
  techContactEmail: "",
  socialActivity: "",
  milestones: [
    {
      key: "kickoff",
      label: "Kick-off",
      dueOn: "2027-06-01",
      description: "Formats and reviewer assignments announced.",
      kind: "event",
    },
    {
      key: "submission_1",
      label: "Submission",
      dueOn: "2027-07-15",
      description: "Papers go to the reviewers.",
    },
    {
      key: "submission_2",
      label: "Reviews due",
      dueOn: "2027-08-01",
      description: "Reviews go back to the authors.",
    },
    {
      key: "submission_3",
      label: "Camera-ready",
      dueOn: "2027-08-20",
      description: "Final versions, plus the change history responding to the reviews.",
    },
    {
      key: "conference",
      label: "Seminar days",
      dueOn: "2027-09-01",
      description: "The seminar itself.",
      kind: "event",
    },
  ],
  formats: [
    {
      key: "short_paper",
      label: "Short Paper",
      goal: "Work in progress: a focused contribution or an early result worth discussing.",
      deliverable: "Short paper for the proceedings, plus an on-site presentation.",
      length: "4-6 pages",
    },
    {
      key: "full_paper",
      label: "Full Paper",
      goal: "Completed research with method and results.",
      deliverable: "Full paper for the proceedings, plus an on-site presentation.",
      length: "8-12 pages",
    },
    {
      key: "poster",
      label: "Poster",
      goal: "An idea or early-stage project presented for feedback.",
      deliverable: "One-page abstract for the proceedings, plus the poster itself.",
      length: "1 page",
    },
    {
      key: "workshop",
      label: "Workshop",
      goal: "An interactive session you run: a tutorial, a discussion, a hands-on exercise.",
      deliverable: "Workshop proposal: topic, intended audience, planned activities.",
      length: "2-4 pages",
    },
  ],
  templates: [
    {
      label: "Paper template",
      url: "",
      note: "The document template submissions should follow.",
    },
    {
      label: "Review sheet",
      url: "",
      note: "The criteria reviewers score against — the in-app review form mirrors it.",
    },
  ],
  reviewerCircleNote:
    "Every submission is peer-reviewed by fellow participants. After the review you revise your work and respond to each comment; the change history is handed back to your reviewer, following Pang & Thatcher (2023).",
  discussantNote:
    "If enabled, every contribution gets a discussant during the seminar days: they open the discussion and review the work critically.",
  reviewerCount: 2,
  reviewerTwoSelfPick: true,
  useDiscussant: false,
};

export async function readConfig(): Promise<SeminarConfig> {
  try {
    // A page that only reads config may be the first thing to touch a fresh
    // database, so create the tables here too rather than logging a spurious
    // "no such table" on the very first request.
    await ensureSchema();
    const result = await client().execute({
      sql: "SELECT json FROM snapshot WHERE key = ?",
      args: [CONFIG_KEY],
    });
    const row = result.rows[0];
    if (!row) return DEFAULT_CONFIG;
    // A stored config that predates a new field would render half-empty, so
    // fill the gaps from the defaults rather than trusting the blob wholesale.
    return { ...DEFAULT_CONFIG, ...(JSON.parse(String(row.json)) as Partial<SeminarConfig>) };
  } catch (error: unknown) {
    console.error("portal config read failed", error);
    return DEFAULT_CONFIG;
  }
}

export async function writeConfig(config: SeminarConfig): Promise<void> {
  await ensureSchema(); // the snapshot table may not exist on a fresh local db
  await client().execute({
    sql: "INSERT OR REPLACE INTO snapshot (key, json, updated_at) VALUES (?, ?, ?)",
    args: [CONFIG_KEY, JSON.stringify(config), new Date().toISOString()],
  });
}
