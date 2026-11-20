// Actual strict disk/source owners, with only instruction/binding service methods supplied by the test.
import { mkdtemp, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { AutomationStudioFlowCandidateDraftStore } from "../../../candidate-drafts/index.ts";
import { candidateSourceFixture as fixture } from "../../../candidate-drafts/tests/fixtures.ts";
import { AutomationStudioProjectPaths, AutomationStudioFlowPaths } from "../../../paths/index.ts";
import type { AutomationStudioProjectStore } from "../../../projects/index.ts";
import { automationStudioAnswerFirstSourceAuthority } from "../source-authority.ts";

const projects = { ensureProjectStructure: async () => undefined } as unknown as AutomationStudioProjectStore;

async function withSource(run: (held: Awaited<ReturnType<typeof setup>>) => Promise<void>) {
  const parent = await realpath(os.tmpdir()), root = await mkdtemp(path.join(parent, "fluxiq-source-authority-"));
  try { await run(await setup(root)); }
  finally {
    vi.restoreAllMocks();
    const target = await realpath(root);
    expect(path.dirname(target)).toBe(parent);
    expect(path.basename(target)).toMatch(/^fluxiq-source-authority-/);
    await rm(target, { recursive: true, force: true });
  }
}

async function setup(root?: string) {
  const paths = new AutomationStudioProjectPaths(root), flows = new AutomationStudioFlowPaths(paths);
  const drafts = new AutomationStudioFlowCandidateDraftStore(paths, flows, projects), record = fixture.record();
  await drafts.save(record);
  const state = { instructions: [fixture.instruction()], binding: { executionDigest: "base", settingsRevision: 1 } };
  const owner = {
    async getLlmExecutionBinding() { return { ...state.binding }; },
    async listFlowInstructionSummaries() { return { instructions: state.instructions.map(each => ({ instructionId: each.instructionId })), total: state.instructions.length }; },
    async getFlowInstruction(_project: string, id: string) { return structuredClone(state.instructions.find(each => each.instructionId === id) ?? null); }
  };
  const authority = automationStudioAnswerFirstSourceAuthority({ projectId: record.projectId, flowId: record.flowId, owner, drafts });
  return { paths, flows, drafts, record, state, owner, authority };
}

it("binds the exact persisted reference and full current originals through their owners", async () => withSource(async ({ authority, drafts, record }) => {
  const verify = vi.spyOn(drafts, "getVerificationSource");
  const read = await authority.read(record.candidateId);
  expect(read).toEqual({ status: "bound", reference: fixture.reference(record), record });
  expect(verify).toHaveBeenCalledWith({ reference: fixture.reference(record), currentOriginalSources: record.originalSources });
  if (read.status !== "bound") throw new Error("Expected bound source");
  expect(Object.isFrozen(read.reference)).toBe(true);
  expect(await authority.read(record.candidateId, read.reference)).toEqual(read);
}));

it("never substitutes the latest candidate for the saved id, including a stale cache", async () => withSource(async ({ authority, drafts, paths, flows, record }) => {
  const latest = { ...record, candidateId: "candidate.replacement" };
  await new AutomationStudioFlowCandidateDraftStore(paths, flows, projects).save(latest);
  expect((await drafts.get(record.projectId, record.flowId))?.candidateId).toBe(record.candidateId);
  const verify = vi.spyOn(drafts, "getVerificationSource");
  expect(await authority.read(record.candidateId)).toEqual({ status: "unknown", code: "source_stale" });
  expect(verify).not.toHaveBeenCalled();
}));

it.each([{ revision: 2 }, { digest: "b".repeat(64) }, { baseDependencyDigest: "other" }, { baseSettingsRevision: 2 }, { originalInstructionsDigest: "b".repeat(64) }, { projectId: "other" }, { flowId: "other" }])("pins every reference field across reads: %j", async changed => withSource(async ({ authority, record }) => {
  expect(await authority.read(record.candidateId, { ...fixture.reference(record), ...changed })).toEqual({ status: "unknown", code: "source_stale" });
}));

it.each([{ executionDigest: "changed", settingsRevision: 1 }, { executionDigest: "base", settingsRevision: 2 }, { executionDigest: "base", settingsRevision: -1 }])("refuses stale or malformed live binding %j", async binding => withSource(async ({ authority, state, record }) => {
  state.binding = binding;
  expect(await authority.read(record.candidateId)).toEqual({ status: "unknown", code: "binding_changed" });
}));

it("reads originals freshly and refuses changed, missing, inactive, duplicate or added sources", async () => withSource(async ({ authority, state, record }) => {
  for (const instructions of [[fixture.instruction({ body: "Changed original" })], [], [fixture.instruction({ status: "archived" })], [fixture.instruction(), fixture.instruction()], [fixture.instruction(), fixture.instruction({ instructionId: "new.original" })]]) {
    state.instructions = instructions;
    expect(await authority.read(record.candidateId)).toMatchObject({ status: "unknown" });
  }
}));

it("checks binding again after the strict source read", async () => withSource(async ({ authority, state, drafts, record }) => {
  const verify = drafts.getVerificationSource;
  vi.spyOn(drafts, "getVerificationSource").mockImplementation(async input => {
    const read = await verify.call(drafts, input);
    state.binding.settingsRevision += 1;
    return read;
  });
  expect(await authority.read(record.candidateId)).toEqual({ status: "unknown", code: "binding_changed" });
}));

it("does not turn memory, legacy records or missing capabilities into authority", async () => {
  const memory = await setup();
  expect(await memory.authority.read(memory.record.candidateId)).toEqual({ status: "unknown", code: "source_unbound" });
  expect(await automationStudioAnswerFirstSourceAuthority({ projectId: "project.1", flowId: "flow.1", owner: {}, drafts: {} }).read("candidate.1")).toEqual({ status: "unknown", code: "authority_missing" });
  await withSource(async ({ authority, drafts, record }) => {
    const { originalSources: _sources, originalInstructionsDigest: _digest, ...legacy } = record;
    const { fingerprintVersion: _version, originalInstructionsDigest: _candidateDigest, ...candidate } = legacy.candidate;
    await drafts.save({ ...legacy, schemaVersion: 1, candidate });
    expect(await authority.read(record.candidateId)).toEqual({ status: "unknown", code: "source_unbound" });
  });
});

it("contains owner errors without returning private text", async () => withSource(async ({ authority, owner, record }) => {
  vi.spyOn(owner, "getFlowInstruction").mockRejectedValue(new Error("private original content"));
  expect(await authority.read(record.candidateId)).toEqual({ status: "unknown", code: "unavailable" });
}));
