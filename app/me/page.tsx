import { AlertTriangle, CalendarClock } from "lucide-react";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

import { FileList } from "./FileList";
import { ReviewForm } from "./ReviewForm";
import { MyTrail } from "./MyTrail";
import { SwitchTabs } from "../components/SwitchTabs";
import { ResponseForm } from "./ResponseForm";
import { ResponsesToMyReview } from "./ResponsesToMyReview";
import { ReviewsReceived } from "./ReviewsReceived";
import { ReviewerPicker } from "./ReviewerPicker";
import { UploadForm } from "./UploadForm";
import { PortalNav } from "../components/PortalNav";
import { currentParticipant } from "../lib/auth";
import { readConfig } from "../lib/config";
import { Refs } from "../lib/refs";
import {
  listEventsAbout,
  listFiles,
  listParticipants,
  listResponsesBy,
  listResponsesTo,
  listReviewsBy,
  listReviewsFor,
} from "../lib/db";
import {
  daysUntil,
  isDeadline,
  nextMilestone,
  publicParticipant,
  type FileKind,
  type FormatKey,
  type Milestone,
  type Round,
} from "../lib/types";

/** The round implied by today's date: whichever submission deadline is still
 *  ahead sets the working round, camera-ready (round 3) once all are past. */
function impliedRound(milestones: Milestone[], now = new Date()): Round {
  const dueOn = (key: string) => milestones.find((m) => m.key === key)?.dueOn;
  const s1 = dueOn("submission_1");
  const s2 = dueOn("submission_2");
  if (s1 && daysUntil(s1, now) >= 0) return 1;
  if (s2 && daysUntil(s2, now) >= 0) return 2;
  return 3;
}

/** What a participant may upload for their own row: a submission always, a
 *  change history once revisions are due, and — for the journal-paper format
 *  only — the project-management slide. */
function deliverableKindOptions(format: FormatKey | ""): { value: FileKind; label: string }[] {
  const options: { value: FileKind; label: string }[] = [
    { value: "submission", label: "Submission" },
    { value: "change_history", label: "Change history" },
  ];
  if (format === "full_paper") options.push({ value: "slide", label: "PM slide" });
  return options;
}

function urgencyClass(days: number): string {
  if (days < 0) return "text-overdue";
  if (days <= 5) return "text-soon";
  return "text-muted-foreground";
}

function daysLabel(days: number): string {
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "today";
  return `in ${days}d`;
}

