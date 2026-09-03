import Link from "next/link";
import { redirect } from "next/navigation";

import { currentParticipant } from "../../lib/auth";
import { readConfig } from "../../lib/config";
import { readCanvas } from "../../lib/db";
import { CANVASES, FORMAT_KEYS, type FormatKey } from "../../lib/types";

import { CanvasEditor } from "./CanvasEditor";
import { PortalNav } from "../../components/PortalNav";
import "./canvas.css";

/**
 * The canvas is a structuring aid, not a deliverable. By default you get the
 * one your format prescribes, but any canvas is open to anyone via
 * ?format=… — a poster author drafting next year's paper is
 * welcome to the structured-abstract canvas. Field keys are unique across canvases
 * (see canvases.test.ts), so filling in a foreign canvas can never clobber
 * your own.
 */
export default async function SeminarCanvasPage({
  searchParams,
}: {
  searchParams: Promise<{ format?: string }>;
}) {
  const me = await currentParticipant();
  if (!me) redirect("/signin");

  const { format } = await searchParams;
  const picked =
    format && (FORMAT_KEYS as readonly string[]).includes(format) ? (format as FormatKey) : me.format;

  const [config, canvas] = await Promise.all([readConfig(), readCanvas(me.id)]);
  const definition = picked ? CANVASES[picked] : undefined;

  return (
    <main className="min-h-screen">
      <div className="print:hidden">
        <PortalNav active="/resources" signedInAs={me.name} isOrganizer={me.isOrganizer} />
        <div className="mx-auto max-w-6xl px-6 pt-5 sm:px-10">
          <Link
            href="/resources"
            className="text-muted-foreground hover:text-foreground text-[13px]"
          >
            ← All resources
          </Link>
        </div>
      </div>
      {definition ? (
        <CanvasEditor participantName={me.name} edition={config.edition} canvas={canvas} definition={definition} />
      ) : (
        <div className="mx-auto max-w-2xl px-6 py-16 sm:px-10">
          <h1 className="text-xl font-semibold tracking-tight">No canvas yet</h1>
          <p className="text-muted-foreground mt-3 text-sm">
            You don&apos;t have a format assigned yet, so there&apos;s no default canvas to open.
            Pick any of them from the resources page — every format has one.
          </p>
        </div>
      )}
    </main>
  );
}
