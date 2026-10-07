import { mkdtemp, rm, writeFile, realpath } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { AutomationStudioFlowCandidateDraftStore, type AutomationStudioFlowCandidateDraftRecord } from "../index.ts";
import { AutomationStudioFlowPaths, AutomationStudioProjectPaths } from "../../paths/index.ts";
import { AutomationStudioBootstrapAdaptationStore } from "../../bootstrap-adaptations.ts";
import { ProgramJsonStore } from "../../../../../_shared/storage.ts";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioProjectStore } from "../../projects/index.ts";

import { candidateSourceFixture as fixture } from "./fixtures.ts";

const projects = { ensureProjectStructure: async () => undefined } as unknown as AutomationStudioProjectStore;
const record = (): AutomationStudioFlowCandidateDraftRecord => ({
  kind: "flow_candidate_draft", schemaVersion: 1, status: "draft", verification: "not_performed", candidateId: "candidate.1", projectId: "project.1", flowId: "flow.1",
  sourceInstructionIds: ["instruction.1"], instructionText: "Find the requested records.", baseSettingsRevision: 1, createdAt: 10,
  accounting: { requestId: "request.1", estimatedInputTokens: 10 },
  candidate: { revision: 1, digest: "a".repeat(64), baseDependencyDigest: "base", status: "draft", summary: "Unverified candidate", changedPaths: ["plan"], buildPlan: { plan: { summary: "Unverified candidate", router: { rules: [] }, subflows: [] } } as unknown as AutomationStudioFlowCandidateDraftRecord["candidate"]["buildPlan"] }
});

describe.each([false, true])("candidate drafts persist separately (SQLite=%s)", sqlite => {
  it("survives a new store and is never listed as an adaptation", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-candidate-draft-"));
    try {
      if (sqlite) await writeFile(path.join(root, "config.json"), JSON.stringify({ layoutVersion: 2 }));
      const paths = new AutomationStudioProjectPaths(path.join(root, "programs", "automation-studio", "projects"));
      const flows = new AutomationStudioFlowPaths(paths);
      const saved = record();
      await new AutomationStudioFlowCandidateDraftStore(paths, flows, projects).save(saved);
      saved.candidate.summary = "caller mutation";
      const loaded = await new AutomationStudioFlowCandidateDraftStore(paths, flows, projects).get("project.1", "flow.1");
      expect(loaded).toEqual(record());
      const held = new AutomationStudioFlowCandidateDraftStore(paths, flows, projects);
      await held.save(record());
      const updated = record(); updated.candidateId = "candidate.new"; updated.candidate.revision = 2;
      await new AutomationStudioFlowCandidateDraftStore(paths, flows, projects).save(updated);
      expect((await held.get("project.1", "flow.1"))?.candidateId).toBe("candidate.1");
      expect((await held.getAuthoritative("project.1", "flow.1"))?.candidateId).toBe("candidate.new");
      expect(await new AutomationStudioBootstrapAdaptationStore(paths, flows, projects).listFlowBootstrapAdaptations("project.1", "flow.1")).toEqual([]);
      expect(await new AutomationStudioFlowCandidateDraftStore(paths, flows, projects).get("project.1", "other.flow")).toBeUndefined();
    } finally { await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 }); }
  });
});

it("a cancelled save writes no candidate", async () => {
  const paths = new AutomationStudioProjectPaths(undefined);
  const store = new AutomationStudioFlowCandidateDraftStore(paths, new AutomationStudioFlowPaths(paths), projects);
  const abort = new AbortController(); abort.abort();
  await expect(store.save(record(), abort.signal)).rejects.toThrow();
  expect(await store.get("project.1", "flow.1")).toBeUndefined();
});


