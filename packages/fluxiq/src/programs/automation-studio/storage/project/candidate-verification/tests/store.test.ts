import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AutomationStudioCandidateVerificationStore, type AutomationStudioCandidateLedgerRequest } from "../index.ts";
import { AutomationStudioProjectDatabasePool } from "../../database.ts";
import { AutomationStudioProjectFlowResourceRepository } from "../../flow-resource-repository.ts";
import { automationStudioCandidateRequirementsDigest } from "../../../../runtime/flow-bootstrap/verification/index.ts";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
function request(): AutomationStudioCandidateLedgerRequest {
  const brief = { interpretationStatus: "complete" as const, instructions: [{ instructionId: "instruction.1", text: "Ensure desired setting." }], requirements: [{ requirementId: "requirement.1", source: { instructionId: "instruction.1", start: 0, end: 23 }, mode: "ensure" as const, subjects: { kind: "explicit" as const, subjectIds: ["subject.1"] }, predicates: [{ kind: "equals" as const, field: "setting", value: "desired" }] }] };
  return { attemptId: "attempt.1", conditionsDigest: "c".repeat(64), brief, binding: { candidateId: "candidate.1", identity: { projectId: "project.1", flowId: "flow.1", revision: 1, digest: "a".repeat(64), baseDependencyDigest: "b".repeat(64), requirementsDigest: automationStudioCandidateRequirementsDigest(brief) }, baseSettingsRevision: 1, originalInstructionText: brief.instructions[0]!.text, instructionSources: [{ instructionId: "instruction.1", revision: 1, textDigest: hash(brief.instructions[0]!.text) }], permissionDigest: "d".repeat(64), registryDigest: "e".repeat(64), compilerVersion: "compiler.v1", normalizerVersion: "normalizer.v1", issuerVersion: "observer.v1" } };
}
async function fixture(operation: (store: AutomationStudioCandidateVerificationStore, pool: AutomationStudioProjectDatabasePool, root: string) => Promise<void>) {
  const root = await mkdtemp(path.join(os.tmpdir(), "candidate-ledger-"));
  const pool = new AutomationStudioProjectDatabasePool({ rootDir: root });
  const store = await AutomationStudioCandidateVerificationStore.open({ pool, projectId: "project.1" });
  try { await operation(store, pool, root); } finally { await store.close(); await pool.closeAll(); await rm(root, { recursive: true, force: true }); }
}
describe("real project candidate ledger", () => {
  it("serializes simultaneous claims, refuses conflicts and preserves pending on reopen", async () => fixture(async (store, pool, root) => {
    const claims = await Promise.all([store.claim(request()), store.claim(request())]);
    expect(claims.filter(value => value.claimed)).toHaveLength(1);
    await expect(store.claim({ ...request(), conditionsDigest: "f".repeat(64) })).rejects.toThrow("claim_conflict");
    const secondPool = new AutomationStudioProjectDatabasePool({ rootDir: root });
    const second = await AutomationStudioCandidateVerificationStore.open({ pool: secondPool, projectId: "project.1" });
    try { expect(await second.claim(request())).toMatchObject({ claimed: false, record: { status: "pending" } }); } finally { await second.close(); await secondPool.closeAll(); }
  }));
  it("replays only committed draft outcome after a new connection", async () => fixture(async (store, pool) => {
    await store.claim(request());
    await store.finish("attempt.1", { status: "draft", code: "candidate.requirements_interpretation_unknown" });
    const reopened = await AutomationStudioCandidateVerificationStore.open({ pool, projectId: "project.1" });
    try { expect(await reopened.claim(request())).toMatchObject({ claimed: false, record: { status: "committed", outcome: { status: "draft" } } }); } finally { await reopened.close(); }
  }));
  it("rolls back malformed stage writes without losing pending side-effect claim", async () => fixture(async store => {
    await store.claim(request()); await store.beginStage("attempt.1", "start");
    await expect(store.commitStage("attempt.1", "start", { receiptId: "start.1", conditionsDigest: "wrong" })).rejects.toThrow("start_invalid");
    expect((await store.get("attempt.1"))?.stages.start).toEqual({ status: "pending" });
    await store.markUnknown("attempt.1");
    expect(await store.claim(request())).toMatchObject({ claimed: false, record: { status: "outcome_unknown" } });
  }));
  it("rejects wrong identity and missing start reference with real transaction rollback", async () => fixture(async store => {
    const req = request(); await store.claim(req); await store.beginStage("attempt.1", "start");
    await store.commitStage("attempt.1", "start", { receiptId: "start.1", conditionsDigest: req.conditionsDigest, preparedAt: 1, pageGeneration: 1, subjectStates: [] });
    await store.beginStage("attempt.1", "execution");
    const execution = { identity: req.binding.identity, runId: "run.1", startReceiptId: "wrong", status: "succeeded", commands: [] };
    await expect(store.commitStage("attempt.1", "execution", execution)).rejects.toThrow("start_reference_mismatch");
    await expect(store.commitStage("attempt.1", "execution", { ...execution, identity: { ...execution.identity, flowId: "wrong" } })).rejects.toThrow("identity_mismatch");
  }));
  it("refuses corrupt record rather than treating it as absent", async () => fixture(async (store, pool) => {
    await store.claim(request()); const lease = await pool.acquire("project.1");
    try { await lease.database.run("update candidate_verification_attempts set record_json = '{}' where attempt_id = 'attempt.1'"); } finally { await lease.release(); }
    await expect(store.get("attempt.1")).rejects.toThrow();
  }));
  it("adds local migration to an existing fully migrated project without downgrade or reset", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "candidate-existing-project-"));
    const pool = new AutomationStudioProjectDatabasePool({ rootDir: root });
    try {
      const resource = await AutomationStudioProjectFlowResourceRepository.open({ pool, projectId: "project.1" });
      await resource.upsertFlow({ flowId: "flow.1", parentFlowId: null, owningSubflowId: null, name: "Existing", description: "preserved", scopeKind: "domain", scopeId: "domain.test", visibility: "domain", origin: "user", sourceMode: "visual", status: "draft", compiledRevision: null });
      await resource.close();
      const lease = await pool.acquire("project.1");
      await lease.database.run("pragma user_version = 42");
      const before = await lease.database.all("select migration_id, checksum from automation_schema_migrations order by migration_id");
      const store = await AutomationStudioCandidateVerificationStore.open({ pool, projectId: "project.1" });
      try {
        await store.claim(request());
        expect(await lease.database.get("pragma user_version")).toEqual({ user_version: 42 });
        const after = await lease.database.all<{ migration_id: string; checksum: string }>("select migration_id, checksum from automation_schema_migrations order by migration_id");
        expect(after.filter(value => value.migration_id !== "0025_candidate_verification_receipts_v1")).toEqual(before);
        expect(await lease.database.get("select name from flows where flow_id = 'flow.1'")).toEqual({ name: "Existing" });
      } finally { await store.close(); await lease.release(); }
    } finally { await pool.closeAll(); await rm(root, { recursive: true, force: true }); }
  });
});
