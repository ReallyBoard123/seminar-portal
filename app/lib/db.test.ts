import { beforeEach, describe, expect, test, vi } from "vitest";

// db.ts never touches a real database here: @libsql/client is mocked, and
// client() (in ../snapshot) only needs the env vars set to hand back the mock.
// vi.mock is hoisted above these imports, so the mocked module is what
// getParticipantByToken/updateParticipant/newToken below resolve against.
const executeMock = vi.fn();
vi.mock("@libsql/client", () => ({
  createClient: () => ({ execute: executeMock }),
}));

const { getParticipantByToken, newToken, saveCanvas, updateParticipant } = await import("./db");
type ParticipantPatch = Parameters<typeof updateParticipant>[1];

beforeEach(() => {
  executeMock.mockReset();
  executeMock.mockResolvedValue({ rows: [], rowsAffected: 0 });
  vi.stubEnv("TURSO_DATABASE_URL", "libsql://test");
  vi.stubEnv("TURSO_AUTH_TOKEN", "test-token");
});

type ExecuteCall = { sql: string; args: unknown[] };

function updateCalls(): ExecuteCall[] {
  // ensureSchema passes bare DDL strings, the queries pass {sql, args}.
  return executeMock.mock.calls
    .map(([call]) => call as string | ExecuteCall)
    .filter((call): call is ExecuteCall => typeof call !== "string")
    .filter((call) => call.sql.startsWith("UPDATE"));
}

describe("updateParticipant", () => {
  test("excludes a patch key that is not in the editable column map from the generated SQL", async () => {
    // A caller outside the type system (e.g. a JSON request body) could try
    // to smuggle in a column that was never meant to be user-editable.
    const patch = { email: "new@example.com" } as ParticipantPatch as Record<string, unknown>;
    patch.token = "attacker-supplied-token";

    await updateParticipant(1, patch as ParticipantPatch);

    const [call] = updateCalls();
    expect(call.sql).toContain("email = ?");
    expect(call.sql).not.toContain("token");
    expect(call.args).toEqual(["new@example.com", 1]);
  });

  test("writes a true boolean patch value as 1", async () => {
    await updateParticipant(5, { isOrganizer: true });

    const [call] = updateCalls();
    expect(call.sql).toContain("is_organizer = ?");
    expect(call.args).toEqual([1, 5]);
  });

  test("writes a false boolean patch value as 0", async () => {
    await updateParticipant(5, { isOrganizer: false });

    const [call] = updateCalls();
    expect(call.args).toEqual([0, 5]);
  });

  test("does not touch the database when the patch has no editable keys", async () => {
    await updateParticipant(1, {} as ParticipantPatch);

    expect(updateCalls()).toHaveLength(0);
  });
});

describe("getParticipantByToken", () => {
  test("maps a raw db row into a Participant, defaulting an unrecognized format to empty string", async () => {
    executeMock.mockResolvedValue({
      rows: [
        {
          id: 7,
          edition: 32,
          name: "Ada Lovelace",
          email: "ada@example.com",
          institution: "University of Kassel",
          format: "not-a-real-format",
          token: "abc123",
          reviewer1_id: null,
          reviewer2_id: 3,
          postdoc_reviewer: "",
          discussant_id: null,
          is_organizer: 1,
          created_at: "2026-08-10T00:00:00.000Z",
        },
      ],
    });

    const participant = await getParticipantByToken("abc123");

    expect(participant).toEqual({
      id: 7,
      edition: 32,
      name: "Ada Lovelace",
      email: "ada@example.com",
      institution: "University of Kassel",
      format: "",
      token: "abc123",
      reviewer1Id: null,
      reviewer2Id: 3,
      postdocReviewer: "",
      discussantId: null,
      isOrganizer: true,
      isAdmin: false,
      createdAt: "2026-08-10T00:00:00.000Z",
      pinHash: "",
      claimedAt: "",
      workingTitle: "",
      interests: "",
      methods: "",
      phase: "",
      bio: "",
      homepageUrl: "",
      scholarUrl: "",
      orcid: "",
    });
  });

  test("returns null for an unknown token", async () => {
    executeMock.mockResolvedValue({ rows: [] });

    const participant = await getParticipantByToken("no-such-token");

    expect(participant).toBeNull();
  });
});

describe("newToken", () => {
  test("returns a URL-safe token with no dashes", () => {
    const token = newToken();

    expect(token).not.toContain("-");
    expect(token).toMatch(/^[0-9a-f]+$/);
  });

  test("returns tokens of a stable length", () => {
    const first = newToken();
    const second = newToken();

    expect(first).toHaveLength(32);
    expect(second).toHaveLength(32);
  });

  test("does not repeat across calls", () => {
    const tokens = Array.from({ length: 1000 }, () => newToken());

    expect(new Set(tokens).size).toBe(1000);
  });
});

describe("saveCanvas", () => {
  // Regression: each canvas posts only its own keys; a plain overwrite of the
  // one-blob-per-person row wiped every other canvas's cells. The write must
  // merge into the stored JSON, never replace it.
  test("merges posted keys into the stored blob instead of replacing it", async () => {
    await saveCanvas(7, { emPurpose: "why" });

    const call = executeMock.mock.calls
      .map(([c]) => c)
      .find((c) => typeof c !== "string" && c.sql.includes("canvas"));
    expect(call).toBeDefined();
    expect(call.sql).toContain("json_patch");
    expect(call.args[1]).toBe(JSON.stringify({ emPurpose: "why" }));
  });
});
