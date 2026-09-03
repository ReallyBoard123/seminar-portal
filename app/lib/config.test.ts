import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// The db layer never touches a real network or database: @libsql/client is
// mocked below, and client() (in ../snapshot) only needs the env vars to be
// present to hand back our mocked client. vi.mock is hoisted above these
// imports, so readConfig below resolves against the mocked module.
const executeMock = vi.fn();
vi.mock("@libsql/client", () => ({
  createClient: () => ({ execute: executeMock }),
}));

const { DEFAULT_CONFIG, readConfig } = await import("./config");

describe("readConfig", () => {
  beforeEach(() => {
    executeMock.mockReset();
    vi.stubEnv("TURSO_DATABASE_URL", "libsql://test");
    vi.stubEnv("TURSO_AUTH_TOKEN", "test-token");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("fills a field missing from the stored config with the DEFAULT_CONFIG value", async () => {
    executeMock.mockResolvedValue({ rows: [{ json: JSON.stringify({ edition: 99 }) }] });

    const config = await readConfig();

    expect(config.edition).toBe(99);
    expect(config.title).toBe(DEFAULT_CONFIG.title);
    expect(config.milestones).toEqual(DEFAULT_CONFIG.milestones);
  });

  test("falls back to DEFAULT_CONFIG when the stored blob is malformed JSON", async () => {
    executeMock.mockResolvedValue({ rows: [{ json: "{not valid json" }] });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const config = await readConfig();

    expect(config).toEqual(DEFAULT_CONFIG);
  });

  test("returns DEFAULT_CONFIG when no row has been stored yet", async () => {
    executeMock.mockResolvedValue({ rows: [] });

    const config = await readConfig();

    expect(config).toEqual(DEFAULT_CONFIG);
  });
});
