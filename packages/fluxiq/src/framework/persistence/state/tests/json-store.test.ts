import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProgramJsonStore } from "../index.ts";

const failures = vi.hoisted(() => ({ write: undefined as Error | undefined, restore: undefined as Error | undefined }));

vi.mock("node:fs/promises", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    writeFile: (...args: Parameters<typeof actual.writeFile>) => failures.write && String(args[0]).endsWith(".tmp")
      ? Promise.reject(failures.write)
      : actual.writeFile(...args),
    rename: (...args: Parameters<typeof actual.rename>) => failures.restore && String(args[0]).includes(".corrupt.")
      ? Promise.reject(failures.restore)
      : actual.rename(...args)
  };
});

const roots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-storage-errors-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  failures.write = undefined;
  failures.restore = undefined;
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe("framework JSON store failure ownership", () => {
  it("refuses a malformed owning config without reading or overwriting a stale file", async () => {
    const root = await temporaryRoot();
    const file = path.join(root, "programs", "fixture", "state.json");
    await mkdir(path.dirname(file), { recursive: true });
    const original = `${JSON.stringify({ version: 1, data: { stale: true } })}\n`;
    await writeFile(file, original);
    await writeFile(path.join(root, "config.json"), "{malformed");
    const store = new ProgramJsonStore(file, () => ({ stale: false }));
    await expect(store.read()).rejects.toBeInstanceOf(SyntaxError);
    await expect(store.write({ stale: false })).rejects.toBeInstanceOf(SyntaxError);
    expect(await readFile(file, "utf8")).toBe(original);
    await expect(readFile(path.join(root, "global.sqlite"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("retains the identical write error after successful real backup restoration", async () => {
    const root = await temporaryRoot();
    const file = path.join(root, "state.json");
    await writeFile(file, "{broken");
    const primary = new Error("replacement write failed");
    failures.write = primary;
    await expect(new ProgramJsonStore(file, () => ({ recovered: true })).recoverMalformedState(100)).rejects.toBe(primary);
    expect(await readFile(file, "utf8")).toBe("{broken");
    expect((await readdir(root)).filter(name => name.includes(".corrupt."))).toEqual([]);
  });

  it("exposes original write and restoration failures while retaining the actual archived file", async () => {
    const root = await temporaryRoot();
    const file = path.join(root, "state.json");
    await writeFile(file, "{broken");
    const primary = new Error("replacement write failed");
    const cleanup = new Error("backup restoration failed");
    failures.write = primary;
    failures.restore = cleanup;
    const outcome = await new ProgramJsonStore(file, () => ({ recovered: true })).recoverMalformedState(100).then(
      () => undefined,
      error => error
    );
    expect(outcome).toBeInstanceOf(AggregateError);
    expect(outcome.errors).toEqual([primary, cleanup]);
    expect(outcome.errors[0]).toBe(primary);
    expect(outcome.errors[1]).toBe(cleanup);
    expect(outcome.cause).toBe(primary);
    const backups = (await readdir(root)).filter(name => name.includes(".corrupt.100."));
    expect(backups).toHaveLength(1);
    expect(await readFile(path.join(root, backups[0]!), "utf8")).toBe("{broken");
    await expect(readFile(file)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("restores the actual archive when the empty factory throws and returns that identical error", async () => {
    const root = await temporaryRoot();
    const file = path.join(root, "state.json");
    await writeFile(file, "{broken");
    const primary = new Error("empty factory failed");
    let calls = 0;
    const store = new ProgramJsonStore(file, () => {
      calls += 1;
      throw primary;
    });
    await expect(store.recoverMalformedState(100)).rejects.toBe(primary);
    expect(calls).toBe(1);
    expect(await readFile(file, "utf8")).toBe("{broken");
    expect((await readdir(root)).filter(name => name.includes(".corrupt."))).toEqual([]);
  });

  it("retains the empty factory and restoration errors with the original archived bytes", async () => {
    const root = await temporaryRoot();
    const file = path.join(root, "state.json");
    await writeFile(file, "{broken");
    const primary = new Error("empty factory failed");
    const cleanup = new Error("backup restoration failed");
    failures.restore = cleanup;
    const outcome = await new ProgramJsonStore(file, () => { throw primary; }).recoverMalformedState(100).then(
      () => undefined,
      error => error
    );
    expect(outcome).toBeInstanceOf(AggregateError);
    expect(outcome.errors[0]).toBe(primary);
    expect(outcome.errors[1]).toBe(cleanup);
    expect(outcome.cause).toBe(primary);
    const backups = (await readdir(root)).filter(name => name.includes(".corrupt.100."));
    expect(backups).toHaveLength(1);
    expect(await readFile(path.join(root, backups[0]!), "utf8")).toBe("{broken");
    await expect(readFile(file)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
