/**
 * Portal sign-in: last name plus a PIN the participant sets themselves.
 *
 * The shared seminar password gets someone into the area; this decides *who*
 * they are inside it. Names are public — they are printed on /people —
 * so the name alone identifies, and the PIN is what authenticates. The first
 * person to claim a name sets its PIN (trust on first use); after that the
 * name requires that PIN, and only an organiser can reset it.
 *
 * A successful sign-in stores the participant's existing `token` in an
 * HttpOnly cookie. Every authorisation path already keys off that token, so
 * nothing downstream changes — and the token stops travelling in the URL,
 * where it landed in browser history and referrers.
 */

import { cookies } from "next/headers";

import { getParticipantByName, getParticipantByToken } from "./db";
import type { Participant } from "./types";

export const SESSION_COOKIE = "portal_session";

/** Long enough to cover an edition end to end; a participant should sign in
 *  once at kick-off and not think about it again. */
const SESSION_MAX_AGE = 60 * 60 * 24 * 150;

export const MIN_PIN_LENGTH = 6;

export { nameKeys, normaliseNameInput } from "./names";

// ---------------------------------------------------------------------------
// PIN hashing — PBKDF2 via WebCrypto, which both Node and the edge runtime have
// ---------------------------------------------------------------------------

const PBKDF2_ITERATIONS = 210_000;

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

async function derive(pin: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    key,
    256,
  );
  return toBase64(new Uint8Array(bits));
}

export async function hashPin(pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(pin, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$sha256$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${hash}`;
}

/** Constant-time-ish string compare. The values are equal-length base64
 *  digests, so length alone leaks nothing useful. */
function sameDigest(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyPin(pin: string, record: string): Promise<boolean> {
  const parts = record.split("$");
  if (parts.length !== 5 || parts[0] !== "pbkdf2" || parts[1] !== "sha256") return false;
  const iterations = Number(parts[2]);
  if (!Number.isInteger(iterations) || iterations < 1000) return false;
  try {
    return sameDigest(await derive(pin, fromBase64(parts[3]), iterations), parts[4]);
  } catch {
    return false; // malformed base64 in a stored record is a failed check, not a crash
  }
}

// ---------------------------------------------------------------------------
// Session cookie
// ---------------------------------------------------------------------------

export async function startSession(participant: Participant): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, participant.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/**
 * Who is making this request, or null.
 *
 * The cookie is the normal path. `tokenFromUrl` stays supported so the
 * organiser's bootstrap link still works and so an existing magic link is not
 * suddenly dead — but nothing hands out URL tokens any more.
 */
export async function currentParticipant(tokenFromUrl?: string): Promise<Participant | null> {
  const jar = await cookies();
  const cookieToken = jar.get(SESSION_COOKIE)?.value ?? "";
  return (
    (cookieToken ? await getParticipantByToken(cookieToken) : null) ??
    (tokenFromUrl ? await getParticipantByToken(tokenFromUrl) : null)
  );
}

export type SignInOutcome =
  | { status: "ok"; participant: Participant }
  | { status: "needs_pin"; participant: Participant } // name is unclaimed — set one
  | { status: "wrong_pin" }
  | { status: "unknown_name" };

/**
 * Resolve a typed name and PIN to a participant.
 *
 * "unknown name" and "wrong PIN" are answered separately on purpose: the
 * roster is public, so hiding which names exist buys nothing, and telling
 * someone their name was not recognised is the difference between a usable
 * form and a mystifying one.
 */
export async function signIn(
  edition: number,
  nameInput: string,
  pin: string,
): Promise<SignInOutcome> {
  const participant = await getParticipantByName(edition, nameInput);
  if (!participant) return { status: "unknown_name" };
  if (!participant.pinHash) return { status: "needs_pin", participant };
  return (await verifyPin(pin, participant.pinHash))
    ? { status: "ok", participant }
    : { status: "wrong_pin" };
}
