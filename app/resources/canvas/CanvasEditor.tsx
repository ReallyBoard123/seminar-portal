"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { saveCanvasFields, type ActionResult } from "./actions";
import type { CanvasBandDef, CanvasDefinition, CanvasFieldKey, SeminarCanvas } from "../../lib/types";

const INITIAL: ActionResult = { ok: true, message: "" };
/** Long enough that a sentence-in-progress doesn't fire a save mid-word,
 *  short enough that a pause between thoughts is enough to trigger one. */
const SAVE_DELAY_MS = 1200;

/** Only the definition's own keys ever land here — a save posts nothing else. */
type Fields = Partial<Record<CanvasFieldKey, string>>;

const val = (fields: Fields, key: CanvasFieldKey): string => fields[key] ?? "";

function initialFields(canvas: SeminarCanvas, definition: CanvasDefinition): Fields {
  const out: Fields = {};
  for (const f of definition.fields) out[f.key] = canvas.fields[f.key] ?? "";
  return out;
}

function sameFields(a: Fields, b: Fields, definition: CanvasDefinition): boolean {
  return definition.fields.every((f) => val(a, f.key) === val(b, f.key));
}

function formDataFor(next: Fields, definition: CanvasDefinition): FormData {
  const fd = new FormData();
  for (const f of definition.fields) fd.set(f.key, val(next, f.key));
  return fd;
}

/** Cell counts this canvas set actually uses. Anything else falls back to a
 *  4-wide grid rather than growing this table speculatively. */
function gridColsClass(n: number): string {
  switch (n) {
    case 1:
      return "sm:grid-cols-1 print:grid-cols-1";
    case 2:
      return "sm:grid-cols-2 print:grid-cols-2";
    case 3:
      return "sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-3";
    case 6:
      // Two rows of three reads better than four-then-two.
      return "sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-3";
    default:
      return "sm:grid-cols-2 lg:grid-cols-4 print:grid-cols-4";
  }
}

function columnsClass(n: number): string {
  switch (n) {
    case 2:
      return "sm:grid-cols-2 print:grid-cols-2";
    default:
      return "sm:grid-cols-3 print:grid-cols-3";
  }
}

function CanvasCell({
  fieldKey,
  label,
  hint,
  value,
  onChange,
  emphasize,
}: {
  fieldKey: CanvasFieldKey;
  label: string;
  hint: string;
  value: string;
  onChange: (key: CanvasFieldKey, value: string) => void;
  emphasize?: boolean;
}) {
  const filled = value.trim().length > 0;
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1.5 rounded-lg border p-3",
        emphasize
          ? "border-primary/50 bg-primary/[0.06] ring-1 ring-primary/20 print:border-2"
          : "border-border/70 bg-card/40",
      )}
    >
      <label
        htmlFor={fieldKey}
        className={cn(
          "text-[13px] font-semibold",
          emphasize ? "text-primary" : "text-foreground/80",
        )}
      >
        {label}
      </label>
      {/* Help when empty, out of the way once there's something to read — a
       *  height/opacity transition rather than an instant swap. */}
      <p
        className={cn(
          "text-muted-foreground overflow-hidden text-[11px] leading-snug transition-all duration-200 print:hidden",
          filled ? "max-h-0 opacity-0" : "max-h-12 opacity-100",
        )}
      >
        {hint}
      </p>
      <Textarea
        id={fieldKey}
        name={fieldKey}
        value={value}
        onChange={(e) => onChange(fieldKey, e.target.value)}
        rows={emphasize ? 4 : 3}
        className="min-h-16 flex-1 resize-y border-0 bg-transparent px-0 py-0 text-[13px] shadow-none focus-visible:ring-1 focus-visible:ring-primary/40 print:hidden"
      />
      {/* The printed stand-in: a plain wrapped block, so a long answer never
       *  gets clipped the way a textarea's own scroll box would in print. */}
      <div className="hidden min-h-[3.5em] flex-1 text-[12px] leading-snug whitespace-pre-wrap print:block">
        {value || " "}
      </div>
    </div>
  );
}

function BandHeader({ label, sub }: { label: string; sub: string }) {
  return (
    <div className="mb-2 flex items-baseline gap-2">
      <h2 className="text-sm font-bold">{label}</h2>
      <span className="text-muted-foreground text-[11px] print:hidden">{sub}</span>
    </div>
  );
}

function Arrow({ flip }: { flip?: boolean }) {
  return (
    <div aria-hidden className="text-muted-foreground hidden items-center justify-center text-lg sm:flex print:flex">
      {flip ? "←" : "→"}
    </div>
  );
}

