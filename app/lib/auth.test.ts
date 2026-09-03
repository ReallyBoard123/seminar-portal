import { beforeEach, describe, expect, test, vi } from "vitest";

// signIn goes through db.ts, which goes through client() in ../snapshot —
// same house pattern as db.test.ts and config.test.ts: mock @libsql/client,
// never touch a real database or the network. hashPin/verifyPin don't touch
// the db at all, but the mock is harmless for them.
const executeMock = vi.fn();
vi.mock("@libsql/client", () => ({
  createClient: () => ({ execute: executeMock }),
}));

const { hashPin, verifyPin, signIn } = await import("./auth");

beforeEach(() => {
  executeMock.mockReset();
  executeMock.mockResolvedValue({ rows: [], rowsAffected: 0 });
  vi.stubEnv("TURSO_DATABASE_URL", "libsql://test");
  vi.stubEnv("TURSO_AUTH_TOKEN", "test-token");
});

// PBKDF2 at 210,000 iterations is deliberately slow, so this record is
// generated once and reused by every test below that only needs a valid
// record to check against — verifyPin's functional tests and signIn's
// ok/wrong_pin cases. Only the `hashPin` tests below need fresh calls,
// because they are testing what hashPin itself produces.
const PIN = "483920";
const validRecord = await hashPin(PIN);
const [algo, hashAlgo, iterations, salt, digest] = validRecord.split("$");

describe("hashPin", () => {
  test("produces a pbkdf2$sha256$<iterations>$<salt>$<hash> record", () => {
    expect(validRecord).toMatch(/^pbkdf2\$sha256\$210000\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(algo).toBe("pbkdf2");
    expect(hashAlgo).toBe("sha256");
    expect(iterations).toBe("210000");
    expect(salt.length).toBeGreaterThan(0);
    expect(digest.length).toBeGreaterThan(0);
  });

  test("uses a different salt on every call", async () => {
    const other = await hashPin(PIN);
    expect(other.split("$")[3]).not.toBe(salt);
  });

  test("never contains the PIN itself", () => {
    expect(validRecord).not.toContain(PIN);
  });
});

describe("verifyPin", () => {
  test("accepts the right PIN", async () => {
    expect(await verifyPin(PIN, validRecord)).toBe(true);
  });

  test("rejects a wrong PIN", async () => {
    expect(await verifyPin("000000", validRecord)).toBe(false);
  });

  test("rejects an empty PIN", async () => {
    expect(await verifyPin("", validRecord)).toBe(false);
  });

  test("rejects a near-miss PIN (one digit off)", async () => {
    const nearMiss = `${PIN.slice(0, -1)}${PIN.at(-1) === "9" ? "8" : "9"}`;
    expect(await verifyPin(nearMiss, validRecord)).toBe(false);
  });

  describe("never throws on a malformed record — returns false instead", () => {
    test("wrong field count", async () => {
      const record = [algo, hashAlgo, iterations, salt].join("$"); // missing the digest
      await expect(verifyPin(PIN, record)).resolves.toBe(false);
    });

    test("wrong algorithm name", async () => {
      const record = ["pbkdf2", "sha1", iterations, salt, digest].join("$");
      await expect(verifyPin(PIN, record)).resolves.toBe(false);
    });

    test("non-numeric iteration count", async () => {
      const record = [algo, hashAlgo, "not-a-number", salt, digest].join("$");
      await expect(verifyPin(PIN, record)).resolves.toBe(false);
    });

    test("absurdly low iteration count", async () => {
      const record = [algo, hashAlgo, "1", salt, digest].join("$");
      await expect(verifyPin(PIN, record)).resolves.toBe(false);
    });

    test("invalid base64 in the salt", async () => {
      const record = [algo, hashAlgo, iterations, "not-valid-base64!!!", digest].join("$");
      await expect(verifyPin(PIN, record)).resolves.toBe(false);
    });

    test("completely malformed garbage", async () => {
      await expect(verifyPin(PIN, "not a pbkdf2 record at all")).resolves.toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// signIn
// ---------------------------------------------------------------------------

function participantRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 12,
    edition: 5,
    name: "Nina Grau",
    email: "nina@example.com",
    institution: "University of Kassel",
    format: "poster",
    token: "existing-token-12",
    reviewer1_id: null,
    reviewer2_id: null,
    postdoc_reviewer: "",
    discussant_id: null,
    is_organizer: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    pin_hash: "",
    claimed_at: "",
    ...overrides,
  };
}

describe("signIn", () => {
  test("returns unknown_name for a name nobody on the roster has", async () => {
    executeMock.mockResolvedValue({ rows: [participantRow()] });

    const result = await signIn(5, "Nobody Here", "123456");

    expect(result).toEqual({ status: "unknown_name" });
  });

  test("returns needs_pin when the participant exists with an empty pinHash", async () => {
    executeMock.mockResolvedValue({ rows: [participantRow({ pin_hash: "" })] });

    const result = await signIn(5, "Grau", "whatever-they-typed");

    expect(result.status).toBe("needs_pin");
    expect(result.status === "needs_pin" && result.participant.name).toBe("Nina Grau");
  });

  test("returns ok for a correct PIN", async () => {
    executeMock.mockResolvedValue({ rows: [participantRow({ pin_hash: validRecord })] });

    const result = await signIn(5, "Grau", PIN);

    expect(result.status).toBe("ok");
    expect(result.status === "ok" && result.participant.name).toBe("Nina Grau");
  });

  test("returns wrong_pin for an incorrect PIN", async () => {
    executeMock.mockResolvedValue({ rows: [participantRow({ pin_hash: validRecord })] });

    const result = await signIn(5, "Grau", "000000");

    expect(result).toEqual({ status: "wrong_pin" });
  });
});
