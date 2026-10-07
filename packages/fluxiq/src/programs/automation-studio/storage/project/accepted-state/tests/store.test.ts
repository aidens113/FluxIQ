import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { AutomationStudioProjectAcceptedStateStore as Store } from "../index.ts";
import { AutomationStudioProjectDatabasePool } from "../../database.ts";
import { AutomationStudioProjectFlowResourceRepository } from "../../flow-resource-repository.ts";
import { AutomationStudioProjectGraphRepository } from "../../graph-store.ts";
import { AutomationStudioCandidateVerificationStore } from "../../candidate-verification/index.ts";
import { snapshot } from "./fixtures.ts";

async function removeOwnedFixture(root: string): Promise<void> {
  const resolved = path.resolve(root), temporaryRoot = path.resolve(os.tmpdir());
  if (path.dirname(resolved) !== temporaryRoot || !/^staged-(?:authority|existing)-/.test(path.basename(resolved))) throw new Error("Refusing cleanup outside owned staged fixture");
  await rm(resolved, { recursive: true, force: true });
}
async function fixture(operation: (store: Store, pool: AutomationStudioProjectDatabasePool, root: string) => Promise<void>) {
  const root = await mkdtemp(path.join(os.tmpdir(), "staged-authority-")), pool = new AutomationStudioProjectDatabasePool({ rootDir: root });
  const store = await Store.open({ pool, projectId: "project.1" });
  try { await operation(store, pool, root); } finally { await store.close(); await pool.closeAll(); await removeOwnedFixture(root); }
}
describe("real SQLite staged project foundation", () => {
  it("opens missing without adopting and stores all >100-member source/vector data across reopen", async () => fixture(async (store, pool, root) => {
    expect(await store.readCurrent()).toBeNull(); const input = snapshot(105);
    const result = await store.stageInitial({ mutationId: "initial.1", snapshot: input });
    expect(result).toMatchObject({ replayed: false, productionAuthority: "unsupported", recordedBinding: { generation: 1, state: "staged" } });
    input.instructions[104]!.artifact.body = "Caller changed";
    const secondPool = new AutomationStudioProjectDatabasePool({ rootDir: root }), reopened = await Store.open({ pool: secondPool, projectId: "project.1" });
    try {
      const current = await reopened.readCurrent(); expect(current?.snapshot).toEqual(snapshot(105)); expect(current?.binding).toEqual(result.recordedBinding);
      expect(current?.vector.filter(entry => entry.kind === "instruction")).toHaveLength(105);
      expect(current?.vector.every(entry => entry.generation === 1 && entry.epoch === result.recordedBinding.epoch)).toBe(true);
      const lease = await pool.acquire("project.1");
      try { expect(await lease.database.get("select count(*) as n from flows")).toEqual({ n: 0 }); expect(await lease.database.get("select count(*) as n from change_feed")).toEqual({ n: 0 }); } finally { await lease.release(); }
    } finally { await reopened.close(); await secondPool.closeAll(); }
  }));
  it("serializes separate-owner initial and replacement CAS without orphan snapshots", async () => fixture(async (store, pool, root) => {
    const secondPool = new AutomationStudioProjectDatabasePool({ rootDir: root }), other = await Store.open({ pool: secondPool, projectId: "project.1" });
    try {
      const initial = await Promise.allSettled([store.stageInitial({ mutationId: "initial.a", snapshot: snapshot() }), other.stageInitial({ mutationId: "initial.b", snapshot: snapshot() })]);
      expect(initial.filter(result => result.status === "fulfilled")).toHaveLength(1);
      expect(initial.filter(result => result.status === "rejected")).toHaveLength(1);
      const first = (await store.readCurrent())!.binding;
      const update = await Promise.allSettled([store.replaceStaged({ mutationId: "replace.a", expectedBinding: first, snapshot: snapshot(2) }), other.replaceStaged({ mutationId: "replace.b", expectedBinding: first, snapshot: snapshot(3) })]);
      expect(update.filter(result => result.status === "fulfilled")).toHaveLength(1);
      const current = await store.readCurrent(); expect(current?.binding.generation).toBe(2); expect(current?.binding.epoch).toBe(first.epoch);
      const lease = await pool.acquire("project.1");
      try { expect(await lease.database.get("select count(*) as n from accepted_project_snapshots")).toEqual({ n: 2 }); } finally { await lease.release(); }
    } finally { await other.close(); await secondPool.closeAll(); }
  }));
  it("replays exact recorded binding after head advances; rejects changed request and stale CAS", async () => fixture(async store => {
    const first = await store.stageInitial({ mutationId: "initial.1", snapshot: snapshot() });
    const next = await store.replaceStaged({ mutationId: "replace.1", expectedBinding: first.recordedBinding, snapshot: snapshot(2) });
    const replay = await store.stageInitial({ mutationId: "initial.1", snapshot: snapshot() });
    expect(replay.replayed).toBe(true); expect(replay.recordedBinding).toEqual(first.recordedBinding); expect((await store.readCurrent())?.binding).toEqual(next.recordedBinding);
    await expect(store.stageInitial({ mutationId: "initial.1", snapshot: snapshot(3) })).rejects.toThrow("different request digest");
    const staleRequest = { kind: "replace" as const, expectedBinding: first.recordedBinding, snapshot: snapshot(3) };
    await expect(store.replaceStaged({ mutationId: "stale.1", ...staleRequest })).rejects.toThrow("cas_conflict");
    expect(await store.reconcile({ mutationId: "stale.1", requestDigest: store.requestDigest(staleRequest) })).toEqual({ status: "failed" });
    await expect(store.reconcile({ mutationId: "initial.1", requestDigest: store.requestDigest({ kind: "initial", snapshot: snapshot(2) }) })).rejects.toThrow("mutation_conflict");
  }));
  it("tombstones as a new generation without history deletion, restoration or legacy fallback", async () => fixture(async (store, pool) => {
    const first = await store.stageInitial({ mutationId: "initial.1", snapshot: snapshot() });
    const removed = await store.tombstoneStaged({ mutationId: "tombstone.1", expectedBinding: first.recordedBinding, reasonCode: "fixture.retired" });
    const current = await store.readCurrent(); expect(current).toMatchObject({ snapshot: null, vector: [], productionAuthority: "unsupported", binding: { generation: 2, state: "tombstoned" }, tombstone: { previousBinding: first.recordedBinding } });
    expect(removed.recordedBinding.epoch).toBe(first.recordedBinding.epoch);
    await expect(store.stageInitial({ mutationId: "restore.1", snapshot: snapshot() })).rejects.toThrow("cas_conflict");
    await expect(store.replaceStaged({ mutationId: "restore.2", expectedBinding: removed.recordedBinding, snapshot: snapshot() })).rejects.toThrow("tombstoned");
    const lease = await pool.acquire("project.1"); try { expect(await lease.database.get("select count(*) as n from accepted_project_snapshots")).toEqual({ n: 2 }); } finally { await lease.release(); }
  }));
  it.each(["digest", "epoch", "project", "state"])("refuses changed binding %s without staging another snapshot", async field => fixture(async (store, pool) => {
    const first = await store.stageInitial({ mutationId: "initial.1", snapshot: snapshot() });
    const expectedBinding = structuredClone(first.recordedBinding);
    if (field === "digest") expectedBinding.digest = `sha256:${"b".repeat(64)}`;
    if (field === "epoch") expectedBinding.epoch = "epoch.other";
    if (field === "project") expectedBinding.projectId = "project.other";
    if (field === "state") expectedBinding.state = "tombstoned";
    await expect(store.replaceStaged({ mutationId: `changed.${field}`, expectedBinding, snapshot: snapshot(2) })).rejects.toThrow();
    expect((await store.readCurrent())?.binding).toEqual(first.recordedBinding);
    const lease = await pool.acquire("project.1"); try { expect(await lease.database.get("select count(*) as n from accepted_project_snapshots")).toEqual({ n: 1 }); } finally { await lease.release(); }
  }));
  it.each(["owner_kind", "owner_id", "operation_kind"])("refuses borrowed or corrupt mutation %s even with an otherwise valid digest/result/snapshot", async field => fixture(async (store, pool) => {
    const first = await store.stageInitial({ mutationId: "initial.1", snapshot: snapshot() });
    const lease = await pool.acquire("project.1");
    try {
      const foreign = field === "owner_kind" ? "legacy_flow" : field === "owner_id" ? "project.other" : "legacy_flow.save";
      await lease.database.run(`update mutation_records set ${field}=? where mutation_id='initial.1'`, [foreign]);
      await expect(store.stageInitial({ mutationId: "initial.1", snapshot: snapshot() })).rejects.toThrow("mutation_scope_invalid");
      await expect(store.reconcile({ mutationId: "initial.1", requestDigest: first.requestDigest })).rejects.toThrow("mutation_conflict");
      expect((await store.readCurrent())?.binding).toEqual(first.recordedBinding);
    } finally { await lease.release(); }
  }));
  it("refuses a borrowed newer snapshot receipt and an incompatible staged operation in the durable result join", async () => fixture(async (store, pool) => {
    const first = await store.stageInitial({ mutationId: "initial.1", snapshot: snapshot() });
    const second = await store.replaceStaged({ mutationId: "replace.1", expectedBinding: first.recordedBinding, snapshot: snapshot(2) });
    const lease = await pool.acquire("project.1");
    try {
      await lease.database.run("update mutation_records set response_json=? where mutation_id='initial.1'", [JSON.stringify({ ...first, recordedBinding: second.recordedBinding })]);
      await expect(store.stageInitial({ mutationId: "initial.1", snapshot: snapshot() })).rejects.toThrow("mutation_result_mismatch");
      const third = await store.replaceStaged({ mutationId: "replace.2", expectedBinding: second.recordedBinding, snapshot: snapshot(3) });
      await lease.database.run("update mutation_records set response_json=? where mutation_id='replace.1'", [JSON.stringify({ ...second, recordedBinding: third.recordedBinding })]);
      expect(await store.reconcile({ mutationId: "replace.1", requestDigest: second.requestDigest })).toEqual({ status: "outcome_unknown" });
      await lease.database.run("update mutation_records set operation_kind='staged_project.tombstone' where mutation_id='replace.1'");
      await expect(store.replaceStaged({ mutationId: "replace.1", expectedBinding: first.recordedBinding, snapshot: snapshot(2) })).rejects.toThrow("mutation_scope_invalid");
      await expect(store.reconcile({ mutationId: "replace.1", requestDigest: second.requestDigest })).rejects.toThrow("mutation_conflict");
    } finally { await lease.release(); }
  }));
  it.each(["snapshot", "head", "before_commit"])("rolls back %s failure and reopens the prior complete generation", async fault => fixture(async (store, pool, root) => {
    const first = await store.stageInitial({ mutationId: "initial.1", snapshot: snapshot() });
    const lease = await pool.acquire("project.1");
    try {
      if (fault === "before_commit") {
        const original = lease.database.transaction.bind(lease.database);
        vi.spyOn(lease.database, "transaction").mockImplementationOnce(operation => original(async sql => { await operation(sql); throw new Error("fixture.before_commit"); }));
      } else await lease.database.run(`create trigger fixture_abort before ${fault === "snapshot" ? "insert on accepted_project_snapshots" : "update on accepted_project_heads"} begin select raise(abort, 'fixture.abort'); end`);
      await expect(store.replaceStaged({ mutationId: `fault.${fault}`, expectedBinding: first.recordedBinding, snapshot: snapshot(2) })).rejects.toThrow(/fixture/);
      if (fault !== "before_commit") await lease.database.run("drop trigger fixture_abort");
      expect(await lease.database.get("select count(*) as n from accepted_project_snapshots")).toEqual({ n: 1 });
      const secondPool = new AutomationStudioProjectDatabasePool({ rootDir: root }), reopened = await Store.open({ pool: secondPool, projectId: "project.1" });
      try {
        expect((await reopened.readCurrent())?.binding).toEqual(first.recordedBinding);
        const retry = await reopened.replaceStaged({ mutationId: `retry.${fault}`, expectedBinding: first.recordedBinding, snapshot: snapshot(2) }); expect(retry.recordedBinding.generation).toBe(2);
      } finally { await reopened.close(); await secondPool.closeAll(); }
    } finally { vi.restoreAllMocks(); await lease.release(); }
  }));
  it("reconciles real COMMIT followed by lost acknowledgement across a fresh owner without repeating writes", async () => fixture(async (store, pool, root) => {
    const first = await store.stageInitial({ mutationId: "initial.1", snapshot: snapshot() });
    const input = { kind: "replace" as const, expectedBinding: first.recordedBinding, snapshot: snapshot(2) }, requestDigest = store.requestDigest(input);
    const lease = await pool.acquire("project.1");
    try {
      const original = lease.database.transaction.bind(lease.database);
      vi.spyOn(lease.database, "transaction").mockImplementationOnce(async operation => { await original(operation); throw new Error("fixture.lost_commit_ack"); });
      await expect(store.replaceStaged({ mutationId: "lost.1", ...input })).rejects.toThrow("lost_commit_ack");
      const secondPool = new AutomationStudioProjectDatabasePool({ rootDir: root }), reopened = await Store.open({ pool: secondPool, projectId: "project.1" });
      try {
        const reconciled = await reopened.reconcile({ mutationId: "lost.1", requestDigest });
        expect(reconciled).toMatchObject({ status: "committed", result: { replayed: true, recordedBinding: { generation: 2 }, productionAuthority: "unsupported" } });
        expect(await reopened.replaceStaged({ mutationId: "lost.1", ...input })).toMatchObject({ replayed: true, recordedBinding: { generation: 2 } });
        expect(await lease.database.get("select count(*) as n from accepted_project_snapshots")).toEqual({ n: 2 });
        expect(await reopened.reconcile({ mutationId: "never.sent", requestDigest })).toEqual({ status: "outcome_unknown" });
      } finally { await reopened.close(); await secondPool.closeAll(); }
    } finally { vi.restoreAllMocks(); await lease.release(); }
  }));
  it("refuses corrupt body/head and corrupt committed result instead of returning missing or repairing", async () => fixture(async (store, pool) => {
    const first = await store.stageInitial({ mutationId: "initial.1", snapshot: snapshot() }); const lease = await pool.acquire("project.1");
    try {
      await lease.database.run("update mutation_records set response_json='{}' where mutation_id='initial.1'");
      expect(await store.reconcile({ mutationId: "initial.1", requestDigest: first.requestDigest })).toEqual({ status: "outcome_unknown" });
      await lease.database.run("update accepted_project_snapshots set payload_json='{}'");
      await expect(store.readCurrent()).rejects.toThrow();
      await expect(store.stageInitial({ mutationId: "repair.1", snapshot: snapshot() })).rejects.toThrow();
      await lease.database.run("pragma foreign_keys=OFF");
      await lease.database.run("update accepted_project_heads set digest=?", [`sha256:${"f".repeat(64)}`]);
      await expect(store.readCurrent()).rejects.toThrow();
      expect(await lease.database.get("select count(*) as n from accepted_project_snapshots")).toEqual({ n: 1 });
    } finally { await lease.database.run("pragma foreign_keys=ON"); await lease.release(); }
  }));
  it("refuses unsupported JSON/code/publication before creating a head or mutation", async () => fixture(async (store, pool) => {
    for (const kind of ["json", "code", "publication"]) {
      const input = snapshot();
      if (kind === "json") Reflect.set(input, "storageAuthority", "json");
      if (kind === "code") input.flows[0]!.artifact.source = { mode: "code", moduleId: "module.1" };
      if (kind === "publication") input.flows[0]!.artifact.nodes[0]!.metadata = { "fluxiq.callFlow": { target: { flowId: "flow.main" } } };
      await expect(store.stageInitial({ mutationId: `unsupported.${kind}`, snapshot: input })).rejects.toThrow();
    }
    expect(await store.readCurrent()).toBeNull(); const lease = await pool.acquire("project.1");
    try { expect(await lease.database.get("select count(*) as n from mutation_records")).toEqual({ n: 0 }); } finally { await lease.release(); }
  }));
  it("preserves fully migrated existing project checksums/version/legacy rows and files without staging on open", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "staged-existing-")), pool = new AutomationStudioProjectDatabasePool({ rootDir: root });
    try {
      const graph = await AutomationStudioProjectGraphRepository.open({ pool, projectId: "project.1" }); await graph.close();
      const resource = await AutomationStudioProjectFlowResourceRepository.open({ pool, projectId: "project.1" });
      await resource.upsertFlow({ flowId: "legacy.flow", parentFlowId: null, owningSubflowId: null, name: "Existing partial-import ambiguity retained", description: "Not automatically adopted or repaired", scopeKind: "domain", scopeId: "domain.test", visibility: "private", origin: "user", sourceMode: "visual", status: "draft", compiledRevision: null }); await resource.close();
      const ledger = await AutomationStudioCandidateVerificationStore.open({ pool, projectId: "project.1" }); await ledger.close();
      const legacyPath = path.join(root, "legacy-flow.json"); await writeFile(legacyPath, '{"synthetic":"legacy data unchanged"}', "utf8"); const legacyBytes = await readFile(legacyPath); const legacyStat = await stat(legacyPath);
      const lease = await pool.acquire("project.1");
      try {
        await lease.database.run("pragma user_version=42"); const before = await lease.database.all("select migration_id,checksum from automation_schema_migrations order by migration_id"); const beforeFlows = await lease.database.all("select * from flows");
        const store = await Store.open({ pool, projectId: "project.1" });
        try {
          expect(await store.readCurrent()).toBeNull(); await store.stageInitial({ mutationId: "explicit.1", snapshot: snapshot() });
          expect(await lease.database.get("pragma user_version")).toEqual({ user_version: 42 });
          const after = await lease.database.all<{ migration_id: string; checksum: string }>("select migration_id,checksum from automation_schema_migrations order by migration_id");
          expect(after.filter(item => item.migration_id !== "0026_staged_project_snapshots_v1")).toEqual(before);
          expect(after.some(item => item.migration_id === "0026_staged_project_snapshots_v1")).toBe(true);
          expect(await lease.database.all("select * from flows")).toEqual(beforeFlows); expect(await readFile(legacyPath)).toEqual(legacyBytes); expect((await stat(legacyPath)).mtimeMs).toBe(legacyStat.mtimeMs);
        } finally { await store.close(); }
      } finally { await lease.release(); }
    } finally { await pool.closeAll(); await removeOwnedFixture(root); }
  });
});
