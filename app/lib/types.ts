/**
 * Shared vocabulary for the portal.
 *
 * the seminar is the annual Doctoral Workshop on IT, Service, Innovation and
 * Collaboration run by the Universities of St.Gallen and Kassel. Every
 * participant is assigned one of four presentation formats, submits its
 * deliverable in three rounds, reviews two peers, and picks a discussant.
 */

export const FORMAT_KEYS = [
  "short_paper",
  "full_paper",
  "poster",
  "workshop",
] as const;

export type FormatKey = (typeof FORMAT_KEYS)[number];

export function isFormatKey(value: string): value is FormatKey {
  return (FORMAT_KEYS as readonly string[]).includes(value);
}

/** What gets uploaded. `review` and `change_history` are the two halves of the
 *  revision loop: reviewers upload the first, authors the second, and the
 *  change history is handed back to the reviewer. `template` is the odd one
 *  out — organiser-uploaded, belongs to nobody, and readable by everyone in
 *  the the seminar area rather than to a named participant. */
export const FILE_KINDS = ["submission", "review", "change_history", "slide", "template"] as const;
export type FileKind = (typeof FILE_KINDS)[number];

/** Kinds a participant uploads for themselves or for someone they review.
 *  Excludes `template`, which only an organiser writes. */
export const PARTICIPANT_FILE_KINDS = FILE_KINDS.filter((k) => k !== "template");

/** Round 1 = to reviewers, 2 = reviews back to author, 3 = camera-ready. */
export type Round = 1 | 2 | 3;

/**
 * A dated point in the edition. Two different things live here: dates work is
 * *due* by, and dates something *happens* on. A deadline can be missed and is
 * worth chasing; the kick-off and the workshop itself simply pass, and calling
 * one of them "overdue" is nonsense.
 */
export type MilestoneKind = "deadline" | "event";

export type Milestone = {
  key: string;
  label: string;
  dueOn: string; // ISO yyyy-mm-dd
  description: string;
  /** Absent means deadline, so a config written before this existed still
   *  behaves as it did. */
  kind?: MilestoneKind;
};

export const isDeadline = (m: Milestone): boolean => (m.kind ?? "deadline") === "deadline";

export type FormatRule = {
  key: FormatKey;
  label: string;
  goal: string;
  deliverable: string;
  length: string;
  /** True while the kick-off deck and the Word template disagree — the UI
   *  shows a warning instead of pretending the rule is settled. */
  lengthDisputed?: boolean;
  lengthNote?: string;
};

export type TemplateLink = {
  label: string;
  url: string;
  note?: string;
  /** Held back until the organiser releases it. The revision guide is only
   *  useful once reviews exist — handing it out in the writing phase invites
   *  people to solve a problem they do not have yet. */
  hidden?: boolean;
};

export type SeminarConfig = {
  edition: number;
  title: string;
  hosts: string[];
  city: string;
  startsOn: string; // ISO
  endsOn: string; // ISO
  /** Workshop questions — formats, deadlines, who reviews whom. The
   *  organiser's address, and the Reply-To on everything the portal sends. */
  contactEmail: string;
  /** "This website is broken" — a different question for a different person.
   *  Never used as a Reply-To; participants reach it from the page itself. */
  techContactEmail: string;
  socialActivity: string;
  milestones: Milestone[];
  formats: FormatRule[];
  templates: TemplateLink[];
  /** Free text: who may be picked as second reviewer this edition. */
  reviewerCircleNote: string;
  discussantNote: string;
  /** Short name stamped on emails and print mastheads ("the seminar", "DSIS"). */
  shortName: string;
  // ── Review process knobs ─────────────────────────────────────────────
  // ponytail: the schema has exactly two reviewer slots (reviewer1Id,
  // reviewer2Id). Supporting 3+ reviewers means a join table — do that when
  // a real conference needs it, not before.
  /** Reviewers per submission: 1 (assigned) or 2 (assigned + second). */
  reviewerCount: 1 | 2;
  /** true: participants pick their own reviewer 2. false: organisers assign
   *  everything from the participants panel. */
  reviewerTwoSelfPick: boolean;
  /** Whether the seminar uses discussants at all. */
  useDiscussant: boolean;
};

