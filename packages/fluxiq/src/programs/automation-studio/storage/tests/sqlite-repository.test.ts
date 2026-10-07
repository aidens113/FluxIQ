import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type { AutomationStudioFlowArtifact } from "../../model/index.ts";
import { createCanonicalAutomationStudioSQLiteRepositories as factory } from "../sqlite-repository.ts";
import { canonicalFixture } from "../canonical-authority/tests/fixture.ts";
import { CanonicalAuthorityOwnerStore } from "../canonical-authority/index.ts";
import type { JsonObject } from "../../../../core/index.ts";
import { SQLiteRepository, createRecord } from "../../../database-manager/storage/sqlite-repository.ts";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() { const root = await mkdtemp(path.join(os.tmpdir(), "canonical-factory-")); roots.push(root); return root; }
function flow(): AutomationStudioFlowArtifact { return { flowId: "original-flow", projectId: "original-project", scope: { kind: "global" }, publication: { status: "draft" } } as AutomationStudioFlowArtifact; }
function options(root: string) { return { canonicalRouting: { projectRootDir: path.join(root, "projects"), projectDatabaseRootDir: root } }; }

it("keeps default legacy row identity and document unchanged", async () => {
  const root = await fixture(), repo = factory(root), original = flow();
  await repo.flows.put(original); expect(await repo.flows.get(original.flowId)).toEqual(original);
});
it("opted-in replacement never allocates absent or unbound legacy IDs", async () => {
  const root = await fixture(), original = flow(); await factory(root).flows.put(original);
  await expect(factory(root, options(root)).flows.put(original)).rejects.toThrow("unbound");
  await expect(factory(root, options(root)).flows.put({ ...original, flowId: "absent" })).rejects.toThrow("unbound");
  expect(await factory(root).flows.get(original.flowId)).toEqual(original);
});
it("checks persisted routing mode through an object opened before opt-in", async () => {
  const root = await fixture(), old = factory(root), original = flow(); await old.flows.put(original);
  await expect(factory(root, options(root)).flows.put(original)).rejects.toThrow();
  await expect(old.flows.put({ ...original, projectId: "foreign" })).rejects.toThrow("coordinator_required");
  expect(await old.flows.get(original.flowId)).toEqual(original);
});
it("actual factory mutates only original bound owner and keeps tombstone after delete", async () => {
  await canonicalFixture(async ({ root, create, coordinator, options }) => {
    const original = await create(); await coordinator.perform(original, original.document);
    const repo = factory(root, { canonicalRouting: options });
    const document = original.document as unknown as AutomationStudioFlowArtifact;
    const input = { ...document, name: "actual routed update" }, pending = repo.flows.put(input); input.name = "mutated after await boundary"; await pending;
    expect(await repo.flows.get(document.flowId)).toMatchObject({ projectId: "original-project", name: "actual routed update" });
    await expect(repo.flows.put({ ...document, projectId: "foreign-project" })).rejects.toThrow("foreign_owner");
    expect(await repo.flows.delete(document.flowId)).toBe(true);
    expect(await repo.flows.get(document.flowId)).toBeNull();
    await expect(repo.flows.put(document)).rejects.toThrow("tombstoned");
  });
});
it("rejects unknown/accessor/path options before any factory effect", async () => {
  const root = await fixture(); let read = false;
  expect(() => factory(root, { get canonicalRouting() { read = true; return options(root).canonicalRouting; } })).toThrow("accessor"); expect(read).toBe(false);
  expect(() => factory(root, { ...options(root), unknown: true } as never)).toThrow();
  expect(() => factory(root, { canonicalRouting: { projectRootDir: "relative", projectDatabaseRootDir: root } })).toThrow();
});
it("refuses original document getters before cloning or performing any opted-in effect", async () => {
  const root = await fixture(); let read = false;
  const original = { ...flow(), get projectId() { read = true; return "foreign-project"; } };
  await expect(factory(root, options(root)).flows.put(original)).rejects.toThrow("accessor"); expect(read).toBe(false);
});
it("retains the exact delete domain constraint when another writer changes scope before effect", async () => {
  await canonicalFixture(async ({ root, create, coordinator, options }) => {
    const original = await create(); await coordinator.perform(original, original.document);
    const repo = factory(root, { canonicalRouting: options }), document = original.document as unknown as AutomationStudioFlowArtifact;
    await repo.flows.put({ ...document, scope: { kind: "domain", domainId: "original-domain" } });
    const actualEffect = CanonicalAuthorityOwnerStore.prototype.effect;
    const race = vi.spyOn(CanonicalAuthorityOwnerStore.prototype, "effect").mockImplementationOnce(async function (this: CanonicalAuthorityOwnerStore, capability, payload) {
      // Isolated old/unjoined writer changes actual canonical state in the deletion window.
      await new SQLiteRepository({ rootDir: root, kind: "automation.flows", layoutVersion: 2 }).put(createRecord({ id: document.flowId, kind: "automation.flows", data: { document: { ...document, scope: { kind: "domain", domainId: "foreign-domain" } }, domainId: "foreign-domain" } as unknown as JsonObject }));
      return actualEffect.call(this, capability, payload);
    });
    try {
      await expect(repo.flows.delete(document.flowId, "original-domain")).rejects.toThrow("domain_scope");
      expect(await repo.flows.get(document.flowId)).toMatchObject({ scope: { domainId: "foreign-domain" } });
    } finally { race.mockRestore(); }
  });
});
