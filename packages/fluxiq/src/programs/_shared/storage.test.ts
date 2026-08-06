import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initializeFluxIQStorage } from "../../framework/storage-layout.ts";
import { ProgramJsonStore, ProgramStateReadError } from "./storage.ts";

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

    await expect(
      ProgramJsonStore.transaction(firstPath, async (transaction) => {
        await transaction.write(firstPath, { name: "one" });
        await transaction.write(secondPath, { layout: "wide" });
        throw new Error("injected failure");
      }),
    ).rejects.toThrow("injected failure");

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

describe("ProgramJsonStore malformed legacy state", () => {
  it("distinguishes missing files from corrupt state and preserves a recovery backup", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-program-json-recovery-"));
    roots.push(root);
    const filePath = path.join(root, "programs", "state.json");
    const store = new ProgramJsonStore(filePath, () => ({ items: [] }));

    await expect(store.read()).resolves.toEqual({ items: [] });
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, "{not-json", "utf8");

    await expect(store.read()).rejects.toMatchObject({
      name: "ProgramStateReadError",
      code: "program_state.invalid",
      filePath,
      fileRecoveryAvailable: true,
    } satisfies Partial<ProgramStateReadError>);

    const recovered = await store.recoverMalformedState(1_000);
    expect(await readFile(recovered.backupPath, "utf8")).toBe("{not-json");
    await expect(store.read()).resolves.toEqual({ items: [] });
    expect(JSON.parse(await readFile(filePath, "utf8"))).toEqual({ version: 1, data: { items: [] } });
  });

  it("rejects structurally invalid envelopes instead of silently resetting them", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-program-json-envelope-"));
    roots.push(root);
    const filePath = path.join(root, "state.json");
    await writeFile(filePath, JSON.stringify({ version: 1, data: [] }), "utf8");

    await expect(new ProgramJsonStore(filePath, () => ({ items: [] })).read()).rejects.toBeInstanceOf(ProgramStateReadError);
  });
});