export type Participant = {
  id: number;
  edition: number;
  name: string;
  email: string;
  institution: string;
  format: FormatKey | "";
  token: string;
  reviewer1Id: number | null;
  reviewer2Id: number | null;
  postdocReviewer: string;
  discussantId: number | null;
  /** Sees everything and runs the edition: assignments, reminders,
   *  templates, config. */
  isOrganizer: boolean;
  /** Everything an organiser can do, plus the roster, PIN resets, and
   *  granting rights. Only an admin can change who holds power, so an
   *  organiser cannot lock the others out. */
  isAdmin: boolean;
  createdAt: string;
  /** PBKDF2 record for this person's self-set PIN; "" until they claim. */
  pinHash: string;
  claimedAt: string;
  // --- Researcher profile -------------------------------------------------
  // Self-entered. This is what somebody reads before asking you to be their
  // second reviewer, so it is about the work, not the person.
  /** Working title of the dissertation. */
  workingTitle: string;
  /** Free text: the topics this person works on. */
  interests: string;
  /** Free text: qualitative, DSR, experiments, econometrics, and so on. */
  methods: string;
  /** Where they are: "1st year", "writing up", "post-proposal". */
  phase: string;
  /** A few sentences in their own words. */
  bio: string;
  homepageUrl: string;
  scholarUrl: string;
  orcid: string;
};

/** True once there is enough here to help somebody choose a reviewer. */
export function hasProfile(p: Pick<Participant, "workingTitle" | "interests" | "methods" | "bio">): boolean {
  return Boolean(p.workingTitle || p.interests || p.methods || p.bio);
}

/** A participant as shown to other participants — no secrets, no email, and
 *  not whether they have claimed their name, which is the organiser's business. */
export type PublicParticipant = Omit<Participant, "token" | "email" | "pinHash" | "claimedAt">;

/**
 * The paper review sheet, transcribed from "Review Sheet the seminar.docx".
 * Each criterion is scored 0 (poor) to 7 (high).
 *
 * The Word sheet groups the last three under one "Formal presentation"
 * heading; they are kept as three separate scores here because that is how
 * the sheet lays them out. Worth confirming with the organiser.
 */
export const REVIEW_CRITERIA = [
  { key: "argumentation", label: "Quality of argumentation" },
  { key: "literature", label: "Is the presented literature adequate for supporting the argument?" },
  { key: "design", label: "Fit of research design" },
  { key: "problem", label: "Clear explanation of the research problem" },
  { key: "motivation", label: "Clear explanation of motivation" },
  { key: "contribution", label: "Thesis has/will have a clear contribution" },
  { key: "title", label: "Does the title of the thesis describe/characterize the content well?" },
  { key: "style", label: "Formal presentation: style of expression" },
  { key: "figures", label: "Formal presentation: figures meaningful and clear" },
  { key: "accuracy", label: "Formal presentation: accuracy of the text, free from errors" },
] as const;

export type ReviewCriterionKey = (typeof REVIEW_CRITERIA)[number]["key"];

export const SCORE_MIN = 0;
export const SCORE_MAX = 7;

/**
 * One discrete reviewer comment. Reviewers enter these as separate rows
 * rather than three blocks of prose, so the author can reply to each one
 * individually in the revision phase — and so the reviewer's wording is
 * referenced by id rather than re-typed by the author.
 *
 * `id` must stay stable across edits of a review, or responses detach from
 * the points they answer.
 */
export const REVIEW_POINT_CATEGORIES = ["strength", "weakness", "comment"] as const;
export type ReviewPointCategory = (typeof REVIEW_POINT_CATEGORIES)[number];

export type ReviewPoint = {
  id: string;
  category: ReviewPointCategory;
  text: string;
};

export const POINT_CATEGORY_LABEL: Record<ReviewPointCategory, string> = {
  strength: "Strength",
  weakness: "Weakness",
  comment: "Comment",
};

export type SeminarReview = {
  id: number;
  participantId: number; // the author being reviewed
  reviewerId: number;
  round: Round;
  /** criterion key -> 0..7. Partial: a reviewer may leave one blank. */
  scores: Partial<Record<ReviewCriterionKey, number>>;
  /** The reviewer's comments, one row each. */
  points: ReviewPoint[];
  /** A short personal aside to the author — "sorry it's late", "happy to
   *  talk this through" — distinct from the formal comments above. */
  note: string;
  /** Free-text fields from the first cut of the review form. Kept so a review
   *  written before points existed still renders; new reviews leave them "". */
  strengths: string;
  weaknesses: string;
  comments: string;
  submittedAt: string;
  updatedAt: string;
};

/**
 * The revision phase: what the author changed, and how each reviewer comment
 * was addressed. Shape follows Pang & Thatcher (2023): a short revision
 * strategy naming the major changes, then a point-by-point response.
 *
 * The response table is generated from the review's points — one reply slot
 * per comment — so the author never transcribes the reviewer's words and no
 * comment can be quietly dropped.
 */
export type ResponseItem = {
  /** Which `ReviewPoint` this answers. The comment text is never copied here:
   *  it is read from the review, so the author cannot restate the reviewer. */
  pointId: string;
  /** What the author did about it. */
  response: string;
  /** Where it landed — "Section 3.2", "p. 4", "not addressed, because…" */
  location: string;
};

