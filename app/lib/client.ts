import { createClient, type Client } from "@libsql/client";

/**
 * One Turso/libSQL client for the whole app. `file:` URLs work for local
 * dev (TURSO_AUTH_TOKEN stays empty); a real deployment points at a Turso
 * database with its auth token.
 */
let cached: Client | null = null;

export function client(): Client {
  if (!cached) {
    cached = createClient({
      url: process.env.TURSO_DATABASE_URL ?? "file:local.db",
      authToken: process.env.TURSO_AUTH_TOKEN || undefined,
    });
  }
  return cached;
}
