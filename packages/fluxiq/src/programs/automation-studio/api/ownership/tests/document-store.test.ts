// @fluxiq-test-group real-sql
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initializeFluxIQStorage } from "../../../../../framework/index.ts";
import { AutomationStudioProjectOwnerDocumentStore } from "../document-store.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function tempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  roots.push(root);
  return root;
}

async function addConcurrently(store: AutomationStudioProjectOwnerDocumentStore, count: number): Promise<void> {
  await Promise.all(Array.from({ length: count }, (_, index) => store.change((records) => {
    records[`p${index}`] = { userId: `u${index}`, source: "creator", recordedAt: index };
  })));
}

describe("AutomationStudioProjectOwnerDocumentStore as a JSON file", () => {
  it("persists records across a re-created store", async () => {
    const filePath = path.join(await tempRoot("fluxiq-project-owners-file-"), "automation-studio", "ownership", "projects.json");
    const first = new AutomationStudioProjectOwnerDocumentStore(filePath);
    expect(first.filePath).toBe(path.resolve(filePath));
    expect(await first.read()).toEqual({});
    const answered = await first.change((records) => {
      records.p1 = { userId: "u1", source: "creator", recordedAt: 10 };
      return "done";
    });
    expect(answered).toBe("done");
    const second = new AutomationStudioProjectOwnerDocumentStore(filePath);
    expect(await second.read()).toEqual({ p1: { userId: "u1", source: "creator", recordedAt: 10 } });
    const envelope = JSON.parse(await readFile(filePath, "utf8")) as unknown;
    expect(envelope).toEqual({ version: 1, data: { projects: { p1: { userId: "u1", source: "creator", recordedAt: 10 } } } });
  });

  it("loses no change made concurrently", async () => {
    const filePath = path.join(await tempRoot("fluxiq-project-owners-race-"), "projects.json");
    await addConcurrently(new AutomationStudioProjectOwnerDocumentStore(filePath), 20);
    expect(Object.keys(await new AutomationStudioProjectOwnerDocumentStore(filePath).read())).toHaveLength(20);
  });

  it("writes nothing when the change throws", async () => {
    const filePath = path.join(await tempRoot("fluxiq-project-owners-throw-"), "projects.json");
    const store = new AutomationStudioProjectOwnerDocumentStore(filePath);
    await store.change((records) => {
      records.kept = { userId: "u", source: "default", recordedAt: 1 };
    });
    await expect(store.change((records) => {
      records.dropped = { userId: "v", source: "default", recordedAt: 2 };
      throw new Error("refused");
    })).rejects.toThrow("refused");
    expect(Object.keys(await store.read())).toEqual(["kept"]);
  });

  it("refuses a malformed document instead of reading it as empty", async () => {
    const dir = await tempRoot("fluxiq-project-owners-bad-");
    const filePath = path.join(dir, "projects.json");
    await writeFile(filePath, JSON.stringify({ version: 1, data: { projects: { p1: { userId: "", source: "creator", recordedAt: 1 } } } }));
    const store = new AutomationStudioProjectOwnerDocumentStore(filePath);
    await expect(store.read()).rejects.toThrow("the record of p1 has no user id");
    await expect(store.change(() => undefined)).rejects.toThrow("malformed");
    await writeFile(filePath, JSON.stringify({ version: 1, data: { projects: { p1: { userId: "u", source: "guess", recordedAt: 1 } } } }));
    await expect(store.read()).rejects.toThrow("unknown source");
  });
});

describe("AutomationStudioProjectOwnerDocumentStore under storage layout v2", () => {
  it("keeps the records as a SQLite row, across a re-created store, with no JSON file written", async () => {
    const fluxiqRoot = path.join(await tempRoot("fluxiq-project-owners-v2-"), ".fluxiq");
    await mkdir(fluxiqRoot, { recursive: true });
    await initializeFluxIQStorage(fluxiqRoot);
    const filePath = path.join(fluxiqRoot, "artifacts", "automation-studio", "ownership", "projects.json");
    await addConcurrently(new AutomationStudioProjectOwnerDocumentStore(filePath), 12);
    const reread = await new AutomationStudioProjectOwnerDocumentStore(filePath).read();
    expect(Object.keys(reread)).toHaveLength(12);
    expect(reread.p3).toEqual({ userId: "u3", source: "creator", recordedAt: 3 });
    await expect(readFile(filePath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });
});
