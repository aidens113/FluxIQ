import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { AutomationStudioCandidateDurableSession, automationStudioCandidateRequirementsDigest, type AutomationStudioCandidateVerificationPorts } from "../index.ts";
import { AutomationStudioCandidateVerificationStore, type AutomationStudioCandidateLedgerRequest } from "../../../../storage/project/candidate-verification/index.ts";
import { AutomationStudioProjectDatabasePool } from "../../../../storage/project/index.ts";

function request(): AutomationStudioCandidateLedgerRequest {
  const text = "Ensure desired setting.";
  const brief = { interpretationStatus: "complete" as const, instructions: [{ instructionId: "instruction.1", text }], requirements: [{ requirementId: "requirement.1", source: { instructionId: "instruction.1", start: 0, end: text.length }, mode: "ensure" as const, subjects: { kind: "explicit" as const, subjectIds: ["subject.1"] }, predicates: [{ kind: "equals" as const, field: "setting", value: "desired" }] }] };
  return { attemptId: "attempt.1", brief, conditionsDigest: "c".repeat(64), binding: { candidateId: "candidate.1", identity: { projectId: "project.1", flowId: "flow.1", revision: 1, digest: "a".repeat(64), baseDependencyDigest: "b".repeat(64), requirementsDigest: automationStudioCandidateRequirementsDigest(brief) }, baseSettingsRevision: 1, originalInstructionText: text, instructionSources: [{ instructionId: "instruction.1", revision: 1, textDigest: createHash("sha256").update(text).digest("hex") }], permissionDigest: "d".repeat(64), registryDigest: "e".repeat(64), compilerVersion: "compiler.v1", normalizerVersion: "normalizer.v1", issuerVersion: "observer.v1" } };
}
async function fixture(operation: (context: Awaited<ReturnType<typeof setup>>) => Promise<void>) {
  const context = await setup();
  try { await operation(context); } finally { await context.store.close(); await context.pool.closeAll(); await rm(context.root, { recursive: true, force: true }); }
}
async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), "candidate-durable-session-")), pool = new AutomationStudioProjectDatabasePool({ rootDir: root });
  const store = await AutomationStudioCandidateVerificationStore.open({ pool, projectId: "project.1" });
  const req = request(); let binding = structuredClone(req.binding);
  const calls = { start: 0, execute: 0, observe: 0 };
  const ports: Omit<AutomationStudioCandidateVerificationPorts, "promote" | "currentIdentity"> = {
    prepareStart: async ({ conditionsDigest }) => { calls.start++; return { receiptId: "start.1", conditionsDigest, preparedAt: 1, pageGeneration: 1, subjectStates: [{ observationId: "baseline.1", subjectId: "subject.1", existed: true, observedAt: 1, pageGeneration: 1 }] }; },
    execute: async ({ identity, runId, start }) => { calls.execute++; return { identity, runId, startReceiptId: start.receiptId, startedAt: 2, finishedAt: 3, executedNodeCount: 1, status: "succeeded", commands: [] }; },
    observe: async ({ identity, execution, start }) => { calls.observe++; return { identity, runId: execution.runId, startReceiptId: start.receiptId, observations: [{ observationId: "observation.1", subjectId: "subject.1", pageGeneration: 1, observedAt: 4, fields: { setting: "desired" }, completeFields: ["setting"] }], enumerations: [] }; }
  };
  const session = (heldStore: AutomationStudioCandidateVerificationStore | null = store, suppliedRequest = req, signal?: AbortSignal) => new AutomationStudioCandidateDurableSession({ request: suppliedRequest, store: heldStore, ports, currentBinding: async () => binding, ...(signal ? { signal } : {}) });
  return { root, pool, store, req, ports, calls, session, change: (value: typeof binding) => { binding = value; } };
}
describe("durable trusted-port session, promotion remains unavailable", () => {
  it("commits receipts and explicit refusal, replays after reopen without side effects or accepted mutation", async () => fixture(async h => {
    const accepted = path.join(h.root, "accepted.json"); await writeFile(accepted, "existing accepted graph");
    const result = await h.session().verify();
    expect(result).toMatchObject({ status: "draft", code: "candidate.promotion_unsupported_storage_authority", receipt: { verdict: "satisfied" } });
    const restartedPool = new AutomationStudioProjectDatabasePool({ rootDir: h.root });
    const reopened = await AutomationStudioCandidateVerificationStore.open({ pool: restartedPool, projectId: "project.1" });
    try { expect(await h.session(reopened).verify()).toEqual(result); } finally { await reopened.close(); await restartedPool.closeAll(); }
    expect(h.calls).toEqual({ start: 1, execute: 1, observe: 1 });
    expect(await readFile(accepted, "utf8")).toEqual("existing accepted graph");
    const lease = await h.pool.acquire("project.1");
    try { expect(await lease.database.get("select count(*) as count from flows")).toEqual({ count: 0 }); } finally { await lease.release(); }
  }));
  it("JSON/no project ledger refuses before any start or execution", async () => fixture(async h => {
    const accepted = path.join(h.root, "accepted.json"); await writeFile(accepted, "original");
    expect(await h.session(null).verify()).toEqual({ status: "draft", code: "candidate.promotion_unsupported_storage_authority" });
    expect(h.calls).toEqual({ start: 0, execute: 0, observe: 0 }); expect(await readFile(accepted, "utf8")).toEqual("original");
  }));
  it("simultaneous sessions make one side-effect claim; duplicate unfinished claim is unknown", async () => fixture(async h => {
    const results = await Promise.all([h.session().verify(), h.session().verify()]);
    expect(results.some(value => value.status === "draft" && value.code === "candidate.verification_outcome_unknown")).toBe(true);
    expect(h.calls).toEqual({ start: 1, execute: 1, observe: 1 });
  }));
  it("restarted pending claim never repeats start/reset or execute", async () => fixture(async h => {
    await h.store.claim(h.req); await h.store.beginStage(h.req.attemptId, "start");
    const restartedPool = new AutomationStudioProjectDatabasePool({ rootDir: h.root });
    const reopened = await AutomationStudioCandidateVerificationStore.open({ pool: restartedPool, projectId: "project.1" });
    try { expect(await h.session(reopened).verify()).toEqual({ status: "draft", code: "candidate.verification_outcome_unknown" }); } finally { await reopened.close(); await restartedPool.closeAll(); }
    expect(h.calls).toEqual({ start: 0, execute: 0, observe: 0 });
  }));
  it.each([false, true])("lost execution stage write acknowledgement (after commit=%s) never repeats effects", async afterCommit => fixture(async h => {
    const original = h.store.commitStage.bind(h.store);
    vi.spyOn(h.store, "commitStage").mockImplementation(async (attempt, stage, payload) => {
      if (stage !== "execution" || afterCommit) await original(attempt, stage, payload);
      if (stage === "execution") throw new Error("lost write acknowledgement");
    });
    expect(await h.session().verify()).toEqual({ status: "draft", code: "candidate.verification_outcome_unknown" });
    expect((await h.store.get(h.req.attemptId))?.status).toBe("outcome_unknown");
    expect(await h.session().verify()).toEqual({ status: "draft", code: "candidate.verification_outcome_unknown" });
    expect(h.calls).toEqual({ start: 1, execute: 1, observe: 0 });
  }));
  it("lost finish acknowledgement reconciles committed result without rerun", async () => fixture(async h => {
    const original = h.store.finish.bind(h.store);
    vi.spyOn(h.store, "finish").mockImplementation(async (...args) => { await original(...args); throw new Error("lost finish ack"); });
    expect(await h.session().verify()).toMatchObject({ code: "candidate.promotion_unsupported_storage_authority" });
    expect((await h.store.get(h.req.attemptId))?.status).toBe("committed"); expect(h.calls.execute).toBe(1);
  }));
  it("conflicting same claim cannot replay another binding's known result", async () => fixture(async h => {
    await h.session().verify();
    const other = structuredClone(h.req); other.binding.candidateId = "candidate.2"; h.change(other.binding);
    expect(await h.session(h.store, other).verify()).toEqual({ status: "draft", code: "candidate.verification_outcome_unknown" });
    expect(h.calls.execute).toBe(1);
  }));
  it("fresh settings/source/permission binding is checked before any start", async () => fixture(async h => {
    for (const change of [{ baseSettingsRevision: 2 }, { originalInstructionText: "changed" }, { permissionDigest: "f".repeat(64) }]) {
      h.change({ ...h.req.binding, ...change }); expect(await h.session().verify()).toEqual({ status: "draft", code: "candidate.stale" });
    }
    expect(h.calls.start).toBe(0);
  }));
  it("pre-cancelled session does not claim or execute", async () => fixture(async h => {
    const abort = new AbortController(); abort.abort();
    expect(await h.session(h.store, h.req, abort.signal).verify()).toEqual({ status: "draft", code: "candidate.cancelled" });
    expect(await h.store.get(h.req.attemptId)).toBeNull(); expect(h.calls.start).toBe(0);
  }));
});
