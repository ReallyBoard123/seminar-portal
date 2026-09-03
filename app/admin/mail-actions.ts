"use server";

/**
 * Organiser-triggered batch email. Two buttons, not a notification system:
 * the organiser reviews who's about to get mail and clicks send. No cron, no
 * per-upload hooks — see mail.ts for why that's the right size for 24 people
 * and four deadlines a year.
 *
 * Every export re-resolves the caller and re-checks `isOrganizer` itself,
 * same as admin/actions.ts — the page's render gate only protects the
 * initial load, not a replayed or forged POST that would otherwise email the
 * whole roster.
 */

import { z } from "zod";

import { currentParticipant } from "@/app/lib/auth";
import { broadcastRecipients } from "@/app/lib/broadcast";
import { readConfig } from "@/app/lib/config";
import { listFiles, listParticipants, logEvent } from "@/app/lib/db";
import { arrayOf, parseForm, parseObject, requiredText, round, sanitizeFilename, type ActionResult } from "@/app/lib/forms";
import { mailConfigured, portalUrl, sendBatch, sendMail, type MailAttachment } from "@/app/lib/mail";
import { footer } from "@/app/lib/mail-templates";
import type { Participant, Round } from "@/app/lib/types";

export type { ActionResult };

// Same gate as admin/actions.ts: the admin page renders MailPanel for either
// right, so requiring `isOrganizer` alone would show an admin a Send button
// that always answers "not authorised".
async function requireOrganizer(): Promise<Participant | null> {
  const participant = await currentParticipant();
  return participant?.isOrganizer || participant?.isAdmin ? participant : null;
}

/** Who a batch email goes to. An organiser who also presents still owes a
 *  submission; only faculty accounts, which carry no format, drop out — the
 *  same rule MailPanel previews, so the count it shows is the count sent. */
function mailableRoster(participants: Participant[]): Participant[] {
  return participants.filter((p) => !p.isOrganizer || p.format !== "");
}

const remindPayloadSchema = z.object({ round });

export type MailStatus = { configured: boolean; missing: string[] };

/** What the panel shows before anything is picked. Config presence isn't a
 *  secret, but this still lives behind the organiser check for consistency
 *  with everything else in this file. */
export async function mailStatus(): Promise<MailStatus> {
  const organizer = await requireOrganizer();
  if (!organizer) return { configured: false, missing: [] };
  const missing: string[] = [];
  if (!process.env.RESEND_API_KEY) missing.push("RESEND_API_KEY");
  if (!process.env.MAIL_FROM) missing.push("MAIL_FROM");
  return { configured: missing.length === 0, missing };
}

function firstName(name: string): string {
  return name.split(" ")[0] || name;
}

function summarize(what: string, summary: Awaited<ReturnType<typeof sendBatch>>): ActionResult {
  const { sent, failed, skipped, failedAddresses } = summary;
  if (sent === 0 && failed === 0 && skipped === 0) {
    return { ok: true, message: `Nobody needed ${what}.` };
  }
  const parts = [`sent ${sent}`];
  if (skipped > 0) parts.push(`skipped ${skipped} with no email on file`);
  if (failed > 0) parts.push(`failed for ${failed}: ${failedAddresses.join(", ")}`);
  return { ok: failed === 0, message: `${what}: ${parts.join(", ")}.` };
}

/**
 * Remind everyone with no `kind === "submission"` file for one round. The
 * body names the milestone, its date, and what's owed — pulled straight from
 * `readConfig()` so the reminder can never drift from the dates the portal
 * itself shows.
 */
export async function remindRound(_prev: ActionResult, payload: { round: Round }): Promise<ActionResult> {
  const organizer = await requireOrganizer();
  if (!organizer) return { ok: false, message: "not authorised" };
  if (!mailConfigured()) {
    return { ok: false, message: "email is not configured — set RESEND_API_KEY and MAIL_FROM" };
  }

  const parsed = parseObject(remindPayloadSchema, payload);
  if (!parsed.ok) return { ok: false, message: parsed.message };
  // The coerced value, never `payload.round`: a payload carrying "2" passes
  // the schema but would never `===` a numeric `f.round`, and everyone would
  // be mailed as "still outstanding".
  const round = parsed.data.round as Round;

  const config = await readConfig();
  const [participants, files] = await Promise.all([
    listParticipants(organizer.edition),
    listFiles(organizer.edition),
  ]);
  const roster = mailableRoster(participants);
  const haveSubmitted = new Set(
    files.filter((f) => f.kind === "submission" && f.round === round).map((f) => f.participantId),
  );
  const missing = roster.filter((p) => !haveSubmitted.has(p.id));

  const milestone = config.milestones.find((m) => m.key === `submission_${round}`);
  const subject = `${config.shortName} ${config.edition} — round ${round} still outstanding`;
  const bodyFor = (p: Participant) =>
    `Hi ${firstName(p.name)},\n\n` +
    `Round ${round}${milestone ? ` (${milestone.label}, due ${milestone.dueOn})` : ""} still needs your ` +
    `submission.${milestone ? `\n\n${milestone.description}` : ""}\n\n` +
    `Upload it under "My submission" at ${portalUrl()}\n\n` +
    `— ${organizer.name}`;

  const summary = await sendBatch(missing.map((p) => ({ to: p.email, subject, text: bodyFor(p) })));
  return summarize(`round ${round} reminders`, summary);
}

