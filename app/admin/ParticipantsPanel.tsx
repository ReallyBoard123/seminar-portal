"use client";

import { RotateCcw } from "lucide-react";
import { useActionState, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FORMAT_KEYS, type FormatKey, type Participant } from "@/app/lib/types";

import { resetPinAction, saveAssignment, type ActionResult } from "./actions";

const FORMAT_LABEL: Record<FormatKey, string> = {
  short_paper: "Short Paper",
  full_paper: "Full Paper",
  poster: "Poster",
  workshop: "Workshop",
};

const INITIAL: ActionResult = { ok: true, message: "" };

/** "has a PIN" and "has claimed" are the same fact — claimedAt is only ever
 *  set alongside pinHash — but claimedAt is what carries the date. */
function claimLabel(claimedAt: string): string {
  return claimedAt ? `Claimed ${claimedAt.slice(0, 10)}` : "Not signed in yet";
}

function ParticipantRow({
  participant,
  roster,
  viewerIsAdmin,
}: {
  participant: Participant;
  roster: Participant[];
  viewerIsAdmin: boolean;
}) {
  const [format, setFormat] = useState<FormatKey | "">(participant.format);
  const [reviewer1Id, setReviewer1Id] = useState<number | null>(participant.reviewer1Id);
  const [reviewer2Id, setReviewer2Id] = useState<number | null>(participant.reviewer2Id);
  const [discussantId, setDiscussantId] = useState<number | null>(participant.discussantId);
  const [postdoc, setPostdoc] = useState(participant.postdocReviewer);
  const [isOrganizer, setIsOrganizer] = useState(participant.isOrganizer);
  const [isAdmin, setIsAdmin] = useState(participant.isAdmin);
  const [email, setEmail] = useState(participant.email);
  const [institution, setInstitution] = useState(participant.institution);
  const [homepageUrl, setHomepageUrl] = useState(participant.homepageUrl);
  const [state, dispatch, pending] = useActionState(saveAssignment, INITIAL);
  const [resetState, dispatchReset, resetPending] = useActionState(resetPinAction, INITIAL);
  const [, startTransition] = useTransition();

  const others = roster.filter((p) => p.id !== participant.id); // never offer self as reviewer
  const dirty =
    format !== participant.format ||
    reviewer1Id !== participant.reviewer1Id ||
    reviewer2Id !== participant.reviewer2Id ||
    discussantId !== participant.discussantId ||
    postdoc !== participant.postdocReviewer ||
    isOrganizer !== participant.isOrganizer ||
    isAdmin !== participant.isAdmin ||
    email !== participant.email ||
    institution !== participant.institution ||
    homepageUrl !== participant.homepageUrl;

  const confirmReset = () => {
    if (
      !window.confirm(
        `Reset ${participant.name}'s PIN? This signs them out everywhere, and the next person to sign in as "${participant.name}" sets a new PIN. Only do this when ${participant.name} actually asked for it.`,
      )
    ) {
      return;
    }
    startTransition(() => dispatchReset({ participantId: participant.id }));
  };

  return (
    <TableRow>
      <TableCell className="font-medium whitespace-nowrap">{participant.name}</TableCell>
      <TableCell>
        <Input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="no address"
          className="h-7 w-48"
        />
      </TableCell>
      <TableCell>
        <Input
          value={institution}
          onChange={(e) => setInstitution(e.target.value)}
          placeholder="Institution"
          className="h-7 w-44"
        />
      </TableCell>
      <TableCell>
        <Input
          value={homepageUrl}
          onChange={(e) => setHomepageUrl(e.target.value)}
          placeholder="Staff page URL"
          className="h-7 w-48"
        />
      </TableCell>
      <TableCell>
        <Select value={format || "none"} onValueChange={(v) => setFormat(v === "none" ? "" : (v as FormatKey))}>
          <SelectTrigger size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">—</SelectItem>
            {FORMAT_KEYS.map((k) => (
              <SelectItem key={k} value={k}>
                {FORMAT_LABEL[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Select
          value={reviewer1Id ? String(reviewer1Id) : "none"}
          onValueChange={(v) => setReviewer1Id(v === "none" ? null : Number(v))}
        >
          <SelectTrigger size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">unassigned</SelectItem>
            {others.map((o) => (
              <SelectItem key={o.id} value={String(o.id)}>
                {o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Select
          value={reviewer2Id ? String(reviewer2Id) : "none"}
          onValueChange={(v) => setReviewer2Id(v === "none" ? null : Number(v))}
        >
          <SelectTrigger size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">not picked</SelectItem>
            {others.map((o) => (
              <SelectItem key={o.id} value={String(o.id)}>
                {o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Select
          value={discussantId ? String(discussantId) : "none"}
          onValueChange={(v) => setDiscussantId(v === "none" ? null : Number(v))}
        >
          <SelectTrigger size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">not picked</SelectItem>
            {others.map((o) => (
              <SelectItem key={o.id} value={String(o.id)}>
                {o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Input
          value={postdoc}
          onChange={(e) => setPostdoc(e.target.value)}
          placeholder="Extra reviewer (free text)"
          className="h-7 w-36"
        />
      </TableCell>
      <TableCell>
        {/* A permission, not a role: an organiser who also presents keeps
            their format and stays in the matrix. */}
        <div className="flex flex-col gap-1">
          <label
            className="flex items-center gap-1.5 text-[12px]"
            title="Sees everything and runs the edition: assignments, reminders, templates, config"
          >
            <input
              type="checkbox"
              checked={isOrganizer}
              disabled={!viewerIsAdmin}
              onChange={(e) => setIsOrganizer(e.target.checked)}
            />
            <span className="text-muted-foreground">Organiser</span>
          </label>
          <label
            className="flex items-center gap-1.5 text-[12px]"
            title="Also manages the roster, PIN resets, and who holds rights"
          >
            <input
              type="checkbox"
              checked={isAdmin}
              disabled={!viewerIsAdmin}
              onChange={(e) => setIsAdmin(e.target.checked)}
            />
            <span className="text-muted-foreground">Admin</span>
          </label>
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground whitespace-nowrap">
        {claimLabel(participant.claimedAt)}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="xs"
            variant={dirty ? "default" : "outline"}
            disabled={!dirty || pending}
            onClick={() =>
              startTransition(() =>
                dispatch({
                  participantId: participant.id,
                  reviewer1Id,
                  reviewer2Id,
                  discussantId,
                  postdocReviewer: postdoc,
                  format,
                  isOrganizer,
                  isAdmin,
                  email,
                  institution,
                  homepageUrl,
                }),
              )
            }
          >
            {pending ? "Saving…" : "Save"}
          </Button>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            disabled={resetPending || !participant.claimedAt}
            onClick={confirmReset}
            title={`Reset ${participant.name}'s PIN`}
          >
            <RotateCcw className="size-3" />
          </Button>
        </div>
        {!state.ok && state.message && <p className="text-destructive mt-1 text-[11px]">{state.message}</p>}
        {resetState.message && (
          <p className={resetState.ok ? "text-settled mt-1 text-[11px]" : "text-destructive mt-1 text-[11px]"}>
            {resetState.message}
          </p>
        )}
      </TableCell>
    </TableRow>
  );
}

/** Reviewer 1 + format + PostDoc reviewer assignment, and each participant's
 *  onboarding status — the things the organiser sets and the thing they need
 *  to track. Reviewer 2 and the discussant stay read-only: they're the
 *  participant's own choice, made from their /me page. */
export function ParticipantsPanel({
  participants,
  viewerIsAdmin,
}: {
  participants: Participant[];
  /** Only an admin may change rights; everyone else sees them read-only. */
  viewerIsAdmin: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border/60">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Institution</TableHead>
            <TableHead>Staff page</TableHead>
            <TableHead>Format</TableHead>
            <TableHead>Reviewer 1</TableHead>
            <TableHead>Reviewer 2</TableHead>
            <TableHead>Discussant</TableHead>
            <TableHead>PostDoc reviewer</TableHead>
            <TableHead>Rights</TableHead>
            <TableHead>Onboarding</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {participants.map((p) => (
            <ParticipantRow key={p.id} participant={p} roster={participants} viewerIsAdmin={viewerIsAdmin} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
