/**
 * What the portal actually says when it emails somebody.
 *
 * These are status notifications, not correspondence: something happened to
 * your work and you might not otherwise notice. The one that matters most is
 * `pickedAsReviewer` — reviewer 2 is chosen by the author, so without a mail
 * the chosen person has no way of knowing until they next open the site.
 *
 * Plain text on purpose. It renders everywhere, it cannot carry a tracking
 * pixel, and it does not look like marketing to a university spam filter.
 */

import type { SeminarConfig } from "./types";

export type Mail = { subject: string; text: string };

/**
 * Every message ends the same way: this address does not accept replies, and
 * everything else lives on the site.
 *
 * Deliberately no contact addresses here. The portal sends reminders; it does
 * not mediate correspondence. Anyone with a question writes to the organiser
 * directly, as they always have, and the site itself names who that is.
 */
export function footer(config: SeminarConfig, url: string): string {
  return [
    "",
    "—",
    `${config.shortName} ${config.edition} · ${url}`,
    "This address does not accept replies.",
  ].join("\n");
}

function compose(config: SeminarConfig, url: string, subject: string, body: string[]): Mail {
  return { subject, text: [...body, footer(config, url)].join("\n") };
}

/** A receipt, so an upload is never a silent act of faith. */
export function submissionReceived(
  config: SeminarConfig,
  url: string,
  { name, kind, round, filename }: { name: string; kind: string; round: number; filename: string },
): Mail {
  return compose(config, url, `${config.shortName}: ${filename} received`, [
    `Hello ${name},`,
    "",
    `Your ${kind.replace(/_/g, " ")} for round ${round} is uploaded: ${filename}`,
    "",
    "You can replace it whenever you like — every version is kept, and a late",
    "upload is fine. Nothing is locked.",
  ]);
}

/** The trigger for the revision phase. */
export function reviewReceived(
  config: SeminarConfig,
  url: string,
  { name, reviewerName, comments }: { name: string; reviewerName: string; comments: number },
): Mail {
  return compose(config, url, `${config.shortName}: a review of your work has arrived`, [
    `Hello ${name},`,
    "",
    `${reviewerName} has reviewed your submission and left ${comments} ${
      comments === 1 ? "comment" : "comments"
    }.`,
    "",
    "On the site you can read it and reply to each comment in turn, saying how",
    "you addressed it and where. That response goes back to your reviewer as",
    "your change history.",
  ]);
}

/** Nobody else tells them: the author picks reviewer 2 unilaterally. */
export function pickedAsReviewer(
  config: SeminarConfig,
  url: string,
  { name, authorName, workingTitle }: { name: string; authorName: string; workingTitle: string },
): Mail {
  return compose(config, url, `${config.shortName}: ${authorName} has asked you to review their work`, [
    `Hello ${name},`,
    "",
    `${authorName} has chosen you as their second reviewer.`,
    ...(workingTitle ? ["", `Their working title: ${workingTitle}`] : []),
    "",
    "Their submission is on the site when it is ready, and the review sheet is",
    "filled in there too — scores plus your comments, one point at a time.",
  ]);
}

/** Chosen as somebody's discussant: a seminar-day obligation, not a review. */
export function pickedAsDiscussant(
  config: SeminarConfig,
  url: string,
  { name, authorName }: { name: string; authorName: string },
): Mail {
  return compose(config, url, `${config.shortName}: ${authorName} has asked you to be their discussant`, [
    `Hello ${name},`,
    "",
    `${authorName} has chosen you as their discussant for the seminar days.`,
    "",
    "The discussant opens the discussion with two minutes as devil's advocate,",
    "against the Van de Ven (2007) discourse criteria. Details on the site.",
  ]);
}
