# Seminar Portal

A complete management system for an internal conference, doctoral seminar or
research workshop — the kind that is otherwise run over email and a slide
deck. Participants submit their work, review each other on a structured
sheet, respond to every comment in a revision phase, and see all deadlines in
one place. Organisers see who has submitted what, assign reviewers, and email
the cohort. Everything is timestamped in an audit trail.

Built with Next.js (App Router, Server Actions), Turso/libSQL, Vercel Blob
and Resend. One password gets people in; each participant then claims their
name with a self-set PIN. No accounts to provision, no OAuth to configure.

## Features

- **Submissions** with version history and *mentioned, never enforced*
  deadlines — late uploads are fine, every version is kept.
- **Peer review in the app**: a criteria-based review sheet, stored per
  comment, so authors can later respond point by point.
- **Revision phase** shaped after Pang & Thatcher (2023): each review comment
  gets its own response and location note; the change history is handed back
  to the reviewer.
- **Configurable review process**: 1 or 2 reviewers per submission; second
  reviewer either self-picked by participants or assigned by organisers;
  discussants on or off — all from the admin panel.
- **Status emails** from a strictly no-reply address: submission received,
  review arrived, "someone picked you as reviewer", plus organiser-triggered
  reminder batches and a broadcast form with attachments and per-institution
  recipient groups.
- **Canvases**: per-format structuring aids, editable in place with autosave
  and print-to-PDF. Ships with the Pitching Research Canvas (Faff 2015) and
  an Emerald structured-abstract canvas.
- **Audit trail**: uploads, downloads, reviews, sign-ins — "who opened my
  draft, and when" has an answer.
- **Three rights tiers**: participants, organisers (see everything, run the
  edition), admins (also manage the roster, PINs and rights).

## Try it — live demo

**https://seminar-portal-sandy.vercel.app** · seminar password: `touch-and-feel`

- Sign in as any name on the roster — **Lovelace** for the organiser view,
  Turing, Hopper, … for the participant view. Every account's PIN is
  `demodemo`.
- The demo is **read-only** (`DEMO_MODE=1`): browse everything, but uploads,
  reviews, claims and settings are disabled server-side — every save button
  answers with a friendly refusal instead.

## Setup (about 15 minutes)

Deploying with a coding agent (Claude Code, etc.)? Point it at
[AGENTS.md](AGENTS.md) — it contains the full CLI provisioning sequence for
Turso, Vercel and Resend, with the human-in-the-loop steps marked.

### 1. Clone and install

```bash
git clone https://github.com/ReallyBoard123/seminar-portal
cd seminar-portal
pnpm install
cp .env.example .env.local
```

### 2. Local development needs nothing else

```bash
# .env.local
TURSO_DATABASE_URL=file:local.db
```

`pnpm dev`, open http://localhost:3000 — with no `PORTAL_PASSWORD` set, local
dev runs open. The database schema creates itself on first touch.

### 3. Seed the roster — no scripts, all GUI

Open `/admin`. With an empty database it shows the bootstrap import: paste a
CSV (`name,email,institution,format` — see `data/participants.example.csv`),
and **the first row becomes the admin**. Everything after that — emails,
institutions, formats, reviewer assignments, rights, PIN resets, milestones,
templates, the review process itself — is edited in the admin UI.

### 4. Production

| Env var | What it is |
|---|---|
| `TURSO_DATABASE_URL` | Turso database URL (`libsql://…`). Create one at [turso.tech](https://turso.tech). |
| `TURSO_AUTH_TOKEN` | Its auth token. |
| `BLOB_READ_WRITE_TOKEN` | A **private** Vercel Blob store's token — uploads are served through a session-checked route, never public URLs. |
| `PORTAL_PASSWORD` | The one password shared with participants. Unset on a real deployment = the site answers 503 (fail-closed). |
| `RESEND_API_KEY` | Optional. Without it the portal simply sends no email. |
| `MAIL_FROM` | e.g. `Seminar <noreply@your-domain.example>` — a domain verified in Resend. |
| `PORTAL_PUBLIC_URL` | Absolute URL of the deployed site, used inside notification emails. |
| `DEMO_MODE` | Optional. Set to `1` for a read-only public demo: all mutating actions refuse politely. |

Deploy anywhere Next.js runs; `vercel deploy --prod` works as-is.

**Resend gotcha**: Resend rejects requests without a `User-Agent` header as a
403 with error code 1010, which looks exactly like an invalid API key. The
mail client in `app/lib/mail.ts` already sends one — keep it if you edit.

### How sign-in works

One shared password opens the site (HttpOnly cookie, constant-time compared).
Then each person types their last name and, on first visit, sets their own
PIN (PBKDF2, 210k iterations) — that claims the account. First sign-in is
trust-on-first-use: circulate the password and have people claim their names
promptly; an admin can reset any PIN from the participants panel.

## Customizing

- **Everything dated, worded or assigned** — title, short name, hosts, dates,
  milestones, format descriptions, templates, notes, the review process —
  lives in the admin panel's Edition settings. `DEFAULT_CONFIG` in
  `app/lib/config.ts` is only what a fresh install shows first.
- **Formats and canvases** are the one thing configured in code:
  `FORMAT_KEYS` and `CANVASES` in `app/lib/types.ts`. The default four are
  short paper, full paper, poster and workshop.
- **Reviewer slots**: the schema has exactly two (plus an optional free-text
  extra reviewer). Supporting 3+ reviewers per submission means a join
  table — an extension point, deliberately not built speculatively.

## License

MIT.
