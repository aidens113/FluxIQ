import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initializeFluxIQStorage } from "../../framework/storage-layout.ts";
import { ProgramJsonStore } from "./storage.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("ProgramJsonStore layout-v2 transactions", () => {
  it("rolls back a multi-document Automation Studio mutation", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-program-store-"));
    roots.push(root);
    const fluxiqRoot = path.join(root, ".fluxiq");
    await initializeFluxIQStorage(fluxiqRoot);
    const firstPath = path.join(fluxiqRoot, "artifacts", "automation-studio", "projects", "one", "manifest.json");
    const secondPath = path.join(fluxiqRoot, "artifacts", "automation-studio", "projects", "one", "workspace", "preferences.json");

    await expect(ProgramJsonStore.transaction(firstPath, async (transaction) => {
      await transaction.write(firstPath, { name: "one" });
      await transaction.write(secondPath, { layout: "wide" });
      throw new Error("injected failure");
    })).rejects.toThrow("injected failure");

    expect(await new ProgramJsonStore(firstPath, () => ({})).read()).toEqual({});
    expect(await new ProgramJsonStore(secondPath, () => ({})).read()).toEqual({});

    await ProgramJsonStore.transaction(firstPath, async (transaction) => {
      await transaction.write(firstPath, { name: "one" });
      await transaction.write(secondPath, { layout: "wide" });
    });
    expect(await new ProgramJsonStore(firstPath, () => ({})).read()).toEqual({ name: "one" });
    expect(await new ProgramJsonStore(secondPath, () => ({})).read()).toEqual({ layout: "wide" });
  });
});
