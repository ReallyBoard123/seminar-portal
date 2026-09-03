"use client";

import { Plus, Save, Trash2, Upload } from "lucide-react";
import { useActionState, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { FormatKey, FormatRule, Milestone, TemplateLink, SeminarConfig } from "@/app/lib/types";

import { saveConfig, saveTemplateUpload, type ActionResult } from "./actions";

const INITIAL: ActionResult = { ok: true, message: "" };

function TemplateUploadButton({ label, currentUrl }: { label: string; currentUrl: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, dispatch, pending] = useActionState(saveTemplateUpload, INITIAL);

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        /* Matches saveTemplateUpload's own check: the paper templates are Word
           files, the kick-off deck and revision guide are PDFs or decks. */
        accept=".doc,.docx,.pdf,.ppt,.pptx"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) dispatch({ label, file });
          e.target.value = "";
        }}
      />
      <Button
        type="button"
        size="xs"
        variant="outline"
        disabled={pending || !label.trim()}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="size-3" />
        {pending ? "Uploading…" : currentUrl ? "Replace" : "Upload"}
      </Button>
      {state.message && <span className={cn("text-[11px]", state.ok ? "text-settled" : "text-destructive")}>{state.message}</span>}
    </div>
  );
}

/**
 * The edition's editable config. Collapsed by default — this is secondary to
 * the completion matrix, not the reason the organiser opens the page.
 *
 * Templates are the one field here the organiser doesn't type: `url` is
 * server-managed (set by TemplateUploadButton) and always read from the
 * fresh `config` prop, never from local draft state, so a stale draft can
 * never regress an upload — see the merge in `submit` below.
 */
