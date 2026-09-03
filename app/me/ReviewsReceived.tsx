import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { POINT_CATEGORY_LABEL, REVIEW_CRITERIA, type SeminarReview } from "../lib/types";

const DATE_FMT = new Intl.DateTimeFormat("en", { day: "2-digit", month: "short", year: "numeric" });

/** Reviews written about the signed-in participant — what they revise
 *  against. Read-only, so this stays a server component; the parent
 *  resolves reviewer names since it already has the participant roster. */
export function ReviewsReceived({
  reviews,
  reviewerNames,
  scoresOnly = false,
}: {
  reviews: SeminarReview[];
  reviewerNames: Record<number, string>;
  /** Hide the comment list — used where the comments are already shown
   *  alongside, as in the revision response form. */
  scoresOnly?: boolean;
}) {
  if (reviews.length === 0) {
    return <p className="text-muted-foreground text-sm">No reviews back yet.</p>;
  }

  return (
    <div className="space-y-4">
      {reviews.map((r) => (
        <Card key={r.id}>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{reviewerNames[r.reviewerId] ?? "Unknown reviewer"}</CardTitle>
            <span className="text-muted-foreground text-xs">
              {r.updatedAt === r.submittedAt ? "Submitted" : "Updated"} {DATE_FMT.format(new Date(r.updatedAt))}
            </span>
          </CardHeader>
          <CardContent className="space-y-5">
            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {REVIEW_CRITERIA.map((c) => (
                <div key={c.key} className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted-foreground text-sm">{c.label}</dt>
                  <dd>
                    <Badge variant={c.key in r.scores ? "secondary" : "outline"}>
                      {c.key in r.scores ? `${r.scores[c.key]}/7` : "—"}
                    </Badge>
                  </dd>
                </div>
              ))}
            </dl>

            {scoresOnly ? null : r.points.length > 0 ? (
              <ol className="flex flex-col gap-2">
                {r.points.map((point, i) => (
                  <li key={point.id} className="border-border/60 rounded-md border p-3">
                    <div className="flex items-baseline gap-2">
                      <span className="text-muted-foreground font-mono text-[11px] tabular-nums">
                        {i + 1}
                      </span>
                      <span className="text-muted-foreground text-[11px] tracking-wide uppercase">
                        {POINT_CATEGORY_LABEL[point.category]}
                      </span>
                    </div>
                    <p className="mt-1 text-sm whitespace-pre-wrap">{point.text}</p>
                  </li>
                ))}
              </ol>
            ) : (
              /* Written before comments were split into rows. */
              <div className="flex flex-col gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <h3 className="text-sm font-medium">Strengths</h3>
                    <p className="text-muted-foreground mt-1 text-sm whitespace-pre-wrap">
                      {r.strengths || "—"}
                    </p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium">Weaknesses</h3>
                    <p className="text-muted-foreground mt-1 text-sm whitespace-pre-wrap">
                      {r.weaknesses || "—"}
                    </p>
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-medium">Review</h3>
                  <p className="text-muted-foreground mt-1 text-sm whitespace-pre-wrap">
                    {r.comments || "—"}
                  </p>
                </div>
              </div>
            )}

          </CardContent>
        </Card>
      ))}
    </div>
  );
}
