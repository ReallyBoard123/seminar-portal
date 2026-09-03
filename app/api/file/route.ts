/**
 * Serve one the seminar upload from the private blob store.
 *
 * Blob URLs are never handed to the browser: the client asks for a file by
 * row id, this handler resolves who is asking from the session cookie, and
 * decides whether that person may read it before streaming the bytes
 * through. Mirrors the pattern of /api/pdf, but resolves the URL server-side
 * from the database so an arbitrary blob URL can never be proxied.
 */

import { get } from "@vercel/blob";

import { currentParticipant } from "../../lib/auth";
import { getFile, listParticipants, logEvent } from "../../lib/db";
import type { Participant, SeminarFile } from "../../lib/types";

/** Who may read a given upload. Authors see their own; the two assigned
 *  reviewers and the discussant see what they have to comment on; whoever
 *  uploaded a file can always read it back; organisers see everything. */
function mayRead(viewer: Participant, file: SeminarFile, owner: Participant | undefined): boolean {
  if (viewer.isOrganizer || viewer.isAdmin) return true;
  if (file.authorId === viewer.id) return true;
  if (file.participantId === viewer.id) return true;
  if (!owner) return false;
  return (
    owner.reviewer1Id === viewer.id ||
    owner.reviewer2Id === viewer.id ||
    owner.discussantId === viewer.id
  );
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const id = Number(params.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: "invalid file id" }, { status: 400 });
  }

  const file = await getFile(id);
  // Same answer for "no such file" and "not yours" — the id space stays opaque.
  if (!file) return Response.json({ error: "file not found" }, { status: 404 });

  // Paper templates and review sheets belong to nobody and are meant for every
  // participant, including the ones reading the hub with no session at all.
  // The shared portal password is their gate.
  let viewer: Participant | null = null;
  if (file.kind !== "template") {
    viewer = await currentParticipant();
    if (!viewer) return Response.json({ error: "not signed in" }, { status: 401 });

    const owner = (await listParticipants(viewer.edition)).find((p) => p.id === file.participantId);
    if (!mayRead(viewer, file, owner)) {
      return Response.json({ error: "file not found" }, { status: 404 });
    }
  }

  // A row can outlive its blob — deleted from the store, or the store briefly
  // unreachable. That is a 404 for the reader, not a stack trace: `get` throws
  // rather than returning a status for a URL it cannot reach at all.
  let result;
  try {
    result = await get(file.blobUrl, { access: "private" });
  } catch (error: unknown) {
    console.error("portal blob fetch failed", error);
    return Response.json({ error: "file missing from storage" }, { status: 404 });
  }
  if (!result || result.statusCode !== 200) {
    return Response.json({ error: "file missing from storage" }, { status: 404 });
  }

  // Templates are cohort-wide handouts, not someone's draft — logging every
  // read of them would drown the "who opened my submission" signal in noise.
  if (viewer) {
    await logEvent({
      edition: viewer.edition,
      actor: { id: viewer.id, name: viewer.name },
      action: "download",
      subjectId: file.participantId,
      fileId: file.id,
    });
  }

  return new Response(result.stream, {
    headers: {
      "content-type": result.blob.contentType || "application/octet-stream",
      "content-disposition": `attachment; filename="${file.filename.replace(/["\\]/g, "")}"`,
      "cache-control": "private, max-age=300",
    },
  });
}
