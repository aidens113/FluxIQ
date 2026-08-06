import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AutomationStudioObjectStore } from "./object-store.ts";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("AutomationStudioObjectStore", () => {
  it("writes immutable digest-addressed JSON and verifies it on read", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-object-store-"));
    roots.push(root);
    const store = new AutomationStudioObjectStore(root);
    const first = await store.putJson("project.1", { payload: "value" });
    const second = await store.putJson("project.1", { payload: "value" });

    expect(second).toEqual(first);
    expect(await store.readJson(first)).toEqual({ payload: "value" });
    const raw = await readFile(path.join(root, first.$fluxiqObject.relativePath), "utf8");
    expect(JSON.parse(raw)).toEqual({ payload: "value" });
  });
});
