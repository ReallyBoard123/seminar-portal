import type { Participant } from "./types";

/**
 * Recipient grouping for the organiser's broadcast mail. Groups are the
 * distinct institution strings on the roster — nothing is hardcoded, so a
 * new university on next year's roster becomes a checkbox by itself.
 */

export const GROUP_NO_INSTITUTION = "No institution";

const groupOf = (p: Participant): string => p.institution.trim() || GROUP_NO_INSTITUTION;

/** One row per institution, counting only people a mail can reach. */
export function institutionGroups(participants: Participant[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const p of participants) {
    const name = groupOf(p);
    counts.set(name, (counts.get(name) ?? 0) + (p.email.trim() ? 1 : 0));
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Everyone in the chosen groups who has an email on file. */
export function broadcastRecipients(participants: Participant[], groups: string[]): Participant[] {
  const chosen = new Set(groups);
  return participants.filter((p) => chosen.has(groupOf(p)) && p.email.trim() !== "");
}
