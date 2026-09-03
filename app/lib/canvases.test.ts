import { beforeEach, describe, expect, test, vi } from "vitest";

import { CANVASES, type CanvasDefinition } from "./types";

// db.ts never touches a real database here: @libsql/client is mocked, and
// client() (in ../snapshot) only needs the env vars set to hand back the mock.
// vi.mock is hoisted above these imports, so the mocked module is what
// readCanvas/saveCanvas below resolve against. See db.test.ts for the same idiom.
const executeMock = vi.fn();
vi.mock("@libsql/client", () => ({
  createClient: () => ({ execute: executeMock }),
}));

const { readCanvas, saveCanvas } = await import("./db");

beforeEach(() => {
  executeMock.mockReset();
  executeMock.mockResolvedValue({ rows: [], rowsAffected: 0 });
  vi.stubEnv("TURSO_DATABASE_URL", "libsql://test");
  vi.stubEnv("TURSO_AUTH_TOKEN", "test-token");
});

type ExecuteCall = { sql: string; args: unknown[] };

// All canvases write into the same canvas JSON blob (see db.ts), so a
// field key appearing in two canvases would silently share text between them,
// and a band or centerKey pointing outside its own canvas would draw a blank
// panel. These invariants are what the multi-canvas design depends on.
//
// short_paper and full_paper deliberately point at the identical Emerald
// canvas object, so entries are de-duplicated by identity first — otherwise
// its fields would be counted twice and falsely look like a collision.
const canvasEntries = Array.from(new Set(Object.values(CANVASES))) as CanvasDefinition[];

describe("CANVASES structural invariants", () => {
  test("no field key is shared between two canvases", () => {
    const allKeys = canvasEntries.flatMap((canvas) => canvas.fields.map((field) => field.key));

    expect(new Set(allKeys).size).toBe(allKeys.length);
  });

  test("every field's band exists in its own canvas's bands", () => {
    for (const canvas of canvasEntries) {
      const bandKeys = new Set(canvas.bands.map((band) => band.key));
      for (const field of canvas.fields) {
        expect(bandKeys.has(field.band)).toBe(true);
      }
    }
  });

  test("every band has at least one field", () => {
    for (const canvas of canvasEntries) {
      for (const band of canvas.bands) {
        const hasField = canvas.fields.some((field) => field.band === band.key);
        expect(hasField).toBe(true);
      }
    }
  });

  test("a defined centerKey refers to a field of the same canvas", () => {
    for (const canvas of canvasEntries) {
      if (!canvas.centerKey) continue;
      const hasField = canvas.fields.some((field) => field.key === canvas.centerKey);
      expect(hasField).toBe(true);
    }
  });

  test("every field has a non-empty label and hint", () => {
    for (const canvas of canvasEntries) {
      for (const field of canvas.fields) {
        expect(field.label.trim().length).toBeGreaterThan(0);
        expect(field.hint.trim().length).toBeGreaterThan(0);
      }
    }
  });

  test("every canvas has a non-empty title and subtitle", () => {
    for (const canvas of canvasEntries) {
      expect(canvas.title.trim().length).toBeGreaterThan(0);
      expect(canvas.subtitle.trim().length).toBeGreaterThan(0);
    }
  });

  test("a non-empty citation url is https, on doi.org or the Emerald authoring guide", () => {
    for (const canvas of canvasEntries) {
      const url = canvas.citation?.url ?? "";
      if (!url) continue;
      expect(url).toMatch(/^https:\/\//);
      expect(["doi.org", "www.emeraldgrouppublishing.com"]).toContain(new URL(url).hostname);
    }
  });
});

describe("poster canvas", () => {
  test("centers on the idea field and cites Faff (2015) over https", () => {
    const canvas = CANVASES.poster;

    expect(canvas?.centerKey).toBe("idea");
    expect(canvas?.citation?.url).toBe("https://doi.org/10.1111/acfi.12116");
  });
});

describe("Emerald structured abstract canvas", () => {
  test("short_paper and full_paper deliberately share the identical canvas object", () => {
    expect(CANVASES.short_paper).toBe(CANVASES.full_paper);
  });

  test("cites the Emerald authoring guide over https", () => {
    const canvas = CANVASES.short_paper;

    expect(canvas?.citation?.url).toBe(
      "https://www.emeraldgrouppublishing.com/how-to/authoring-editing-reviewing/write-article-abstract",
    );
  });
});

describe("saveCanvas + readCanvas round trip", () => {
  test("keys from both canvases survive together in one participant's blob", async () => {
    let storedFields = "{}";
    executeMock.mockImplementation((arg: string | ExecuteCall) => {
      if (typeof arg === "string") return Promise.resolve({ rows: [] }); // ensureSchema DDL
      if (arg.sql.startsWith("INSERT INTO canvas")) {
        storedFields = String(arg.args[1]);
        return Promise.resolve({ rows: [], rowsAffected: 1 });
      }
      if (arg.sql.startsWith("SELECT * FROM canvas")) {
        return Promise.resolve({
          rows: [{ participant_id: 9, fields: storedFields, updated_at: "2026-09-01T00:00:00.000Z" }],
        });
      }
      return Promise.resolve({ rows: [] });
    });

    await saveCanvas(9, {
      workingTitle: "A puzzle worth solving",
      emPurpose: "Why this research exists",
    });
    const canvas = await readCanvas(9);

    expect(canvas.fields).toEqual({
      workingTitle: "A puzzle worth solving",
      emPurpose: "Why this research exists",
    });
  });
});

describe("readCanvas", () => {
  test("returns empty fields instead of throwing on a corrupt JSON blob", async () => {
    executeMock.mockResolvedValue({
      rows: [{ participant_id: 3, fields: "{not valid json", updated_at: "2026-01-01T00:00:00.000Z" }],
    });

    const canvas = await readCanvas(3);

    expect(canvas.fields).toEqual({});
    expect(canvas.participantId).toBe(3);
    expect(canvas.updatedAt).toBe("2026-01-01T00:00:00.000Z");
  });
});
