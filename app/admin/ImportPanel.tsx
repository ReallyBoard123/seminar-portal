"use client";

import { ClipboardPaste, UploadCloud } from "lucide-react";
import { useActionState, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { bootstrapImport, importParticipants, type ActionResult } from "./actions";
import { CSV_TEMPLATE } from "./csv-template";

const INITIAL: ActionResult = { ok: true, message: "" };

type Props = { mode: "bootstrap" } | { mode: "organizer" };

/** CSV import, shared between the one-time bootstrap (no session yet —
 *  there's no organiser before the first import) and the regular organiser
 *  import. */
export function ImportPanel(props: Props) {
  const [csv, setCsv] = useState("");

  async function runImport(prev: ActionResult, payload: { csv: string }): Promise<ActionResult> {
    return props.mode === "bootstrap" ? bootstrapImport(prev, payload) : importParticipants(prev, payload);
  }

  const [state, dispatch, actionPending] = useActionState(runImport, INITIAL);
  // useActionState's dispatch must run inside a transition, or isPending
  // never flips and the button shows no progress on a 24-row import.
  const [transitionPending, startTransition] = useTransition();
  const pending = actionPending || transitionPending;

  return (
    <div className="rounded-xl border border-border/60 bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-heading text-base font-semibold">
            {props.mode === "bootstrap" ? "Import the roster" : "Import participants"}
          </h3>
          <p className="text-muted-foreground mt-1 text-[13px]">
            CSV columns: name, email, institution, format. Every row imports together — one bad
            line and nothing is saved.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setCsv(CSV_TEMPLATE)}>
          <ClipboardPaste className="size-3.5" />
          Fill template
        </Button>
      </div>

      <Textarea
        className="mt-4 min-h-40 font-mono text-[13px]"
        placeholder="name,email,institution,format"
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
      />

      <div className="mt-3 flex items-center gap-3">
        <Button type="button" disabled={pending || !csv.trim()} onClick={() => startTransition(() => dispatch({ csv }))}>
          <UploadCloud className="size-3.5" />
          {pending ? "Importing…" : "Import"}
        </Button>
        {state.message && (
          <p className={cn("text-[13px] whitespace-pre-line", state.ok ? "text-settled" : "text-destructive")}>
            {state.message}
          </p>
        )}
      </div>
    </div>
  );
}