/**
 * Invite everyone who hasn't claimed their name yet (`claimedAt === ""`).
 * The shared seminar password and any token are deliberately absent from the
 * body — the password travels out of band, and there are no magic links.
 */
/* eslint-disable-next-line @typescript-eslint/no-unused-vars -- prevState required by useActionState's action signature */
export async function sendSignInInvites(_prev: ActionResult): Promise<ActionResult> {
  const organizer = await requireOrganizer();
  if (!organizer) return { ok: false, message: "not authorised" };
  if (!mailConfigured()) {
    return { ok: false, message: "email is not configured — set RESEND_API_KEY and MAIL_FROM" };
  }

  const config = await readConfig();
  const roster = mailableRoster(await listParticipants(organizer.edition));
  const unclaimed = roster.filter((p) => !p.claimedAt);

  const subject = `${config.shortName} ${config.edition} — sign in to the portal`;
  const bodyFor = (p: Participant) =>
    `Hi ${firstName(p.name)},\n\n` +
    `The ${config.shortName} ${config.edition} portal is open. Go to ${portalUrl()}, enter the seminar password ` +
    `(sent separately), then sign in with your last name — the first sign-in lets you set your own PIN.\n\n` +
    `— ${organizer.name}`;

  const summary = await sendBatch(unclaimed.map((p) => ({ to: p.email, subject, text: bodyFor(p) })));
  return summarize("sign-in invitations", summary);
}

// ── Broadcast ────────────────────────────────────────────────────────────────

/** Resend's cap is 40MB after base64; 15MB of raw file bodies stays safely
 *  under it once the ~1.37× encoding overhead is added. */
const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_TOTAL_BYTES = 15 * 1024 * 1024;
const ATTACHMENT_EXT = /\.(pdf|docx?|pptx?|xlsx?|png|jpe?g)$/i;

const broadcastSchema = z.object({
  subject: requiredText(200, "Subject"),
  message: requiredText(5000, "Message"),
  group: arrayOf(z.string().trim().min(1)),
});

/**
 * One email from an organiser to the chosen institution groups. A single
 * send with everyone in bcc — the recipient list stays private, attachments
 * are encoded once, and the organiser's own copy (the `to`) doubles as the
 * receipt. The portal's no-reply footer still applies: replies go to the
 * organiser's real address, written by hand, as ever.
 */
export async function broadcastMail(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const organizer = await requireOrganizer();
  if (!organizer) return { ok: false, message: "not authorised" };
  if (!mailConfigured()) {
    return { ok: false, message: "email is not configured — set RESEND_API_KEY and MAIL_FROM" };
  }

  const parsed = parseForm(broadcastSchema, formData);
  if (!parsed.ok) return parsed;
  if (parsed.data.group.length === 0) return { ok: false, message: "Pick at least one group." };

  const files = formData
    .getAll("attachments")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > MAX_ATTACHMENTS) {
    return { ok: false, message: `At most ${MAX_ATTACHMENTS} attachments.` };
  }
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  if (totalBytes > MAX_ATTACHMENT_TOTAL_BYTES) {
    return { ok: false, message: "Attachments are limited to 15 MB in total." };
  }
  for (const f of files) {
    if (!ATTACHMENT_EXT.test(f.name)) {
      return { ok: false, message: `"${f.name}" is not an allowed file type.` };
    }
  }
  const attachments: MailAttachment[] = await Promise.all(
    files.map(async (f) => ({
      filename: sanitizeFilename(f.name),
      content: Buffer.from(await f.arrayBuffer()).toString("base64"),
    })),
  );

  const participants = await listParticipants(organizer.edition);
  const recipients = broadcastRecipients(participants, parsed.data.group);
  const addresses = [...new Set(recipients.map((p) => p.email.trim()))];
  if (addresses.length === 0) {
    return { ok: false, message: "Nobody in the chosen groups has an email on file." };
  }

  const config = await readConfig();
  const text = `${parsed.data.message.trim()}\n\n— ${organizer.name}${footer(config, portalUrl())}`;

  const ownAddress = organizer.email.trim();
  const to = ownAddress || addresses[0];
  const bcc = addresses.filter((a) => a !== to);

  const result = await sendMail({
    to,
    bcc,
    subject: parsed.data.subject,
    text,
    attachments,
  });
  if (!result.ok) return { ok: false, message: result.error ?? "the mail provider refused the message" };

  await logEvent({
    edition: organizer.edition,
    actor: { id: organizer.id, name: organizer.name },
    action: "broadcast_sent",
    detail: `"${parsed.data.subject}" to ${addresses.length} people (${parsed.data.group.join(", ")})` +
      (attachments.length > 0 ? `, ${attachments.length} attachment${attachments.length === 1 ? "" : "s"}` : ""),
  });

  const reached = addresses.length;
  return {
    ok: true,
    message: `Sent to ${reached} ${reached === 1 ? "person" : "people"}${
      attachments.length > 0 ? ` with ${attachments.length} attachment${attachments.length === 1 ? "" : "s"}` : ""
    }.${ownAddress ? " Your copy is in your inbox." : ""}`,
  };
}
