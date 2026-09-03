import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

import { proxy } from "./proxy";

function requestFor(pathname: string): NextRequest {
  return new NextRequest(new URL(pathname, "http://localhost"));
}

function withGate(pathname: string, cookieValue: string): NextRequest {
  const headers = new Headers();
  headers.set("cookie", `portal_gate=${cookieValue}`);
  return new NextRequest(new URL(pathname, "http://localhost"), { headers });
}

function isRedirectToSignin(response: Response): boolean {
  return response.status === 307 && (response.headers.get("location") ?? "").includes("/signin");
}

function isPassthrough(response: Response): boolean {
  return response.headers.get("x-middleware-next") === "1";
}

let originalPassword: string | undefined;

beforeEach(() => {
  originalPassword = process.env.PORTAL_PASSWORD;
  delete process.env.PORTAL_PASSWORD;
  vi.unstubAllEnvs();
});

afterEach(() => {
  if (originalPassword === undefined) delete process.env.PORTAL_PASSWORD;
  else process.env.PORTAL_PASSWORD = originalPassword;
  vi.unstubAllEnvs();
});

describe("no password configured", () => {
  test("local dev runs open", () => {
    expect(isPassthrough(proxy(requestFor("/")))).toBe(true);
  });

  // A deployment that forgot its password must not silently publish the
  // portal; 503 makes the misconfiguration loud.
  test("a real deployment fails closed", () => {
    vi.stubEnv("VERCEL", "1");
    expect(proxy(requestFor("/")).status).toBe(503);
  });
});

describe("the gate", () => {
  beforeEach(() => {
    process.env.PORTAL_PASSWORD = "gate-secret";
  });

  test.each(["/", "/me", "/people", "/resources", "/admin", "/api/file"])(
    "redirects %s to the sign-in page without the cookie",
    (pathname) => {
      expect(isRedirectToSignin(proxy(requestFor(pathname)))).toBe(true);
    },
  );

  test("remembers the requested path as ?next=", () => {
    const location = proxy(requestFor("/me")).headers.get("location") ?? "";
    expect(location).toContain("next=%2Fme");
  });

  test("the sign-in page itself stays reachable", () => {
    expect(isPassthrough(proxy(requestFor("/signin")))).toBe(true);
  });

  test("the right cookie passes", () => {
    expect(isPassthrough(proxy(withGate("/", "gate-secret")))).toBe(true);
  });

  test("a wrong cookie redirects, not errors", () => {
    expect(isRedirectToSignin(proxy(withGate("/", "wrong")))).toBe(true);
  });

  test("an empty cookie never matches, even against strange env states", () => {
    expect(isRedirectToSignin(proxy(withGate("/me", "")))).toBe(true);
  });
});
