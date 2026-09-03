import { cn } from "@/lib/utils";
import type { Round } from "@/app/lib/types";

const ROUNDS: Round[] = [1, 2, 3];
const ROUND_LABEL: Record<Round, string> = {
  1: "Round 1 — to reviewers",
  2: "Round 2 — reviews back",
  3: "Round 3 — camera-ready",
};

/** Three small dots, filled once a submission file exists for that round. */
export function SubmissionDots({ rounds }: { rounds: ReadonlySet<Round> }) {
  return (
    <span className="inline-flex items-center gap-1">
      {ROUNDS.map((r) => (
        <span
          key={r}
          title={`${ROUND_LABEL[r]}${rounds.has(r) ? " — submitted" : " — not submitted"}`}
          className={cn(
            "inline-block size-2.5 rounded-full border",
            rounds.has(r) ? "bg-settled border-settled" : "border-muted-foreground/40",
          )}
        />
      ))}
    </span>
  );
}
