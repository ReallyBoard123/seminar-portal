"use server";

/**
 * Sign-in for the portal: last name plus a self-set PIN.
 *
 * Two actions, matching the two states the page can be in. `signInAction`
 * handles the normal case and detects the first-visit case (name exists,
 * nobody has claimed it yet). `claimPinAction` finishes that first-visit
 * case: it re-resolves the name itself rather than trusting a participant id
 * from the form, so the claim can't be redirected onto the wrong row.
 */

import { redirect } from "next/navigation";
import { z } from "zod";

import { readConfig } from "../lib/config";
import { hashPin, MIN_PIN_LENGTH, signIn, startSession, endSession } from "../lib/auth";
import { getParticipantByName, logEvent, setPinHash } from "../lib/db";
import { cookies } from "next/headers";

import { parseForm } from "../lib/forms";
import { GATE_COOKIE } from "../../proxy";

export type SignInState =
  | { step: "login"; ok: boolean; message: string }
  | { step: "pin"; ok: boolean; message: string; name: string }
  | { step: "claim"; ok: boolean; message: string; name: string };

/**
 * Where to land after signing in. The gate wrote the original destination
 * into ?next, but a redirect target from a query string is attacker-chosen
 * text: it must be a same-origin path inside the workshop, or it is ignored.
 * "//evil.example" parses as a protocol-relative URL, hence the double-slash
 * check on top of the prefix.
 */
function safeNext(value: string): string {
  return value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")
    ? value
    : "/me";
}

const UNKNOWN_NAME_MESSAGE =
  "That name wasn't recognised. Check the spelling against the roster on the Who does what page.";

// A missing "name" key (no such input in the form) is treated the same as an
// empty one, matching the old `String(formData.get("name") ?? "")`.
const requiredName = z.preprocess(
  (v) => (v === undefined ? "" : v),
  z.string().trim().min(1, "Enter your last name."),
);

const signInSchema = z.object({
  seminarPassword: z.string().default(""),
  name: requiredName,
});

const pinSchema = z.object({
  name: z.preprocess((v) => (v === undefined ? "" : v), z.string().trim()),
  pin: z.string().default(""), // never trimmed — a PIN's whitespace is significant
  next: z.string().default(""),
});

/**
 * The shared workshop password, checked here rather than by a browser dialog.
 * Passing it sets a cookie the gate in proxy.ts recognises, so it is asked
 * once per device and everything after that is just name and PIN.
 *
 * Already holding a valid cookie counts: somebody who is signed in and comes
 * back should not have to retype the seminar password to switch account.
 */
async function passSeminarGate(supplied: string): Promise<boolean> {
  const expected = process.env.PORTAL_PASSWORD;
  if (!expected) return true; // unset: local dev, and proxy.ts leaves the area open
  const jar = await cookies();
  if (jar.get(GATE_COOKIE)?.value === expected) return true;
  if (supplied !== expected) return false;
  jar.set(GATE_COOKIE, expected, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 150,
  });
  return true;
}

export async function signInAction(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = parseForm(signInSchema, formData);
  if (!parsed.ok) return { step: "login", ok: false, message: parsed.message };
  const { seminarPassword, name } = parsed.data;

  if (!(await passSeminarGate(seminarPassword))) {
    return { step: "login", ok: false, message: "That seminar password is not right." };
  }

  const config = await readConfig();
  const participant = await getParticipantByName(config.edition, name);
  if (!participant) return { step: "login", ok: false, message: UNKNOWN_NAME_MESSAGE };

  // Whether this is a first visit is the app's question to answer, not the
  // participant's: it is in the database, so ask it rather than asking them
  // to leave a field blank.
  return participant.pinHash
    ? { step: "pin", ok: true, message: "", name: participant.name }
    : { step: "claim", ok: true, message: "", name: participant.name };
}

/** Step two for somebody who already has a PIN. */
export async function verifyPinAction(_prev: SignInState, formData: FormData): Promise<SignInState> {
  if (!(await passSeminarGate(""))) {
    return { step: "login", ok: false, message: "Enter the seminar password first." };
  }
  const parsed = parseForm(pinSchema, formData);
  if (!parsed.ok) return { step: "login", ok: false, message: parsed.message };
  const { name, pin } = parsed.data;

  const config = await readConfig();
  const outcome = await signIn(config.edition, name, pin);

  if (outcome.status === "unknown_name") {
    return { step: "login", ok: false, message: UNKNOWN_NAME_MESSAGE };
  }
  // Claimed between the two steps — rare, but it must not silently fail.
  if (outcome.status === "needs_pin") {
    return { step: "claim", ok: true, message: "", name: outcome.participant.name };
  }
  if (outcome.status === "wrong_pin") {
    return {
      step: "pin",
      ok: false,
      message: "That PIN is wrong. Ask an organiser for a reset if you have forgotten it.",
      name,
    };
  }

  await startSession(outcome.participant);
  await logEvent({
    edition: config.edition,
    actor: { id: outcome.participant.id, name: outcome.participant.name },
    action: "signin",
  });
  redirect(safeNext(parsed.data.next));
}

// The claim step has three outcomes with three different shapes (`login` vs
// `claim`, with or without `name`), so the business rules stay as plain
// checks below — a schema only takes over the raw extraction/defaulting.
const claimSchema = z.object({
  name: z.preprocess((v) => (v === undefined ? "" : v), z.string().trim()),
  pin: z.string().default(""),
  pinConfirm: z.string().default(""),
  next: z.string().default(""),
});

export async function claimPinAction(_prev: SignInState, formData: FormData): Promise<SignInState> {
  if (!(await passSeminarGate(""))) {
    return { step: "login", ok: false, message: "Enter the seminar password first." };
  }
  const parsed = parseForm(claimSchema, formData);
  if (!parsed.ok) return { step: "login", ok: false, message: parsed.message };
  const { name, pin, pinConfirm } = parsed.data;

  if (!name) return { step: "login", ok: false, message: "Enter your last name." };
  if (pin.length < MIN_PIN_LENGTH) {
    return { step: "claim", ok: false, message: `PIN must be at least ${MIN_PIN_LENGTH} characters.`, name };
  }
  if (pin !== pinConfirm) {
    return { step: "claim", ok: false, message: "Those two PINs don't match.", name };
  }

  const config = await readConfig();
  const participant = await getParticipantByName(config.edition, name);
  if (!participant) {
    return { step: "login", ok: false, message: UNKNOWN_NAME_MESSAGE };
  }
  if (participant.pinHash) {
    // Somebody else claimed this name while this form was open.
    return {
      step: "login",
      ok: false,
      message: "This name already has a PIN set. Sign in with it, or ask the organiser for a reset.",
    };
  }

  await setPinHash(participant.id, await hashPin(pin));
  await startSession(participant);
  await logEvent({
    edition: config.edition,
    actor: { id: participant.id, name: participant.name },
    action: "pin_claim",
  });
  redirect(safeNext(parsed.data.next));
}

export async function signOutAction(): Promise<void> {
  await endSession();
  redirect("/");
}
