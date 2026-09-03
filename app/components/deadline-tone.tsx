/** Maps "days until a deadline" to the app's shared status palette (see
 *  globals.css). Not a component itself, but colocated with the pieces that
 *  render the countdown so the mapping stays in one place. */
export type DeadlineTone = {
  text: string;
  surface: string;
  dot: string;
  word: string;
};

export function deadlineTone(days: number): DeadlineTone {
  if (days < 0) return { text: "text-overdue", surface: "bg-overdue-surface", dot: "bg-overdue", word: "overdue" };
  if (days <= 7) return { text: "text-soon", surface: "bg-soon-surface", dot: "bg-soon", word: "due soon" };
  return { text: "text-settled", surface: "bg-muted", dot: "bg-settled", word: "upcoming" };
}
