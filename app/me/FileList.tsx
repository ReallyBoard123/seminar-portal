"use client";

import { Download, Trash2 } from "lucide-react";
import { useActionState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { removeFile, type ActionResult } from "./actions";
import type { FileKind, SeminarFile } from "../lib/types";

const INITIAL: ActionResult = { ok: true, message: "" };

const KIND_LABELS: Record<FileKind, string> = {
  submission: "Submission",
  review: "Review",
  change_history: "Change history",
  slide: "PM slide",
  template: "Template",
};

const DATE_FMT = new Intl.DateTimeFormat("en", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DeleteButton({ fileId }: { fileId: number }) {
  const [state, formAction, pending] = useActionState(removeFile.bind(null, fileId), INITIAL);
  return (
    <div className="flex flex-col items-end gap-1">
      <form action={formAction}>
        <Button
          type="submit"
          variant="ghost"
          size="icon-sm"
          disabled={pending}
          title="Delete this upload"
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </form>
      {!state.ok && state.message && <p className="text-destructive text-[11px]">{state.message}</p>}
    </div>
  );
}

export function FileList({
  files,
  canDelete = false,
  showKind = false,
  emptyMessage,
}: {
  files: SeminarFile[];
  canDelete?: boolean;
  showKind?: boolean;
  emptyMessage: string;
}) {
  if (files.length === 0) {
    return <p className="text-muted-foreground text-sm">{emptyMessage}</p>;
  }

  return (
    <ul className="divide-border/60 divide-y">
      {files.map((f) => (
        <li key={f.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
          <div className="min-w-0">
            <a
              href={`/api/file?id=${f.id}`}
              className="hover:text-foreground inline-flex items-center gap-1.5 truncate underline underline-offset-3"
            >
              <Download className="size-3.5 shrink-0" />
              <span className="truncate">{f.filename}</span>
              {showKind && <Badge variant="outline">{KIND_LABELS[f.kind]}</Badge>}
            </a>
            <div className="text-muted-foreground mt-0.5 font-mono text-[11px] tabular-nums">
              round {f.round} · {formatSize(f.size)} · {DATE_FMT.format(new Date(f.uploadedAt))}
            </div>
            {f.note && (
              <div className="text-muted-foreground mt-0.5 text-[12px] italic">&ldquo;{f.note}&rdquo;</div>
            )}
          </div>
          {canDelete && <DeleteButton fileId={f.id} />}
        </li>
      ))}
    </ul>
  );
}
