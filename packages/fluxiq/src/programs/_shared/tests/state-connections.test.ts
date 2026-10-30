// @fluxiq-test-group real-sql
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import sqlite3 from "sqlite3";
import type { SQLiteConnector } from "../../database-manager/storage/connection-pool.ts";
import { programStateConnections } from "../state-connections.ts";

const temp: string[] = [];
const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => programStateConnections.close(dir)));
  await Promise.all(temp.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function storageRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-state-connections-"));
  temp.push(root);
  dirs.push(root);
  await writeFile(path.join(root, "config.json"), JSON.stringify({ layoutVersion: 2 }));
  await mkdir(path.join(root, "programs", "deep"), { recursive: true });
  return root;
}

/** A connector on `file` that counts how many of its connections were opened and closed. */
function counting(file: string) {
  const state = { opened: 0, closed: 0 };
  const connector: SQLiteConnector = {
    key: "test",
    open: () => new Promise((resolve, reject) => {
      const db: sqlite3.Database = new sqlite3.Database(file, (error) => error ? reject(error) : resolve(db));
      state.opened += 1;
    }),
    prepare: async () => undefined,
    close: (db) => new Promise((resolve, reject) => db.close((error) => {
      state.closed += 1;
      if (error) reject(error);
      else resolve();
    }))
  };
  return { state, connector };
}

describe("programStateConnections", () => {
  it("resolves a subdirectory to the pool of its storage root", async () => {
    const root = await storageRoot();
    expect(programStateConnections.forRoot(path.join(root, "programs", "deep"))).toBe(programStateConnections.forRoot(root));
    expect(programStateConnections.roots().filter((known) => known === root)).toEqual([root]);
  });

  it("closing one storage root leaves another root's kept connection and run alone", async () => {
    const a = await storageRoot(), b = await storageRoot();
    const fileA = path.join(a, "a.sqlite"), fileB = path.join(b, "b.sqlite");
    const countA = counting(fileA), countB = counting(fileB);
    const poolA = programStateConnections.forRoot(a), poolB = programStateConnections.forRoot(b);
    expect(poolA).not.toBe(poolB);
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const run = poolA.keepWhile(async () => {
      await poolA.use(fileA, countA.connector, async () => undefined);
      await poolB.use(fileB, countB.connector, async () => undefined); // not inside B's keepWhile, so not kept
      expect(countA.state).toEqual({ opened: 1, closed: 0 });
      expect(countB.state).toEqual({ opened: 1, closed: 1 });
      await programStateConnections.close(b);
      expect(countA.state).toEqual({ opened: 1, closed: 0 });
      await held;
      await poolA.use(fileA, countA.connector, async () => undefined);
      expect(countA.state.opened).toBe(1); // the kept connection served the later operation
      return "done";
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    release();
    expect(await run).toBe("done");
    expect(countA.state).toEqual({ opened: 1, closed: 1 }); // closed when A's last keepWhile ended
    expect(programStateConnections.roots()).not.toContain(b);
    expect(programStateConnections.roots()).toContain(a);
  });

  it("close closes the root's kept connections and forgets its pool", async () => {
    const a = await storageRoot();
    const file = path.join(a, "a.sqlite");
    const count = counting(file);
    const pool = programStateConnections.forRoot(a);
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const run = pool.keepWhile(async () => {
      await pool.use(file, count.connector, async () => undefined);
      await held;
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(count.state).toEqual({ opened: 1, closed: 0 });
    await programStateConnections.close(path.join(a, "programs"));
    expect(count.state).toEqual({ opened: 1, closed: 1 });
    expect(programStateConnections.roots()).not.toContain(a);
    await programStateConnections.close(a); // a no-op when none
    release();
    await run;
    expect(programStateConnections.forRoot(a)).not.toBe(pool);
  });
});
