// A pool keeps one connection per database file only inside a unit of work
// (t435), and never leaves a handle that blocks removing the file afterwards.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SQLiteConnectionPool } from "../connection-pool.ts";
import { SQLiteRepository, createRecord } from "../sqlite-repository.ts";

async function withRoot(operation: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-connection-pool-"));
  try {
    await operation(root);
  } finally {
    // No retries: a handle still open would make this fail on Windows.
    await rm(root, { recursive: true, force: true });
  }
}

/** Counts the connections a repository's pool opens, by watching sqlite3's constructor through the repository's own path. */
function counted(pool: SQLiteConnectionPool): { opens: () => number } {
  let opens = 0;
  const use = pool.use.bind(pool);
  const open = (connector: Parameters<typeof use>[1]) => async () => {
    opens += 1;
    return await connector.open();
  };
  pool.use = (filePath, connector, operation) => use(filePath, { ...connector, open: open(connector) }, operation);
  return { opens: () => opens };
}

describe("SQLiteConnectionPool", () => {
  it("outside a unit of work opens and closes a connection per operation, so the file can be removed at once", async () => withRoot(async (root) => {
    const pool = new SQLiteConnectionPool();
    const watch = counted(pool);
    const repository = new SQLiteRepository({ rootDir: root, kind: "automation.state", layoutVersion: 2, connections: pool });
    await repository.put(createRecord({ id: "a", kind: repository.kind, data: { value: 1 } }));
    await expect(repository.get("a")).resolves.toMatchObject({ data: { value: 1 } });
    expect(watch.opens()).toBe(2);
    await rm(path.join(root, "global.sqlite"));
  }));

  it("inside a unit of work reuses one connection across operations and tables, and closes it when the work ends", async () => withRoot(async (root) => {
    const pool = new SQLiteConnectionPool();
    const watch = counted(pool);
    const state = new SQLiteRepository({ rootDir: root, kind: "automation.state", layoutVersion: 2, connections: pool });
    const program = new SQLiteRepository({ rootDir: root, kind: "program.state", layoutVersion: 2, connections: pool });
    await pool.keepWhile(async () => {
      await state.put(createRecord({ id: "a", kind: state.kind, data: { value: 1 } }));
      await program.put(createRecord({ id: "b", kind: program.kind, data: { value: 2 } }));
      await state.transaction({}, async (transaction) => { await transaction.run(`update "automation.state" set data = ? where id = ?`, [JSON.stringify({ value: 3 }), "a"]); });
      await expect(state.get("a")).resolves.toMatchObject({ data: { value: 3 } });
      await expect(program.get("b")).resolves.toMatchObject({ data: { value: 2 } });
    });
    expect(watch.opens()).toBe(1);
    // Closed when the work ended: the file is removable straight away.
    await rm(path.join(root, "global.sqlite"));
  }));

  it("closes a connection whose operation failed, and opens a fresh one for the next", async () => withRoot(async (root) => {
    const pool = new SQLiteConnectionPool();
    const watch = counted(pool);
    const repository = new SQLiteRepository({ rootDir: root, kind: "automation.state", layoutVersion: 2, connections: pool });
    await pool.keepWhile(async () => {
      await repository.put(createRecord({ id: "a", kind: repository.kind, data: { value: 1 } }));
      await expect(repository.transaction({}, async (transaction) => { await transaction.run("select * from no_such_table"); })).rejects.toThrow("no_such_table");
      await expect(repository.get("a")).resolves.toMatchObject({ data: { value: 1 } });
    });
    expect(watch.opens()).toBe(2);
  }));

  it("closeAll closes what a unit of work still keeps, so its owner can remove the file", async () => withRoot(async (root) => {
    const pool = new SQLiteConnectionPool();
    const repository = new SQLiteRepository({ rootDir: root, kind: "automation.state", layoutVersion: 2, connections: pool });
    let release!: () => void;
    let wrote!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const written = new Promise<void>((resolve) => { wrote = resolve; });
    const work = pool.keepWhile(async () => {
      await repository.put(createRecord({ id: "a", kind: repository.kind, data: { value: 1 } }));
      wrote();
      await held;
    });
    await written;
    await pool.closeAll();
    await rm(path.join(root, "global.sqlite"), { force: true });
    release();
    await work;
  }));
});
