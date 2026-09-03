import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * The seminar gate: one shared password for the whole portal, carried as an
 * HttpOnly cookie set by the sign-in page. Individual identity (name + PIN)
 * is layered on top of this inside the app; this proxy only keeps the site
 * from being public.
 *
 * Fail-closed: a real deployment with no PORTAL_PASSWORD answers 503 rather
 * than opening up. Local dev with no password set runs open, so `pnpm dev`
 * works before any env file exists.
 */

/** Constant-time string comparison, so the gate can't be timed. */
function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const bytesA = encoder.encode(a);
  const bytesB = encoder.encode(b);
  if (bytesA.length !== bytesB.length) return false;
  let diff = 0;
  for (let i = 0; i < bytesA.length; i++) diff |= bytesA[i] ^ bytesB[i];
  return diff === 0;
}

export const GATE_COOKIE = "portal_gate";
const GATE_PATH = "/signin";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // The sign-in page must stay reachable, or nobody could ever set the cookie.
  if (pathname === GATE_PATH) return NextResponse.next();

  const password = process.env.PORTAL_PASSWORD;
  if (!password) {
    // No password at all: local dev runs open, a real deployment fails closed.
    if (!process.env.VERCEL && process.env.NODE_ENV !== "production") return NextResponse.next();
    return new NextResponse("portal password not configured", { status: 503 });
  }

  const cookie = request.cookies.get(GATE_COOKIE)?.value ?? "";
  if (cookie && timingSafeEqual(cookie, password)) return NextResponse.next();

  // Not signed in: send them to the gate, remembering where they were going.
  const url = request.nextUrl.clone();
  url.pathname = GATE_PATH;
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export default proxy;

export const config = {
  // Everything except Next's own assets and the favicon goes through the gate.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
