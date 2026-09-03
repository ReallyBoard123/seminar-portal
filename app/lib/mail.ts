/**
 * Portal email: one Resend HTTP call, no SDK. This is an organiser sending a
 * handful of batches a year to ~24 people — not enough traffic to justify a
 * queue, retry backoff, or a template engine.
 *
 * Swapping providers later (the user has SendGrid via the GitHub Student
 * pack) means rewriting only `sendMail` below: POST to
 * https://api.sendgrid.com/v3/mail/send with an `Authorization: Bearer
 * <SENDGRID_API_KEY>` header and a
 * `{ personalizations: [{ to: [{ email: to }] }], from: { email: ... },
 * subject, content: [{ type: "text/plain", value: text }] }` body, and a 202
 * (not 200) counts as success. `sendBatch` and `mailConfigured` don't change.
 */

const RESEND_URL = "https://api.resend.com/emails";

/** Both env vars are required: a from-address with no key (or vice versa) is
 *  just as unusable as having neither set. */
export function mailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
}

export type MailResult = { ok: boolean; error?: string };

/** Short stable hash of a message, for the idempotency key. */
async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes).slice(0, 16))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Sends one message. Never throws — a bad address or a network blip comes
 *  back as `{ ok: false }` so `sendBatch` can keep going. */
export type MailAttachment = { filename: string; content: string };

export async function sendMail({
  to,
  subject,
  text,
  bcc,
  attachments,
}: {
  to: string;
  subject: string;
  text: string;
  /** Broadcasts hide the recipient list from itself: everyone goes in bcc. */
  bcc?: string[];
  /** Base64-encoded file bodies, Resend's shape. */
  attachments?: MailAttachment[];
}): Promise<MailResult> {
  if (!mailConfigured()) return { ok: false, error: "email is not configured" };
  // Derived from the message rather than random: a retry of the same
  // notification to the same person reuses the key and is de-duplicated,
  // while a genuinely new message gets a new one. Attachment bodies are
  // megabytes of base64, so their names and sizes stand in for their bytes.
  const idempotencyKey = await digest(
    `${to}|${subject}|${text}|${(bcc ?? []).join(",")}|${(attachments ?? [])
      .map((a) => `${a.filename}:${a.content.length}`)
      .join(",")}`,
  );
  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        // Required. Resend rejects a request with no User-Agent as 403 error
        // 1010, which reads exactly like an invalid key and is not one.
        "User-Agent": "seminar-portal/1.0",
        // Same notification, retried, must not arrive twice. Keys expire
        // after 24h at Resend's end, which is longer than any retry here.
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        from: process.env.MAIL_FROM,
        to: [to],
        ...(bcc && bcc.length > 0 ? { bcc } : {}),
        ...(attachments && attachments.length > 0 ? { attachments } : {}),
        subject,
        text,
      }),
    });
    if (res.ok) return { ok: true };
    // The response body can carry request-echo detail that doesn't belong in
    // a log; the status code is enough to act on.
    return { ok: false, error: `provider rejected the message (status ${res.status})` };
  } catch {
    return { ok: false, error: "network error sending mail" };
  }
}

export type BatchSummary = {
  sent: number;
  failed: number;
  skipped: number;
  /** Addresses that were attempted and failed — for the organiser to retry
   *  or follow up on by hand. */
  failedAddresses: string[];
};

/**
 * Sends each message in turn. One bad address never aborts the rest — a
 * typo'd email for one of 24 people must not stop the other 23 reminders.
 * A message with no `to` (a participant with no email on file) is counted
 * as skipped, not failed: there was nothing to send, not a send that broke.
 */
export async function sendBatch(
  messages: { to: string; subject: string; text: string }[],
): Promise<BatchSummary> {
  let sent = 0;
  let skipped = 0;
  const failedAddresses: string[] = [];
  for (const message of messages) {
    if (!message.to.trim()) {
      skipped += 1;
      continue;
    }
    const result = await sendMail(message);
    if (result.ok) sent += 1;
    else failedAddresses.push(message.to);
  }
  return { sent, failed: failedAddresses.length, skipped, failedAddresses };
}

/**
 * Fire one status notification, best-effort.
 *
 * Awaited rather than left dangling — a serverless function can be torn down
 * the moment it returns, so an un-awaited send is a send that sometimes does
 * not happen. But a failure here never reaches the caller: nobody's upload
 * should fail because the mail provider had a bad minute, and a participant
 * with no address on the roster is skipped in silence.
 *
 * ponytail: sequential and inline. Resend's limit is 10 requests per second
 * per team and a send takes longer than 100ms, so a 24-person batch cannot
 * outrun it. If notifications ever outgrow one message per action, queue
 * them instead of threading concurrency through here.
 */
export async function notify(to: string, mail: { subject: string; text: string }): Promise<void> {
  if (!to || !mailConfigured()) return;
  try {
    await sendMail({ to, subject: mail.subject, text: mail.text });
  } catch {
    // sendMail already swallows its own errors; this is belt and braces.
  }
}

/** Where the portal lives, for the link in every notification. */
export function portalUrl(): string {
  const base = process.env.PORTAL_PUBLIC_URL || process.env.NEXT_PUBLIC_SITE_URL;
  return base ? base.replace(/\/$/, "") : "the portal";
}
