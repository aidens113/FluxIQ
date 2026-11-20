// @fluxiq-test-group real-sql
// The model-access ledger's store lives and ends with its instance (t928). In a v2 layout the store is a
// program-state document in the instance's `global.sqlite`, and a ledger that read it back as the instance was
// made left that read running past the instance's close: the handle was still open when a host removed the
// workspace (EBUSY on Windows), and its SQL ran after the close. Every SQLite handle is traced here, so the check
// holds on every platform.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sqlite3 from "sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FluxIQ } from "../../../../framework/index.ts";

type Handle = { file: string };

const Original = sqlite3.Database;
const open = new Map<object, Handle>();
const afterClose: string[] = [];
let closed = false;
const roots: string[] = [];

/** Records each connection while it is open, and every statement run once the instance has closed. */
class TracedDatabase extends Original {
  constructor(...args: ConstructorParameters<typeof Original>) {
    super(...args);
    open.set(this, { file: String(args[0]) });
  }

  override get(sql: string, ...rest: any[]): this {
    this.saw(sql, rest[0]);
    return super.get(sql, ...rest);
  }

  override all(sql: string, ...rest: any[]): this {
    this.saw(sql, rest[0]);
    return super.all(sql, ...rest);
  }

  override run(sql: string, ...rest: any[]): this {
    this.saw(sql, rest[0]);
    return super.run(sql, ...rest);
  }

  override exec(sql: string, callback?: (error: Error | null) => void): this {
    this.saw(sql);
    return super.exec(sql, callback);
  }

  override close(callback?: (error: Error | null) => void): void {
    open.delete(this);
    super.close(callback);
  }

  private saw(sql: string, params?: unknown): void {
    if (closed) afterClose.push(`${sql.replace(/\s+/g, " ").trim().slice(0, 120)}${Array.isArray(params) ? ` ${JSON.stringify(params)}` : ""}`);
  }
}

beforeEach(() => {
  open.clear();
  afterClose.length = 0;
  closed = false;
  (sqlite3 as { Database: typeof Original }).Database = TracedDatabase as unknown as typeof Original;
});
afterEach(async () => {
  (sqlite3 as { Database: typeof Original }).Database = Original;
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

/** A set-up v2 storage root, so the ledger's document lands in the instance's `global.sqlite` as a host's does. */
async function storageRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-model-access-store-"));
  roots.push(root);
  const bootstrap = FluxIQ.create({ rootDir: root, loadEnv: false, modelProvidersEnabled: false });
  try {
    await bootstrap.setup();
  } finally {
    await bootstrap.close();
  }
  return root;
}

/** The connections still open on a file under `root` (SQLite is handed Windows' `\\?\` path form). */
function handlesUnder(root: string): string[] {
  return [...open.values()].map((handle) => path.resolve(handle.file.replace(/^\\\\\?\\/, ""))).filter((file) => file.startsWith(root));
}

describe("the model-access ledger's store in an instance", () => {
  it("is left with no connection open when the instance closes, and nothing runs on it after", async () => {
    const root = await storageRoot();
    // Traced from here: only what this instance opens counts.
    open.clear();
    const fluxiq = FluxIQ.create({ rootDir: root, loadEnv: false, modelProvidersEnabled: false });
    expect(path.resolve(fluxiq.paths.data)).toBe(path.resolve(fluxiq.paths.fluxiq));
    await fluxiq.close();
    closed = true;
    const leftOpen = handlesUnder(root);

    // Whatever was left running is let finish, so what it ran after the close is seen too.
    await vi.waitFor(() => expect(handlesUnder(root)).toEqual([]), { timeout: 10_000, interval: 10 });
    expect(leftOpen).toEqual([]);
    expect(afterClose).toEqual([]);
  });

  it("finishes a store write already running when the instance closes, before its connections close", async () => {
    const root = await storageRoot();
    vi.stubEnv("FLUXIQ_SECRET_KEYS_KEYRING_FILE", "");
    // The provider cannot be reached, so the key is saved, its check's outcome is noted, and the ledger starts writing
    // it (a refused key is never stored at all, t950).
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    try {
      open.clear();
      const fluxiq = FluxIQ.create({ rootDir: root, loadEnv: false, modelProvidersEnabled: true });
      const login = await fluxiq.programs.identityAccess.authenticate({ username: "admin", password: "admin" });
      const actor = { sessionId: login.session.id, userId: login.user.id, roleId: login.role.id, permissions: [...login.role.permissions], channel: "panel" as const };
      const saved = await fluxiq.programs.api.call({ programId: "secret-keys", endpoint: "save-model-key", scope: {}, actor, payload: { provider: "anthropic", value: "dummy-close-value" } });
      expect(saved.ok).toBe(true);
      // Closed at once, while the ledger's write of the outcome is still running.
      await fluxiq.close();
      closed = true;
      expect(handlesUnder(root)).toEqual([]);
      expect(afterClose).toEqual([]);

      // The write landed before the close: a new instance reads the outcome with no new check.
      closed = false;
      const again = FluxIQ.create({ rootDir: root, loadEnv: false, modelProvidersEnabled: true });
      try {
        const relogin = await again.programs.identityAccess.authenticate({ username: "admin", password: "admin" });
        const snapshot = await again.programs.api.call<unknown, { modelAccess?: { status: string } }>({ programId: "secret-keys", endpoint: "snapshot", scope: {}, actor: { ...actor, sessionId: relogin.session.id }, payload: {} });
        expect(snapshot.ok && snapshot.payload?.modelAccess?.status).toBe("provider_unreachable");
      } finally {
        await again.close();
      }
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  }, 120_000);
});