/** One band, laid out as a row. The band holding `centerKey` — if any —
 *  renders as the flanked-centre triptych; every other band is an even grid. */
function RowBand({
  band,
  definition,
  fields,
  onChange,
}: {
  band: CanvasBandDef;
  definition: CanvasDefinition;
  fields: Fields;
  onChange: (key: CanvasFieldKey, value: string) => void;
}) {
  const bandFields = definition.fields.filter((f) => f.band === band.key);
  const centerIndex = definition.centerKey ? bandFields.findIndex((f) => f.key === definition.centerKey) : -1;

  if (centerIndex >= 0) {
    const left = bandFields.slice(0, centerIndex);
    const center = bandFields[centerIndex];
    const right = bandFields.slice(centerIndex + 1);
    return (
      <section>
        <BandHeader label={band.label} sub={band.sub} />
        <div className="grid grid-cols-1 items-stretch gap-2 sm:grid-cols-[1fr_auto_1.3fr_auto_1fr] print:grid-cols-[1fr_auto_1.3fr_auto_1fr] print:gap-2">
          {left.map((f) => (
            <CanvasCell
              key={f.key}
              fieldKey={f.key}
              label={f.label}
              hint={f.hint}
              value={val(fields, f.key)}
              onChange={onChange}
            />
          ))}
          {left.length > 0 && <Arrow />}
          <CanvasCell
            fieldKey={center.key}
            label={center.label}
            hint={center.hint}
            value={val(fields, center.key)}
            onChange={onChange}
            emphasize
          />
          {right.length > 0 && <Arrow flip />}
          {right.map((f) => (
            <CanvasCell
              key={f.key}
              fieldKey={f.key}
              label={f.label}
              hint={f.hint}
              value={val(fields, f.key)}
              onChange={onChange}
            />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section>
      <BandHeader label={band.label} sub={band.sub} />
      <div className={cn("grid grid-cols-1 gap-3 print:gap-2", gridColsClass(bandFields.length))}>
        {bandFields.map((f) => (
          <CanvasCell
            key={f.key}
            fieldKey={f.key}
            label={f.label}
            hint={f.hint}
            value={val(fields, f.key)}
            onChange={onChange}
          />
        ))}
      </div>
    </section>
  );
}

/** No band has a centre to flank, so the bands themselves become the visual
 *  unit — one labelled column per band, its questions stacked underneath.
 *  Used for the Relevance Pitch: three bands read as three columns, on
 *  screen and on the printed page alike. */
function CanvasColumns({
  definition,
  fields,
  onChange,
}: {
  definition: CanvasDefinition;
  fields: Fields;
  onChange: (key: CanvasFieldKey, value: string) => void;
}) {
  return (
    <div className={cn("grid grid-cols-1 gap-5 print:gap-3", columnsClass(definition.bands.length))}>
      {definition.bands.map((band) => (
        <section key={band.key} className="flex flex-col gap-3">
          <BandHeader label={band.label} sub={band.sub} />
          <div className="flex flex-col gap-3">
            {definition.fields
              .filter((f) => f.band === band.key)
              .map((f) => (
                <CanvasCell
                  key={f.key}
                  fieldKey={f.key}
                  label={f.label}
                  hint={f.hint}
                  value={val(fields, f.key)}
                  onChange={onChange}
                />
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function CanvasEditor({
  participantName,
  edition,
  canvas,
  definition,
}: {
  participantName: string;
  edition: number;
  canvas: SeminarCanvas;
  definition: CanvasDefinition;
}) {
  const [fields, setFields] = useState<Fields>(() => initialFields(canvas, definition));
  const [dirty, setDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(canvas.updatedAt || null);
  const [state, formAction, pending] = useActionState(saveCanvasFields, INITIAL);
  const [, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The snapshot a scheduled-but-not-yet-sent save would carry, so navigating
  // away inside the debounce window doesn't silently drop the last sentence.
  const unsentRef = useRef<Fields | null>(null);
  // The snapshot the in-flight (or most recent) save actually sent. Plain
  // state rather than a ref: it's read during render below, and refs can't
  // be read during render.
  const [lastSubmitted, setLastSubmitted] = useState<Fields>(() => initialFields(canvas, definition));

  // Reset "unsaved" the moment a save resolves — but only if nothing has
  // changed since the snapshot that save actually sent, so typing during the
  // round trip doesn't get quietly marked as saved. Adjusted during render,
  // same pattern ReviewForm and ProfileForm use instead of an effect.
  const [syncedState, setSyncedState] = useState(state);
  if (state !== syncedState) {
    setSyncedState(state);
    if (state.ok) setLastSavedAt(new Date().toISOString());
    if (sameFields(lastSubmitted, fields, definition)) setDirty(false);
  }

  function flush(next: Fields) {
    unsentRef.current = null;
    setLastSubmitted(next);
    startTransition(() => formAction(formDataFor(next, definition)));
  }

  function handleChange(key: CanvasFieldKey, value: string) {
    setFields((prev) => {
      const next = { ...prev, [key]: value };
      unsentRef.current = next;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => flush(next), SAVE_DELAY_MS);
      return next;
    });
    setDirty(true);
  }

  // Leaving the page mid-debounce would otherwise lose up to SAVE_DELAY_MS of
  // typing without a word. The action is called directly rather than through
  // `formAction`: by cleanup time there is no component left to hold a
  // transition, but the request is already on its way.
  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      const unsent = unsentRef.current;
      if (unsent) void saveCanvasFields(INITIAL, formDataFor(unsent, definition));
    },
    // `definition` is a page-load prop, not something that changes under a
    // mounted editor, but listing it here (rather than a ref written during
    // render) is what satisfies exhaustive-deps without disabling the rule.
    [definition],
  );

  function handleSaveNow() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    flush(fields);
  }

  // Two-step inline confirm instead of a browser dialog or a modal: the
  // button itself asks. Emptying every cell saves immediately — the audit
  // trail and the debounce path both see it as an ordinary save.
  const [confirmClear, setConfirmClear] = useState(false);

  function handleClearAll() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const empty: Fields = {};
    for (const f of definition.fields) empty[f.key] = "";
    setFields(empty);
    setDirty(true);
    setConfirmClear(false);
    flush(empty);
  }

  const statusText = pending
    ? "Saving…"
    : dirty
      ? "Unsaved changes"
      : lastSavedAt
        ? `Saved · ${new Date(lastSavedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
        : "Not saved yet";

  const hasWorkingTitle = definition.fields.some((f) => f.key === "workingTitle");
  // No field is drawn as a centre, and there's more than one band to spread
  // out — that's the shape that reads as columns, not stacked rows.
  const useColumns = !definition.centerKey && definition.bands.length > 1;

  return (
    <div className="canvas-print mx-auto max-w-6xl px-6 py-8 sm:px-10 print:max-w-none print:p-0">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{definition.title}</h1>
          <p className="text-muted-foreground text-sm">{definition.subtitle}</p>
          {definition.citation && (
            <p className="text-muted-foreground mt-1 text-xs">
              {definition.citation.url ? (
                <a
                  href={definition.citation.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2"
                >
                  {definition.citation.label}
                </a>
              ) : (
                definition.citation.label
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground text-xs">{statusText}</span>
          {confirmClear ? (
            <>
              <Button type="button" variant="destructive" size="sm" onClick={handleClearAll}>
                Really clear every cell
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmClear(false)}>
                Keep it
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => setConfirmClear(true)}
              disabled={pending}
            >
              Clear all
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" onClick={handleSaveNow} disabled={pending || !dirty}>
            Save now
          </Button>
          <Button type="button" size="sm" onClick={() => window.print()}>
            Download as PDF
          </Button>
        </div>
      </header>

      {!state.ok && state.message && (
        <p className="text-destructive mb-4 text-xs print:hidden">{state.message}</p>
      )}

      {/* Print-only masthead: the screen header disappears with the rest of
       *  the chrome, so the printed page still identifies itself. */}
      <div className="hidden print:mb-3 print:block">
        <div className="flex items-baseline justify-between border-b pb-1">
          <span className="text-base font-bold">{definition.title}</span>
          <span className="text-xs">
            {participantName} · Edition {edition}
          </span>
        </div>
        {hasWorkingTitle && fields.workingTitle && <p className="mt-1 text-sm italic">{fields.workingTitle}</p>}
        {definition.citation && (
          <p className="mt-0.5 text-[10px]">
            {definition.citation.label}
            {definition.citation.url && ` — ${definition.citation.url}`}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-5 print:gap-3">
        {useColumns ? (
          <CanvasColumns definition={definition} fields={fields} onChange={handleChange} />
        ) : (
          definition.bands.map((band) => (
            <RowBand key={band.key} band={band} definition={definition} fields={fields} onChange={handleChange} />
          ))
        )}
      </div>
    </div>
  );
}