export default async function SeminarMePage() {
  const me = await currentParticipant();
  if (!me) redirect("/signin");

  const [config, participants, files, reviewsAboutMe, reviewsIWrote] = await Promise.all([
    readConfig(),
    listParticipants(me.edition),
    listFiles(me.edition),
    listReviewsFor(me.id),
    listReviewsBy(me.id),
  ]);
  const [myEvents, myResponses, responsesToMe] = await Promise.all([
    listEventsAbout(me.edition, me.id),
    listResponsesBy(me.id),
    listResponsesTo(me.id),
  ]);

  const rule = config.formats.find((f) => f.key === me.format);
  const milestones = [...config.milestones]
    .filter(isDeadline)
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  const upcoming = nextMilestone(config.milestones);
  const round = impliedRound(config.milestones);
  const kindOptions = deliverableKindOptions(me.format);

  // Mentioned, never enforced: uploads are accepted whenever they arrive, and
  // each one is kept, so a late revision costs nothing but a later timestamp.
  const roundMilestone = milestones.find((m) => m.key === `submission_${round}`);
  const dueNote = roundMilestone
    ? `Round ${round} was due ${roundMilestone.dueOn} (${daysLabel(daysUntil(roundMilestone.dueOn))}). Later is fine — upload whenever it's ready, and every version is kept.`
    : undefined;

  // My own uploads: rows I both own and authored — the reviews other people
  // wrote about me have participantId === me.id but a different authorId, and
  // templates are excluded because they belong to nobody: an organiser who
  // also presents would otherwise find the cohort's handouts filed under
  // their personal deliverable, delete buttons included.
  const myUploads = files.filter(
    (f) => f.participantId === me.id && f.authorId === me.id && f.kind !== "template",
  );
  const reviewsReceived = files.filter(
    (f) => f.participantId === me.id && f.kind === "review" && f.authorId !== me.id,
  );
  const reviewees = participants.filter(
    (p) => p.id !== me.id && (p.reviewer1Id === me.id || p.reviewer2Id === me.id),
  );
  const reviewer1 = participants.find((p) => p.id === me.reviewer1Id);
  const pickerOptions = participants.filter((p) => p.id !== me.id).map(publicParticipant);
  const nameById = Object.fromEntries(participants.map((p) => [p.id, p.name]));
  const formatLabels = Object.fromEntries(config.formats.map((f) => [f.key, f.label]));
  const submittedIds = [
    ...new Set(files.filter((f) => f.kind === "submission").map((f) => f.participantId)),
  ];

  // Both knobs live in the edition config; the picker only renders what
  // the process actually lets a participant choose.
  const selfPickReviewer2 = config.reviewerCount === 2 && config.reviewerTwoSelfPick;

  return (
    <main className="min-h-screen">
      <PortalNav active="/me" signedInAs={me.name} isOrganizer={me.isOrganizer || me.isAdmin} />
      <div className="mx-auto max-w-3xl px-6 pt-10 pb-24 sm:px-12">
        {/* Hero: who I am, what I'm making, and the loudest deadline. */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{me.name}</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {me.institution || "—"}
              {rule && (
                <>
                  {" · "}
                  <span className="text-foreground font-medium">{rule.label}</span>
                </>
              )}
            </p>
          </div>
          {upcoming && (
            <div className="text-right">
              <div className={`text-sm font-medium ${urgencyClass(daysUntil(upcoming.dueOn))}`}>
                {upcoming.label} {daysLabel(daysUntil(upcoming.dueOn))}
              </div>
              <div className="text-muted-foreground text-xs">{upcoming.dueOn}</div>
            </div>
          )}
        </header>

        {/* Format rule: goal, deliverable, length — with the disputed-length
            warning surfaced instead of buried. */}
        {rule ? (
          <Card className="mt-8">
            <CardHeader>
              <CardTitle>Your format: {rule.label}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>{rule.goal}</p>
              <p className="text-muted-foreground">
                {rule.deliverable} · {rule.length}
              </p>
              {rule.lengthDisputed && rule.lengthNote && (
                <p className="text-soon bg-soon-surface mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-xs">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  {rule.lengthNote}
                </p>
              )}
            </CardContent>
          </Card>
        ) : (
          <p className="text-muted-foreground mt-8 text-sm">
            No format assigned yet — ask the organiser.
          </p>
        )}

        {/* Deadlines, all of them, so nothing is a surprise. */}
        <section className="mt-10">
          <h2 className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
            <CalendarClock className="size-3.5" />
            Deadlines
          </h2>
          <ul className="divide-border/60 mt-3 divide-y">
            {milestones.map((m) => {
              const days = daysUntil(m.dueOn);
              return (
                <li key={m.key} className="flex items-baseline justify-between gap-4 py-2 text-sm">
                  <div>
                    <span className="font-medium">{m.label}</span>
                    <span className="text-muted-foreground ml-2">{m.description}</span>
                  </div>
                  <span className={`shrink-0 font-mono text-xs tabular-nums ${urgencyClass(days)}`}>
                    {daysLabel(days)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <Separator className="mt-10" />

        {/* The main job: upload my deliverable, see what I've already sent. */}
        <section className="mt-10">
          <h2 className="text-lg font-semibold tracking-tight">Your deliverable</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Upload your submission, and in round 3 your change history{" "}
            {me.format === "full_paper" && "and project-management slide "}
            alongside it.
          </p>
          <UploadForm
            dueNote={dueNote}
            participantId={me.id}
            kindOptions={kindOptions}
            defaultRound={round}
            className="mt-4"
          />
          <div className="mt-5">
            <FileList
              files={myUploads}
              canDelete
              showKind
              emptyMessage="Nothing uploaded yet."
            />
          </div>
        </section>

        {/* Reviews I've received: what I revise against. */}
        <section className="mt-10">
          <h2 className="text-lg font-semibold tracking-tight">Reviews you&apos;ve received</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            The scores from your reviewers. Each written comment sits once, under
            &quot;Your revision&quot; below, next to your reply.
          </p>
          <div className="mt-4">
            <ReviewsReceived reviews={reviewsAboutMe} reviewerNames={nameById} scoresOnly />
          </div>
          {/* Reviews filled on the old Word sheet and uploaded as a file still
              show up here, so an edition part-way through the change is not
              silently missing half its feedback. */}
          {reviewsReceived.length > 0 && (
            <div className="mt-4">
              <FileList files={reviewsReceived} emptyMessage="" />
            </div>
          )}
        </section>

        {/* Revision phase: a reply to every comment, handed back to the
            reviewer as the change history the workshop asks for. */}
        {reviewsAboutMe.length > 0 && (
          <section className="mt-10">
            <h2 className="text-lg font-semibold tracking-tight">Your revision</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Reply to each comment, and say where you addressed it. Your reviewer sees this.
            </p>
            <div className="mt-4 space-y-8">
              {reviewsAboutMe.map((review) => (
                <ResponseForm
                  key={review.id}
                  review={review}
                  reviewerName={nameById[review.reviewerId] ?? "Your reviewer"}
                  response={myResponses.find((r) => r.reviewId === review.id) ?? null}
                />
              ))}
            </div>
          </section>
        )}

        {/* Reviews I owe: an obligation per reviewee, each with its own
            upload form so the status is visible at a glance. */}
        <section className="mt-10">
          <h2 className="text-lg font-semibold tracking-tight">Reviews you owe</h2>
          {reviewees.length === 0 ? (
            <p className="text-muted-foreground mt-2 text-sm">
              You aren&apos;t assigned as a reviewer for anyone yet.
            </p>
          ) : (
            <div className="mt-4">
              {/* One tab per author: two full review sheets stacked would be a
                  wall of scroll, and the tab hint shows at a glance which one
                  still needs work. */}
              <SwitchTabs
                items={reviewees.map((r) => {
                  const theirSubmissions = files.filter(
                    (f) => f.participantId === r.id && f.kind === "submission",
                  );
                  const alreadyReviewed =
                    reviewsIWrote.some((v) => v.participantId === r.id) ||
                    files.some(
                      (f) => f.participantId === r.id && f.authorId === me.id && f.kind === "review",
                    );
                  const waiting = theirSubmissions.length === 0 && !alreadyReviewed;
                  return {
                    key: String(r.id),
                    label: r.name,
                    hint: alreadyReviewed ? "submitted" : waiting ? "waiting" : "needed",
                  };
                })}
              >
              {reviewees.map((r) => {
                const theirSubmissions = files.filter(
                  (f) => f.participantId === r.id && f.kind === "submission",
                );
                const myReview = reviewsIWrote.find((v) => v.participantId === r.id) ?? null;
                const alreadyReviewed =
                  myReview !== null ||
                  files.some(
                    (f) => f.participantId === r.id && f.authorId === me.id && f.kind === "review",
                  );
                // Nothing to review until they have uploaded something.
                const waiting = theirSubmissions.length === 0 && !alreadyReviewed;
                return (
                  <Card key={r.id}>
                    <CardHeader className="flex-row items-center justify-between">
                      <CardTitle>{r.name}</CardTitle>
                      <Badge variant={alreadyReviewed ? "secondary" : waiting ? "outline" : "default"}>
                        {alreadyReviewed ? "Review submitted" : waiting ? "Waiting for their draft" : "Review needed"}
                      </Badge>
                    </CardHeader>
                    <CardContent>
                      <FileList
                        files={theirSubmissions}
                        emptyMessage="They haven't uploaded a submission yet."
                      />
                      {!waiting && (
                        <ReviewForm participant={publicParticipant(r)} review={myReview} />
                      )}
                    </CardContent>
                  </Card>
                );
              })}
              </SwitchTabs>
            </div>
          )}
        </section>

        <Separator className="mt-10" />

        {/* Housekeeping: my picks, quiet at the bottom since it's a one-time
            decision rather than a recurring task. Shown from the start —
            unlike reviewing, choosing who reviews you is something to do
            early, not something waiting on anyone else. */}
        <section className="mt-10">
          <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            {selfPickReviewer2 && config.useDiscussant
              ? "Reviewer 2 & discussant"
              : selfPickReviewer2
                ? "Reviewer 2"
                : config.useDiscussant
                  ? "Discussant"
                  : "Reviewing"}
          </h2>
          <p className="text-muted-foreground mt-2 text-sm">
            Reviewer 1 is assigned: <span className="text-foreground">{reviewer1?.name ?? "not set yet"}</span>.{" "}
            <Refs text={config.reviewerCircleNote} />
          </p>
          {config.useDiscussant && (
            <p className="text-muted-foreground mt-2 text-sm"><Refs text={config.discussantNote} /></p>
          )}
          {(selfPickReviewer2 || config.useDiscussant) && (
            <div className="mt-4">
              <ReviewerPicker
                options={pickerOptions}
                reviewer1Id={me.reviewer1Id}
                reviewer2Id={me.reviewer2Id}
                discussantId={me.discussantId}
                formatLabels={formatLabels}
                submittedIds={submittedIds}
                showReviewer2={selfPickReviewer2}
                showDiscussant={config.useDiscussant}
              />
            </div>
          )}
        </section>

        {responsesToMe.length > 0 && (
          <section className="mt-10">
            <h2 className="text-lg font-semibold tracking-tight">Responses to your reviews</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              What the authors did with the comments you wrote.
            </p>
            <div className="mt-4 space-y-6">
              {responsesToMe.map((response) => {
                const review = reviewsIWrote.find((v) => v.id === response.reviewId);
                if (!review) return null;
                return (
                  <ResponsesToMyReview
                    key={response.id}
                    review={review}
                    response={response}
                    authorName={nameById[response.participantId] ?? "The author"}
                  />
                );
              })}
            </div>
          </section>
        )}

        <Separator className="mt-10" />

        {/* Who touched my work, and when. Downloads are the point of this. */}
        <section className="mt-10">
          <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            Activity
          </h2>
          <div className="mt-4">
            <MyTrail events={myEvents} participants={participants} participantId={me.id} />
          </div>
        </section>
      </div>
    </main>
  );
}
