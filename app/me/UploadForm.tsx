"use client";

import { UploadCloud } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

import { uploadFile, type ActionResult } from "./actions";
import type { FileKind, Round } from "../lib/types";

const INITIAL: ActionResult = { ok: true, message: "" };

const ROUND_OPTIONS: { value: Round; label: string }[] = [
  { value: 1, label: "Round 1" },
  { value: 2, label: "Round 2" },
  { value: 3, label: "Round 3 · camera-ready" },
];

/** One upload form, reused for a participant's own deliverable and for the
 *  reviews they owe — only which kinds are offered and whose row the file
 *  attaches to differ, so there is one form instead of two. */
export function UploadForm({
  participantId,
  kindOptions,
  defaultRound,
  submitLabel = "Upload",
  dueNote,
  className,
}: {
  participantId: number;
  kindOptions: { value: FileKind; label: string }[];
  defaultRound: Round;
  submitLabel?: string;
  /** When this round was due. Stated, never enforced — an internal seminar
   *  would rather have the work late than not at all. */
  dueNote?: string;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(uploadFile, INITIAL);

  return (
    <form action={formAction} className={cn("flex flex-wrap items-end gap-2", className)}>
      <input type="hidden" name="participantId" value={participantId} />

      {kindOptions.length > 1 ? (
        <Select name="kind" defaultValue={kindOptions[0].value}>
          <SelectTrigger size="sm" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {kindOptions.map((k) => (
              <SelectItem key={k.value} value={k.value}>
                {k.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <input type="hidden" name="kind" value={kindOptions[0].value} />
      )}

      <Select name="round" defaultValue={String(defaultRound)}>
        <SelectTrigger size="sm" className="w-28">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ROUND_OPTIONS.map((r) => (
            <SelectItem key={r.value} value={String(r.value)}>
              {r.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input type="file" name="file" required className="w-56" />

      <Input
        name="note"
        placeholder="Note for the reader (optional)"
        className="h-9 w-64"
        maxLength={500}
      />

      <Button type="submit" size="sm" disabled={pending}>
        <UploadCloud className="size-3.5" />
        {pending ? "Uploading…" : submitLabel}
      </Button>

      {dueNote && <p className="text-muted-foreground basis-full text-xs">{dueNote}</p>}

      {state.message && (
        <p className={cn("basis-full text-xs", state.ok ? "text-settled" : "text-destructive")}>
          {state.message}
        </p>
      )}
    </form>
  );
}
