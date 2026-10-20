// The durable state a domain keeps per build or per Flow, on disk under the
// Flow and in memory without a root (t728).

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AutomationStudioProjectPaths } from "../../service/paths/index.ts";
import { AutomationStudioDomainBuildStateStore } from "../store.ts";

const refusedWith = (code: string) => expect.objectContaining({ name: "AutomationStudioDomainBuildStateRefusal", code });
const build = { projectId: "project.1", flowId: "flow.1", buildId: "build.1" };
const flow = { projectId: "project.1", flowId: "flow.1" };

function storeAt(root: string | undefined): AutomationStudioDomainBuildStateStore {
  const projects = new AutomationStudioProjectPaths(root ? path.join(root, "programs", "automation-studio", "projects") : undefined);
  return new AutomationStudioDomainBuildStateStore(() => projects);
}

async function withRoot(sqlite: boolean, run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-domain-build-state-"));
  try {
    if (sqlite) await writeFile(path.join(root, "config.json"), JSON.stringify({ layoutVersion: 2 }));
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  }
}

describe.each([false, true])("the domain build state on disk (SQLite=%s)", (sqlite) => {
  it("is read back by a fresh store: a restarted host remembers", async () => {
    await withRoot(sqlite, async (root) => {
      await storeAt(root).put("warehouse", build, "arrived", true);
      await storeAt(root).put("warehouse", flow, "cleared", ["ref.1", "ref.2"]);
      const fresh = storeAt(root);
      expect(await fresh.get("warehouse", build, "arrived")).toBe(true);
      expect(await fresh.get("warehouse", flow, "cleared")).toEqual(["ref.1", "ref.2"]);
      // Another build, another domain and another Flow see none of it.
      expect(await fresh.get("warehouse", { ...build, buildId: "build.2" }, "arrived")).toBeUndefined();
      expect(await fresh.get("ledger", build, "arrived")).toBeUndefined();
      expect(await fresh.get("warehouse", { ...build, flowId: "flow.2" }, "arrived")).toBeUndefined();
      expect(await fresh.drop("warehouse", build, "arrived")).toBe(true);
      expect(await storeAt(root).get("warehouse", build, "arrived")).toBeUndefined();
    });
  });

  it("keeps every one of many concurrent writes to one file", async () => {
    await withRoot(sqlite, async (root) => {
      const store = storeAt(root);
      await Promise.all(Array.from({ length: 12 }, (_, index) => store.put("warehouse", build, `k${index}`, index)));
      const values = await Promise.all(Array.from({ length: 12 }, (_, index) => storeAt(root).get("warehouse", build, `k${index}`)));
      expect(values).toEqual(Array.from({ length: 12 }, (_, index) => index));
    });
  });
});

describe("the domain build state", () => {
  it("lives under the Flow's own directory, one file per domain", async () => {
    await withRoot(false, async (root) => {
      await storeAt(root).put("warehouse", flow, "k", 1);
      const file = path.join(root, "programs", "automation-studio", "projects", "project.1", "flows", "flow.1", "domain-build-state", "warehouse.json");
      expect(JSON.parse(await readFile(file, "utf8")).data).toMatchObject({ schemaVersion: 1, domainId: "warehouse", flow: { values: { k: 1 } } });
    });
  });

  it("refuses a domain whose file name it would share with another, on disk and in memory alike", async () => {
    await withRoot(false, async (root) => {
      await storeAt(root).put("warehouse", flow, "k", 1);
      await expect(storeAt(root).put("Warehouse", flow, "k", 2)).rejects.toThrow(refusedWith("domain_build_state.domain_mismatch"));
    });
    const memory = storeAt(undefined);
    await memory.put("warehouse", flow, "k", 1);
    await expect(memory.get("Warehouse", flow, "k")).rejects.toThrow(refusedWith("domain_build_state.domain_mismatch"));
  });

  it("keeps a service with no root in memory, and a refused write leaves what was there", async () => {
    const store = storeAt(undefined);
    await store.put("warehouse", build, "k", { a: 1 });
    await expect(store.put("warehouse", build, "k", Number.NaN)).rejects.toThrow(refusedWith("domain_build_state.value_invalid"));
    expect(await store.get("warehouse", build, "k")).toEqual({ a: 1 });
    expect(await storeAt(undefined).get("warehouse", build, "k")).toBeUndefined();
  });

  it("refuses an id or a key outside its bound, never naming the value", async () => {
    const store = storeAt(undefined);
    await expect(store.put("warehouse", { ...build, projectId: "../up" }, "k", 1)).rejects.toThrow(refusedWith("domain_build_state.scope_invalid"));
    await expect(store.put("warehouse", { ...build, buildId: "" }, "k", 1)).rejects.toThrow(refusedWith("domain_build_state.scope_invalid"));
    await expect(store.put("ware house", build, "k", 1)).rejects.toThrow(refusedWith("domain_build_state.scope_invalid"));
    await expect(store.put("warehouse", build, "has space", 1)).rejects.toThrow(refusedWith("domain_build_state.key_invalid"));
    const refused = await store.put("warehouse", build, "k", "s".repeat(70_000)).then(() => undefined, (error: unknown) => error);
    expect(refused).toEqual(refusedWith("domain_build_state.value_too_large"));
    expect(String((refused as Error).message)).not.toContain("sss");
  });
});
