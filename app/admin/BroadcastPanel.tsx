"use client";

import { Send } from "lucide-react";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { broadcastMail, type ActionResult } from "./mail-actions";

const INITIAL: ActionResult = { ok: true, message: "" };

type Group = { name: string; count: number };

/**
 * The organiser's "write to everyone" form: pick institution groups, write a
 * plain-text message, optionally attach files, send once. The mail goes out
 * as a single bcc'd message from the no-reply address, signed with the
 * organiser's name — anyone replying writes to the organiser directly.
 */
export function BroadcastPanel({ groups }: { groups: Group[] }) {
  const [state, formAction, pending] = useActionState(broadcastMail, INITIAL);
  const [chosen, setChosen] = useState<Set<string>>(new Set());

  const toggle = (name: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const allChosen = groups.length > 0 && groups.every((g) => chosen.has(g.name));
  const recipientCount = groups.filter((g) => chosen.has(g.name)).reduce((sum, g) => sum + g.count, 0);

  return (
    <details className="group border-border/60 bg-card rounded-xl border">
      <summary className="marker:content-none cursor-pointer list-none px-5 py-4">
        <span className="font-heading inline-flex items-center gap-2 text-base font-semibold">
          Write to the cohort
          <span className="text-muted-foreground text-xs font-normal group-open:hidden">
            — one email, chosen groups, attachments if needed
          </span>
        </span>
      </summary>

      <form action={formAction} className="space-y-5 border-t border-border/60 px-5 py-5">
        <fieldset>
          <legend className="text-muted-foreground mb-2 text-xs font-semibold">To</legend>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setChosen(allChosen ? new Set() : new Set(groups.map((g) => g.name)))}
              className={cn(
                "rounded-full border px-3 py-1.5 text-[13px] transition-colors",
                allChosen
                  ? "border-foreground bg-foreground text-background"
                  : "border-border/60 hover:border-foreground/40",
              )}
            >
              Everyone
            </button>
            {groups.map((g) => (
              <label
                key={g.name}
                className={cn(
                  "cursor-pointer rounded-full border px-3 py-1.5 text-[13px] transition-colors",
                  chosen.has(g.name)
                    ? "border-foreground bg-foreground text-background"
                    : "border-border/60 hover:border-foreground/40",
                )}
              >
                <input
                  type="checkbox"
                  name="group"
                  value={g.name}
                  checked={chosen.has(g.name)}
                  onChange={() => toggle(g.name)}
                  className="sr-only"
                />
                {g.name} · {g.count}
              </label>
            ))}
          </div>
          <p className="text-muted-foreground mt-2 text-[12px]">
            {recipientCount === 0
              ? "Nobody selected yet."
              : `${recipientCount} ${recipientCount === 1 ? "person" : "people"} will get this — addresses go in bcc, so nobody sees the list.`}
          </p>
        </fieldset>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground text-xs">Subject</span>
          <Input name="subject" required maxLength={200} placeholder="Subject…" />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground text-xs">Message</span>
          <Textarea
            name="message"
            required
            maxLength={5000}
            rows={7}
            placeholder="Plain text. Your name is signed underneath automatically."
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground text-xs">
            Attachments — up to 5 files, 15 MB in total
          </span>
          <input
            type="file"
            name="attachments"
            multiple
            accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.png,.jpg,.jpeg"
            className="text-[13px] file:border-border/60 file:bg-muted file:mr-3 file:rounded-md file:border file:px-3 file:py-1.5 file:text-[13px]"
          />
        </label>

        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" disabled={pending || recipientCount === 0}>
            <Send className="size-3.5" />
            {pending ? "Sending…" : "Send"}
          </Button>
          {state.message && (
            <p className={cn("text-[13px]", state.ok ? "text-settled" : "text-destructive")}>{state.message}</p>
          )}
        </div>
      </form>
    </details>
  );
}