it("actual disk read refuses a v1 discriminator containing a v2 candidate policy", async () => {
  const parent = await realpath(os.tmpdir());
  const root = await mkdtemp(path.join(parent, "fluxiq-candidate-mixed-"));
  try {
    const paths = new AutomationStudioProjectPaths(path.join(root, "programs", "automation-studio", "projects"));
    const flows = new AutomationStudioFlowPaths(paths);
    const mixed = record() as unknown as JsonObject;
    (mixed.candidate as JsonObject).fingerprintVersion = "candidate.plan+original_sources.v2";
    (mixed.candidate as JsonObject).originalInstructionsDigest = "b".repeat(64);
    await new ProgramJsonStore<JsonObject>(path.join(flows.flowDirectory("project.1", "flow.1"), "candidate-draft.json"), () => ({})).write(mixed);
    expect(await new AutomationStudioFlowCandidateDraftStore(paths, flows, projects).getAuthoritative("project.1", "flow.1")).toBeUndefined();
  } finally {
    const target = await realpath(root);
    expect(path.dirname(target)).toBe(parent);
    expect(path.basename(target)).toMatch(/^fluxiq-candidate-mixed-/);
    await rm(target, { recursive: true, force: true });
  }
});


async function withV2(run: (store: AutomationStudioFlowCandidateDraftStore, record: ReturnType<typeof fixture.record>, paths: AutomationStudioProjectPaths, flows: AutomationStudioFlowPaths) => Promise<void>, sqlite = false) {
  const parent = await realpath(os.tmpdir()), root = await mkdtemp(path.join(parent, "fluxiq-candidate-v2-"));
  try {
    if (sqlite) await writeFile(path.join(root, "config.json"), JSON.stringify({ layoutVersion: 2 }));
    const paths = new AutomationStudioProjectPaths(path.join(root, "programs", "automation-studio", "projects")), flows = new AutomationStudioFlowPaths(paths);
    const record = fixture.record(), store = new AutomationStudioFlowCandidateDraftStore(paths, flows, projects);
    await store.save(record);
    await run(store, record, paths, flows);
  } finally {
    vi.restoreAllMocks();
    const target = await realpath(root); expect(path.dirname(target)).toBe(parent); expect(path.basename(target)).toMatch(/^fluxiq-candidate-v2-/);
    await rm(target, { recursive: true, force: true });
  }
}

it("v2 binds original bytes across an actual new disk-store instance", async () => withV2(async (_, record, paths, flows) => {
  const restarted = new AutomationStudioFlowCandidateDraftStore(paths, flows, projects);
  const read = await restarted.getVerificationSource({ reference: fixture.reference(record), currentOriginalSources: record.originalSources });
  expect(read).toMatchObject({ status: "bound", originalInstructionsDigest: record.originalInstructionsDigest, record });
  expect(Object.isFrozen(read)).toBe(true);
  expect(await restarted.getAuthoritative(record.projectId, record.flowId)).toEqual(record);
}));

it.each(["plan", "derived", "source", "version"] as const)("actual disk %s tamper refuses a source binding", async kind => withV2(async (store, record, _, flows) => {
  const changed = structuredClone(record);
  if (kind === "plan") changed.candidate.buildPlan.plan.router.name = "tampered";
  if (kind === "derived") changed.candidate.buildPlan.subflows[0]!.nodes[0]!.position.x += 1;
  if (kind === "source") changed.originalSources.instructions[0]!.body += " omitted clause";
  if (kind === "version") (changed as unknown as JsonObject).schemaVersion = 1;
  await new ProgramJsonStore<JsonObject>(path.join(flows.flowDirectory(record.projectId, record.flowId), "candidate-draft.json"), () => ({})).write(changed as unknown as JsonObject);
  expect(await store.getVerificationSource({ reference: fixture.reference(record), currentOriginalSources: record.originalSources })).toMatchObject({ status: "unknown" });
  expect(await store.getAuthoritative(record.projectId, record.flowId)).toBeUndefined();
}));

it.each([{ candidateId: "borrowed" }, { revision: 2 }, { digest: "b".repeat(64) }, { baseDependencyDigest: "changed" }, { baseSettingsRevision: 2 }, { originalInstructionsDigest: "b".repeat(64) }, { flowId: "other" }, { projectId: "other" }])("exact reference rejects %j", async changed => withV2(async (store, record) => {
  expect(await store.getVerificationSource({ reference: { ...fixture.reference(record), ...changed }, currentOriginalSources: record.originalSources })).toMatchObject({ status: "unknown" });
}));