export function ConfigPanel({ config }: { config: SeminarConfig }) {
  const [draft, setDraft] = useState<SeminarConfig>(config);
  const [state, dispatch, pending] = useActionState(saveConfig, INITIAL);
  const dirty = JSON.stringify(draft) !== JSON.stringify(config);

  const set = <K extends keyof SeminarConfig>(key: K, value: SeminarConfig[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const updateMilestone = (i: number, patch: Partial<Milestone>) =>
    setDraft((d) => ({ ...d, milestones: d.milestones.map((m, idx) => (idx === i ? { ...m, ...patch } : m)) }));
  const addMilestone = () =>
    setDraft((d) => ({
      ...d,
      // Not `milestone_${length + 1}`: adding two, deleting one and adding
      // again reuses a key that is still in use, and the key is what the
      // timeline renders by and `nextMilestone` matches on.
      milestones: [...d.milestones, { key: `milestone_${crypto.randomUUID().slice(0, 8)}`, label: "", dueOn: "", description: "", kind: "deadline" as const }],
    }));
  const removeMilestone = (i: number) => setDraft((d) => ({ ...d, milestones: d.milestones.filter((_, idx) => idx !== i) }));

  const updateFormat = (key: FormatKey, patch: Partial<FormatRule>) =>
    setDraft((d) => ({ ...d, formats: d.formats.map((f) => (f.key === key ? { ...f, ...patch } : f)) }));

  const updateTemplate = (i: number, patch: Partial<TemplateLink>) =>
    setDraft((d) => ({ ...d, templates: d.templates.map((t, idx) => (idx === i ? { ...t, ...patch } : t)) }));
  const addTemplate = () => setDraft((d) => ({ ...d, templates: [...d.templates, { label: "", url: "", note: "", hidden: false }] }));
  const removeTemplate = (i: number) => setDraft((d) => ({ ...d, templates: d.templates.filter((_, idx) => idx !== i) }));

  const submit = () => {
    // Never let an edit made before an upload finished overwrite the URL an
    // upload just set — the server, not the draft, owns that field.
    const merged: SeminarConfig = {
      ...draft,
      templates: draft.templates.map((t, i) => ({ ...t, url: config.templates[i]?.url ?? t.url })),
    };
    dispatch({ config: merged });
  };

  return (
    <details className="group rounded-xl border border-border/60 bg-card">
      <summary className="marker:content-none cursor-pointer list-none px-5 py-4">
        <span className="font-heading inline-flex items-center gap-2 text-base font-semibold">
          Edition settings
          <span className="text-muted-foreground text-xs font-normal group-open:hidden">
            — dates, formats, templates, notes
          </span>
        </span>
      </summary>

      <div className="space-y-8 border-t border-border/60 px-5 py-5">
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground text-xs">Edition</span>
            <Input type="number" value={draft.edition} onChange={(e) => set("edition", Number(e.target.value))} />
          </label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-muted-foreground text-xs">Title</span>
            <Input value={draft.title} onChange={(e) => set("title", e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground text-xs">Short name (emails, print headers)</span>
            <Input value={draft.shortName} onChange={(e) => set("shortName", e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground text-xs">City</span>
            <Input value={draft.city} onChange={(e) => set("city", e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground text-xs">Contact email</span>
            <Input type="email" value={draft.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground text-xs">Site problems email</span>
            <Input
              type="email"
              value={draft.techContactEmail}
              onChange={(e) => set("techContactEmail", e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground text-xs">Starts on</span>
            <Input type="date" value={draft.startsOn} onChange={(e) => set("startsOn", e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground text-xs">Ends on</span>
            <Input type="date" value={draft.endsOn} onChange={(e) => set("endsOn", e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-muted-foreground text-xs">Hosts (one per line)</span>
            <Textarea
              value={draft.hosts.join("\n")}
              onChange={(e) =>
                set(
                  "hosts",
                  e.target.value.split("\n").map((h) => h.trim()).filter(Boolean),
                )
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-muted-foreground text-xs">Social activity</span>
            <Input value={draft.socialActivity} onChange={(e) => set("socialActivity", e.target.value)} />
          </label>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-muted-foreground mb-1 text-xs font-semibold">Review process</legend>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground text-xs">Reviewers per submission</span>
            <select
              className="border-border/60 rounded-md border bg-transparent px-2 py-1 text-sm"
              value={draft.reviewerCount}
              onChange={(e) => set("reviewerCount", Number(e.target.value) === 1 ? 1 : 2)}
            >
              <option value={1}>1 — assigned by the organisers</option>
              <option value={2}>2 — assigned plus a second</option>
            </select>
          </label>
          {draft.reviewerCount === 2 && (
            <label className="flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={draft.reviewerTwoSelfPick}
                onChange={(e) => set("reviewerTwoSelfPick", e.target.checked)}
              />
              Participants pick their own second reviewer (unticked: organisers assign everything)
            </label>
          )}
          <label className="flex items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={draft.useDiscussant}
              onChange={(e) => set("useDiscussant", e.target.checked)}
            />
            Use discussants (each contribution gets one for the seminar days)
          </label>
        </fieldset>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-semibold">Milestones</h4>
            <Button type="button" size="xs" variant="outline" onClick={addMilestone}>
              <Plus className="size-3" />
              Add
            </Button>
          </div>
          <div className="space-y-2">
            {draft.milestones.map((m, i) => (
              // Five cells: label, date, kind, description, delete. The kind
              // select was added without widening this, so description and
              // delete wrapped onto a second row.
              <div key={i} className="grid grid-cols-[1fr_9rem_7rem_2fr_auto] items-start gap-2 rounded-lg border border-border/50 p-2">
                <Input value={m.label} placeholder="Label" onChange={(e) => updateMilestone(i, { label: e.target.value })} />
                <Input type="date" value={m.dueOn} onChange={(e) => updateMilestone(i, { dueOn: e.target.value })} />
                <select
                  aria-label="Milestone kind"
                  className="border-input bg-background h-8 shrink-0 rounded-md border px-2 text-xs"
                  value={m.kind ?? "deadline"}
                  onChange={(e) => updateMilestone(i, { kind: e.target.value as "deadline" | "event" })}
                >
                  <option value="deadline">Deadline</option>
                  <option value="event">Event</option>
                </select>
                <Input
                  value={m.description}
                  placeholder="Description"
                  onChange={(e) => updateMilestone(i, { description: e.target.value })}
                />
                <Button type="button" size="icon-xs" variant="ghost" onClick={() => removeMilestone(i)}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h4 className="mb-2 text-sm font-semibold">Formats</h4>
          <div className="space-y-3">
            {draft.formats.map((f) => (
              <div key={f.key} className="rounded-lg border border-border/50 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground w-32 shrink-0 font-mono text-[12px]">{f.key}</span>
                  <Input className="flex-1" value={f.label} onChange={(e) => updateFormat(f.key, { label: e.target.value })} />
                  <Input className="w-32" value={f.length} placeholder="Length" onChange={(e) => updateFormat(f.key, { length: e.target.value })} />
                </div>
                <Textarea className="mt-2" value={f.goal} placeholder="Goal" onChange={(e) => updateFormat(f.key, { goal: e.target.value })} />
                <Textarea
                  className="mt-2"
                  value={f.deliverable}
                  placeholder="Deliverable"
                  onChange={(e) => updateFormat(f.key, { deliverable: e.target.value })}
                />
                <label className="mt-2 flex items-center gap-2 text-[13px]">
                  <input
                    type="checkbox"
                    checked={!!f.lengthDisputed}
                    onChange={(e) => updateFormat(f.key, { lengthDisputed: e.target.checked })}
                  />
                  length still disputed between the kick-off deck and the template
                </label>
                {f.lengthDisputed && (
                  <Textarea
                    className="mt-2"
                    value={f.lengthNote ?? ""}
                    placeholder="What's disputed, and by how much"
                    onChange={(e) => updateFormat(f.key, { lengthNote: e.target.value })}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-semibold">Templates</h4>
            <Button type="button" size="xs" variant="outline" onClick={addTemplate}>
              <Plus className="size-3" />
              Add
            </Button>
          </div>
          <div className="space-y-2">
            {draft.templates.map((t, i) => {
              const currentUrl = config.templates[i]?.url ?? "";
              return (
                <div key={i} className="rounded-lg border border-border/50 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Input className="flex-1" value={t.label} placeholder="Label" onChange={(e) => updateTemplate(i, { label: e.target.value })} />
                    <TemplateUploadButton label={t.label} currentUrl={currentUrl} />
                    <Button type="button" size="icon-xs" variant="ghost" onClick={() => removeTemplate(i)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                  <Input className="mt-2" value={t.note ?? ""} placeholder="Note" onChange={(e) => updateTemplate(i, { note: e.target.value })} />
                  <p className="text-muted-foreground mt-1 text-[12px]">{currentUrl ? "File uploaded." : "No file uploaded yet."}</p>
                  <label className="mt-2 flex items-center gap-2 text-[12px]">
                    <input
                      type="checkbox"
                      checked={t.hidden ?? false}
                      onChange={(e) => updateTemplate(i, { hidden: e.target.checked })}
                    />
                    <span className="text-muted-foreground">
                      Hold back — participants will not see this until you clear the box
                    </span>
                  </label>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground text-xs">Reviewer circle note</span>
            <Textarea value={draft.reviewerCircleNote} onChange={(e) => set("reviewerCircleNote", e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground text-xs">Discussant note</span>
            <Textarea value={draft.discussantNote} onChange={(e) => set("discussantNote", e.target.value)} />
          </label>
        </div>

        <div className="flex items-center gap-3">
          <Button type="button" disabled={!dirty || pending} onClick={submit}>
            <Save className="size-3.5" />
            {pending ? "Saving…" : "Save settings"}
          </Button>
          {state.message && <p className={cn("text-[13px]", state.ok ? "text-settled" : "text-destructive")}>{state.message}</p>}
        </div>
      </div>
    </details>
  );
}
