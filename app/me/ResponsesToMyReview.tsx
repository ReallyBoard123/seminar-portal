import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import {
  displayPoints,
  POINT_CATEGORY_LABEL,
  type SeminarResponse,
  type SeminarReview,
} from "../lib/types";

const DATE_FMT = new Intl.DateTimeFormat("en", { day: "2-digit", month: "short", year: "numeric" });

/** Mirrors ResponseForm's fallback: a legacy review (no `points`) gets one
 *  pseudo-point per non-empty free-text section, keyed by its category —
 *  the same pseudo-id the response was saved under. */

/** The reviewer's side of the loop: what the author did with one review of
 *  theirs, point by point. Read-only, so this stays a server component like
 *  its sibling ReviewsReceived — the parent resolves the author's name the
 *  same way it resolves reviewer names there. */
export function ResponsesToMyReview({
  review,
  response,
  authorName,
}: {
  review: SeminarReview;
  response: SeminarResponse | null;
  authorName: string;
}) {
  if (!response) {
    return <p className="text-muted-foreground text-sm">No response yet.</p>;
  }

  const byPointId = new Map(response.items.map((item) => [item.pointId, item]));
  const points = displayPoints(review);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{authorName}&apos;s response</CardTitle>
        <span className="text-muted-foreground text-xs">
          {response.updatedAt === response.submittedAt ? "Submitted" : "Updated"}{" "}
          {DATE_FMT.format(new Date(response.updatedAt))}
        </span>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <h3 className="text-sm font-medium">Revision strategy</h3>
          <p className="text-muted-foreground mt-1 text-sm whitespace-pre-wrap">
            {response.strategy || "—"}
          </p>
        </div>

        {points.length === 0 ? (
          <p className="text-muted-foreground text-sm">This review has no recorded comments.</p>
        ) : (
          <div className="space-y-3">
            {points.map((point) => {
              const item = byPointId.get(point.id);
              return (
                <div key={point.id} className="rounded-lg border border-border/60 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <Badge variant="outline">{POINT_CATEGORY_LABEL[point.category]}</Badge>
                    {!item && <Badge variant="destructive">Unanswered</Badge>}
                  </div>
                  <p className="text-foreground mt-2 text-sm whitespace-pre-wrap">{point.text}</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_9rem]">
                    <div>
                      <h4 className="text-muted-foreground text-xs">Response</h4>
                      <p className="mt-1 text-sm whitespace-pre-wrap">{item?.response || "—"}</p>
                    </div>
                    <div>
                      <h4 className="text-muted-foreground text-xs">Where addressed</h4>
                      <p className="mt-1 text-sm whitespace-pre-wrap">{item?.location || "—"}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
