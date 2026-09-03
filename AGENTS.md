<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Agent setup guide

You are an agent asked to deploy this portal for someone's internal
conference. Almost everything is CLI-scriptable (state as of September
2026 — always trust `--help` over this file when they disagree). The few
steps that need the human are marked **HUMAN**.

Work top to bottom. After every step, run the verification line before
moving on — a green build on a half-provisioned project helps nobody.

## 0. Prerequisites

```bash
pnpm install
pnpm tsc --noEmit && pnpm vitest run   # expect 0 errors, all tests green
cp .env.example .env.local
```

A pure-local run needs nothing else: set `TURSO_DATABASE_URL=file:local.db`
in `.env.local`, `pnpm dev`, done. The rest of this file is production.

## 1. Database — Turso

```bash
turso auth login          # HUMAN: opens a browser for OAuth
turso db create seminar-portal
turso db show seminar-portal --url          # -> TURSO_DATABASE_URL
turso db tokens create seminar-portal       # -> TURSO_AUTH_TOKEN
```

Verify: `turso db shell seminar-portal "select 1"`.
No migrations exist or are needed — the app creates its schema on first
touch (`ensureSchema` in `app/lib/db.ts`).

## 2. Hosting — Vercel

```bash
vercel login              # HUMAN: browser or email confirmation
vercel link               # create/link the project; accept defaults
```

### Blob store (file uploads)

Uploads are served through a session-checked route — the store must be
**private**, never public:

```bash
vercel blob store add seminar-portal-files
```

If your CLI version has no private option for `blob store add`, stop and
have the human create a private Blob store in the dashboard (Storage →
Blob → Create → access: private) and connect it to the project. Then:

```bash
vercel env pull .env.vercel   # BLOB_READ_WRITE_TOKEN appears once connected
```

### Environment variables

```bash
# feed each secret via stdin so it never lands in shell history
printf '%s' "$TURSO_DATABASE_URL" | vercel env add TURSO_DATABASE_URL production
printf '%s' "$TURSO_AUTH_TOKEN"   | vercel env add TURSO_AUTH_TOKEN production
printf '%s' "$PORTAL_PASSWORD"    | vercel env add PORTAL_PASSWORD production
printf '%s' "https://your-domain" | vercel env add PORTAL_PUBLIC_URL production
```

Pick `PORTAL_PASSWORD` with the human — it is what the whole cohort will
type. Memorable beats random line noise here; it only gates the front door,
individual PINs protect the actual accounts.

### Deploy

```bash
vercel deploy --prod --yes
```

Verify: fetching the production URL redirects `/` to `/signin` (302/307),
and `/signin` answers 200. A 503 means `PORTAL_PASSWORD` is missing —
that is the fail-closed guard working, not a bug.

### Custom domain (optional)

```bash
vercel domains add portal.example.org   # then HUMAN sets the DNS record it prints
```

## 3. Email — Resend (optional; the portal runs fine without it)

Resend has no meaningful CLI; use the REST API with an account-scoped key
(**HUMAN** creates the key at resend.com/api-keys — a *sending-only* key
gets 401 on the domain endpoints below).

```bash
curl -s -X POST https://api.resend.com/domains \
  -H "Authorization: Bearer $RESEND_KEY" -H "Content-Type: application/json" \
  -H "User-Agent: setup-agent/1.0" \
  -d '{"name":"mail.example.org"}'
```

The response lists DNS records (DKIM TXT, two CNAMEs for the return path,
DMARC). **HUMAN** adds those at the registrar; then poll:

```bash
curl -s https://api.resend.com/domains -H "Authorization: Bearer $RESEND_KEY" \
  -H "User-Agent: setup-agent/1.0"     # wait for status: verified
```

Then set:

```bash
printf '%s' "$RESEND_KEY" | vercel env add RESEND_API_KEY production
printf '%s' "Seminar <noreply@mail.example.org>" | vercel env add MAIL_FROM production
vercel deploy --prod --yes
```

**Trap worth knowing**: Resend rejects any request without a `User-Agent`
header as 403 with error code 1010 — it looks exactly like a bad API key
and is not one. `app/lib/mail.ts` already sends the header; keep it.

## 4. First data — all GUI, nothing for you to script

Send the human to `https://<site>/admin`:

1. Empty database → the page shows the bootstrap CSV import.
   Columns `name,email,institution,format`; **the first row becomes the
   admin**. Example in `data/participants.example.csv`.
2. They sign in at `/signin`: portal password → their last name → set a
   PIN. The Organiser tab appears.
3. Everything else — title, short name, dates, milestones, formats' wording,
   templates, the review process (1 or 2 reviewers, self-pick vs assigned,
   discussants) — is under Organiser → Edition settings.

Do not seed the database by writing SQL. The GUI path is the supported one
and creates the audit trail correctly.

## 5. What agents must not do

- Never make the Blob store public, and never serve uploads by their blob
  URL — always through `/api/file` (it checks the session).
- Never commit `.env.local` / `.env.vercel` or print token values into
  logs or chat.
- Never weaken the fail-closed 503 in `proxy.ts` to "open when password
  missing" on production.
- Formats/canvases (`app/lib/types.ts`) are code: change them only when the
  human asks, and run `pnpm vitest run` after — the canvas tests enforce
  the invariant that no field key appears in two canvases.