export type SeminarResponse = {
  id: number;
  reviewId: number;
  participantId: number; // the author responding
  reviewerId: number;
  strategy: string;
  items: ResponseItem[];
  submittedAt: string;
  updatedAt: string;
};

/**
 * The comments an author actually replies to.
 *
 * New reviews carry `points`. A review written before comments were split
 * into rows has only the three prose fields, so those are presented as one
 * pseudo-point each, keyed by category — stable ids, so a response written
 * against a legacy review keeps pointing at the right section.
 */
export function displayPoints(review: Pick<SeminarReview, "points" | "strengths" | "weaknesses" | "comments">): ReviewPoint[] {
  if (review.points.length > 0) return review.points;
  const legacy: ReviewPoint[] = [];
  if (review.strengths) legacy.push({ id: "strength", category: "strength", text: review.strengths });
  if (review.weaknesses) legacy.push({ id: "weakness", category: "weakness", text: review.weaknesses });
  if (review.comments) legacy.push({ id: "comment", category: "comment", text: review.comments });
  return legacy;
}

/**
 * The Pitching Research Canvas, from the kick-off deck's structuring aid for
 * the Idea Talk. The same questions as Proposition Template.docx, laid out as
 * a canvas rather than a form: context at the top, the building blocks in the
 * middle, and the bottom line — what is new and why anyone should care.
 *
 * Filled in the browser and printed from there, so nobody has to fight a
 * Word table to say what their research is about.
 */
export const CANVAS_FIELDS = [
  { key: "workingTitle", label: "Working title", band: "context",
    hint: "Succinct and informative. It can change." },
  { key: "researchQuestion", label: "Research question", band: "context",
    hint: "One sentence. What are you actually asking?" },
  { key: "keyPapers", band: "context", label: "Key papers",
    hint: "The one to three papers your topic rests on." },
  { key: "motivation", label: "Motivation / puzzle", band: "context",
    hint: "What is odd, unresolved or at stake here?" },
  { key: "data", label: "Data", band: "concept",
    hint: "What will you use? Setting, unit of analysis, source, access." },
  { key: "idea", label: "Idea", band: "concept",
    hint: "The core idea driving the work. A hypothesis, a tension, a mechanism." },
  { key: "tools", label: "Tools", band: "concept",
    hint: "Method and research design. How would you actually do it?" },
  { key: "whatsNew", label: "What's new?", band: "bottom",
    hint: "Is the novelty in the idea, the data, or the tools?" },
  { key: "soWhat", label: "So what?", band: "bottom",
    hint: "Why does it matter that we know the answer?" },
  { key: "contribution", label: "Contribution", band: "bottom",
    hint: "What does the literature gain from this?" },
  { key: "otherConsiderations", label: "Other considerations", band: "bottom",
    hint: "Collaboration, target journals, risks, ethics, scope." },
] as const;

export type CanvasFieldKey =
  | (typeof CANVAS_FIELDS)[number]["key"]
  | (typeof EMERALD_FIELDS)[number]["key"];

/**
 * The Emerald structured abstract, straight from the kick-off deck's slide on
 * it — the shape the Idea Talk abstract, the Proposal and the Journal Paper
 * abstract are all written in.
 */
export const EMERALD_FIELDS = [
  { key: "emPurpose", label: "Purpose", band: "abstract",
    hint: "Why write this? The aims, and the core research questions." },
  { key: "emDesign", label: "Design / methodology / approach", band: "abstract",
    hint: "How the objectives are achieved: methods, approach, and scope." },
  { key: "emFindings", label: "Findings / results so far", band: "abstract",
    hint: "What was found in the course of the work — analysis, discussion, results." },
  { key: "emLimitations", label: "Research limitations / implications", band: "abstract",
    hint: "Limitations so far, and what future research they point to." },
  { key: "emPractical", label: "Practical implications", band: "abstract",
    hint: "Outcomes for practice: what changes because of this research." },
  { key: "emOriginality", label: "Originality", band: "abstract",
    hint: "What is new here, and the value of that — for whom." },
] as const;

export type CanvasBandDef = { key: string; label: string; sub: string };
export type CanvasFieldDef = {
  key: CanvasFieldKey;
  label: string;
  band: string;
  hint: string;
};

/** Everything the editor needs to draw one canvas. */
export type CanvasDefinition = {
  title: string;
  subtitle: string;
  bands: readonly CanvasBandDef[];
  fields: readonly CanvasFieldDef[];
  /** The one field drawn as the visual centre of its band, if any. */
  centerKey?: CanvasFieldKey;
  /** Printed and shown as the template's source. */
  citation?: { label: string; url: string };
};