it("current original source change and newer disk candidate refuse stale refs despite cache", async () => withV2(async (store, record, paths, flows) => {
  const current = fixture.binding([fixture.instruction({ body: "Changed original" })]).originalSources;
  expect(await store.getVerificationSource({ reference: fixture.reference(record), currentOriginalSources: current })).toMatchObject({ status: "unknown", code: "candidate.source_stale" });
  const newer = structuredClone(record); newer.candidateId = "candidate.new"; newer.candidate.revision = 2;
  await new AutomationStudioFlowCandidateDraftStore(paths, flows, projects).save(newer);
  expect((await store.get(record.projectId, record.flowId))?.candidateId).toBe(record.candidateId);
  expect(await store.getVerificationSource({ reference: fixture.reference(record), currentOriginalSources: record.originalSources })).toMatchObject({ status: "unknown", code: "candidate.source_stale" });
}));

it("v1 remains readable unverified while v1 and memory refuse binding", async () => withV2(async (store, bound) => {
  await store.save(record());
  expect(await store.getAuthoritative("project.1", "flow.1")).toEqual(record());
  expect(await store.getVerificationSource({ reference: fixture.reference(bound), currentOriginalSources: bound.originalSources })).toMatchObject({ status: "unknown" });
  const paths = new AutomationStudioProjectPaths(undefined), memory = new AutomationStudioFlowCandidateDraftStore(paths, new AutomationStudioFlowPaths(paths), projects);
  await memory.save(bound);
  expect(await memory.getVerificationSource({ reference: fixture.reference(bound), currentOriginalSources: bound.originalSources })).toMatchObject({ status: "unknown", code: "candidate.source_memory_only" });
}));

it("source read freezes caller refs/current originals before its first await", async () => withV2(async (store, record) => {
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  const read = ProgramJsonStore.prototype.readExistingReadOnly;
  vi.spyOn(ProgramJsonStore.prototype, "readExistingReadOnly").mockImplementation(async function (this: ProgramJsonStore<JsonObject>) { await gate; return read.call(this); });
  const reference = fixture.reference(record), sources = structuredClone(record.originalSources);
  const pending = store.getVerificationSource({ reference, currentOriginalSources: sources });
  reference.candidateId = "caller mutation"; sources.instructions[0]!.body = "caller mutation"; release();
  expect(await pending).toMatchObject({ status: "bound", record });
}));

it("request accessors and malformed v2 saves cannot become source authority", async () => withV2(async (store, record) => {
  let calls = 0;
  const request = { get reference() { calls++; return fixture.reference(record); }, currentOriginalSources: record.originalSources };
  expect(await store.getVerificationSource(request)).toMatchObject({ status: "unknown" }); expect(calls).toBe(0);
  const tampered = structuredClone(record); tampered.candidate.buildPlan.risk = "high";
  await expect(store.save(tampered)).rejects.toThrow(/source_record_invalid/);
  expect(await store.getVerificationSource({ reference: fixture.reference(record), currentOriginalSources: record.originalSources })).toMatchObject({ status: "bound" });
}));


it("normal SQLite WAL draft storage does not claim unsupported read-only source authority", async () => withV2(async (store, record) => {
  expect(await store.getAuthoritative(record.projectId, record.flowId)).toEqual(record);
  expect(await store.getVerificationSource({ reference: fixture.reference(record), currentOriginalSources: record.originalSources })).toMatchObject({ status: "unknown" });
}, true));

it.each([{ estimatedCostUsd: -1 }, { outputTokens: -1 }, { provider: "bad\u0000provider" }, { unknown: true }, { model: " padded " }])("actual disk accounting tamper %j refuses without repair", async accounting => withV2(async (store, record, _, flows) => {
  const changed = structuredClone(record);
  Object.assign(changed.accounting, accounting);
  await new ProgramJsonStore<JsonObject>(path.join(flows.flowDirectory(record.projectId, record.flowId), "candidate-draft.json"), () => ({})).write(changed as unknown as JsonObject);
  expect(await store.getVerificationSource({ reference: fixture.reference(record), currentOriginalSources: record.originalSources })).toMatchObject({ status: "unknown" });
  expect(await store.getAuthoritative(record.projectId, record.flowId)).toBeUndefined();
}));