/** The three bands of the canvas, top to bottom. */
export const CANVAS_BANDS = [
  { key: "context", label: "Context", sub: "Basics and background" },
  { key: "concept", label: "Concept", sub: "Building blocks" },
  { key: "bottom", label: "Bottom line", sub: "Key questions and contribution" },
] as const;


const EMERALD_CANVAS: CanvasDefinition = {
  title: "Emerald Structured Abstract",
  subtitle:
    "The structure your deliverable is written in. Draft each heading here, then write the prose.",
  bands: [{ key: "abstract", label: "Structured abstract", sub: "Six headings, one argument" }],
  fields: EMERALD_FIELDS,
  citation: {
    label: "Emerald Publishing, \"How to write an article abstract\"",
    url: "https://www.emeraldgrouppublishing.com/how-to/authoring-editing-reviewing/write-article-abstract",
  },
};

export const CANVASES: Partial<Record<FormatKey, CanvasDefinition>> = {
  poster: {
    title: "Pitching Research Canvas",
    subtitle: "A structuring aid for early-stage work. Fill it in, print it, walk in with it.",
    bands: CANVAS_BANDS,
    fields: CANVAS_FIELDS,
    centerKey: "idea",
    citation: {
      label: 'Faff (2015), "A simple template for pitching research", Accounting & Finance 55(2)',
      url: "https://doi.org/10.1111/acfi.12116",
    },
  },
  // Both paper formats draft against the same structured-abstract canvas.
  short_paper: EMERALD_CANVAS,
  full_paper: EMERALD_CANVAS,
};

export type SeminarCanvas = {
  participantId: number;
  fields: Partial<Record<CanvasFieldKey, string>>;
  updatedAt: string;
};

/**
 * One line of the audit trail. Every upload, download, assignment, review and
 * sign-in lands here, so "who saw my draft, and when" has an answer.
 *
 * `actorName` is denormalised on purpose: an audit row must still read
 * correctly after the roster is edited.
 */
export const EVENT_ACTIONS = [
  "signin",
  "pin_claim",
  "pin_reset",
  "upload",
  "delete_file",
  "download",
  "review_submitted",
  "review_updated",
  "response_submitted",
  "response_updated",
  "assign_reviewer1",
  "pick_reviewer2",
  "pick_discussant",
  "import_roster",
  "config_saved",
  "profile_saved",
  "broadcast_sent",
] as const;

export type EventAction = (typeof EVENT_ACTIONS)[number];

export type SeminarEvent = {
  id: number;
  at: string;
  edition: number;
  actorId: number | null;
  actorName: string;
  action: EventAction;
  subjectId: number | null; // the participant the action concerns
  fileId: number | null;
  detail: string;
};

export type SeminarFile = {
  id: number;
  participantId: number; // whose deliverable this concerns
  authorId: number; // who uploaded it (a reviewer, for kind === "review")
  kind: FileKind;
  round: Round;
  blobUrl: string;
  filename: string;
  size: number;
  note: string;
  uploadedAt: string;
};

/** Built field by field rather than by stripping two keys: a secret added to
 *  Participant later is then absent here by default instead of leaking. */
export function publicParticipant(p: Participant): PublicParticipant {
  return {
    id: p.id,
    edition: p.edition,
    name: p.name,
    institution: p.institution,
    format: p.format,
    reviewer1Id: p.reviewer1Id,
    reviewer2Id: p.reviewer2Id,
    postdocReviewer: p.postdocReviewer,
    discussantId: p.discussantId,
    isOrganizer: p.isOrganizer,
    isAdmin: p.isAdmin,
    createdAt: p.createdAt,
    // The profile exists precisely so other participants can read it.
    workingTitle: p.workingTitle,
    interests: p.interests,
    methods: p.methods,
    phase: p.phase,
    bio: p.bio,
    homepageUrl: p.homepageUrl,
    scholarUrl: p.scholarUrl,
    orcid: p.orcid,
  };
}

/** Days until an ISO date, negative once past. Dates only — no clock skew
 *  games, both sides are floored to UTC midnight. */
export function daysUntil(iso: string, now: Date = new Date()): number {
  const target = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(target)) return NaN;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((target - today) / 86_400_000);
}

/** The next milestone still ahead, or the last one once the edition is over. */
export function nextMilestone(milestones: Milestone[], now: Date = new Date()): Milestone | null {
  // Events are not things you can be late for, so they never count as the
  // next thing owed. The timeline still shows them.
  const deadlines = milestones.filter(isDeadline);
  if (deadlines.length === 0) return null;
  const sorted = [...deadlines].sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  return sorted.find((m) => daysUntil(m.dueOn, now) >= 0) ?? sorted[sorted.length - 1];
}
