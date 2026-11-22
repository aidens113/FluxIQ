import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { automationStudioTaskAttemptNoLoopsCaught } from "@fluxiq/contracts/automation";
import type { JsonObject } from "../../../../../../core/index.ts";
import { automationStudioFlowLessJudgedSummary, automationStudioResultVerdict, type AutomationStudioFlowLessSummary } from "../../../../../../runtime/result-verification/index.ts";
import { AutomationStudioAnswerFirstAttemptStore, type AutomationStudioAnswerFirstAttemptRecord } from "../index.ts";
import { automationStudioAnswerFirstCarriedOpening } from "../../carry-on/index.ts";
import { automationStudioAnswerFirstTrailsOf } from "../../trail/index.ts";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 }); });
const PROJECTS = { ensureProjectStructure: async () => undefined } as unknown as ConstructorParameters<typeof AutomationStudioAnswerFirstAttemptStore>[2];
const record = (): AutomationStudioAnswerFirstAttemptRecord => ({ attempt: { taskId: "task", attemptId: "attempt", ordinal: 1, projectId: "project", flowId: "flow", runId: "run", path: "explore", status: "working", spend: { calls: 0, inputTokens: 0, outputTokens: 0, usd: 0, ms: 0 }, budget: { usd: 5 }, liveSteps: 1, loopsCaught: automationStudioTaskAttemptNoLoopsCaught(), startedAtMs: 1 }, tried: { version: 1, tried: [], approaches: 0 } });
const OPTIONS = { judgeEvidenceVersion: 1 as const, deniedEvidenceKeys: [] as readonly string[], projectJudgeEvidence: (input: { evidence: unknown }) => ({ role: "observation" as const, evidence: { checked: ((input.evidence as JsonObject).evidence as JsonObject).checked ?? false } }) };
async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-judge-issue-")); roots.push(root);
  const open = () => new AutomationStudioAnswerFirstAttemptStore({ root }, { flowDirectory: () => root }, PROJECTS);
  const store = open();
  const journal = automationStudioAnswerFirstTrailsOf({});
  const trail = journal.of("attempt", { carriedOn: false, askedAgain: false });
  trail.push({ did: "example.update", callId: "actual.call", framework: { effectApplied: true, failure: { category: "expected_state_missing", code: "example.effect_unknown", retryable: false, stage: "confirmation", effect: "ambiguous" } }, judgeEvidence: { version: 1, role: "action", evidence: { effectUncertain: "The original command did not establish the final state." }, missing: [], withheld: false } });
  const first = journal.checkpoint(trail, { before: { checked: false } }, OPTIONS)!;
  const sourceOwner = journal.sourceOwner(trail)!;
  await store.save("project", "flow", { ...record(), judgeEvidence: first }, { sourceOwner });
  const conflict = { ...structuredClone(first), trail: [{ ...first.trail[0]!, framework: { effectApplied: false } }] };
  return { root, open, store, journal, trail, first, conflict, sourceOwner };
}

it("rotates a durable issue on refusal and clears it only after a newer complete snapshot from the original live source owner", async () => {
  const p = await setup();
  await expect(p.store.saveJudgeEvidence("project", "flow", "attempt", p.conflict, { sourceOwner: p.sourceOwner })).rejects.toThrow("revision conflict");
  const marked = (await p.store.get("project", "flow", "attempt"))!;
  expect(marked.judgeEvidence).toEqual(p.first);
  expect(marked.judgeEvidenceIssue).toMatchObject({ version: 1, revision: p.first.revision, code: "checkpoint_conflict" });
  const receipt = marked.judgeEvidenceIssue!.receipt;
  await expect(p.store.saveJudgeEvidence("project", "flow", "attempt", p.conflict, { sourceOwner: p.sourceOwner })).rejects.toThrow("revision conflict");
  expect((await p.store.get("project", "flow", "attempt"))?.judgeEvidenceIssue?.receipt).not.toBe(receipt);
  const active = (await p.store.get("project", "flow", "attempt"))!.judgeEvidenceIssue!;
  p.journal.of("attempt", { carriedOn: true, askedAgain: false, judgeEvidence: p.first, judgeEvidenceIssue: active });
  const complete = p.journal.checkpoint(p.trail, { before: { checked: false }, after: { checked: true } }, OPTIONS)!;
  const recovered = await p.store.saveJudgeEvidence("project", "flow", "attempt", complete, { sourceOwner: p.sourceOwner });
  p.journal.recovered(p.trail, recovered);
  const kept = (await p.open().get("project", "flow", "attempt"))!;
  expect(kept.judgeEvidence).toEqual(complete);
  expect(kept.judgeEvidenceIssue).toEqual({ ...active, recoveredAtRevision: complete.revision });
  expect(p.trail.find((step) => step.did === "core.judge_journal_recovered")?.judgeEvidence?.evidence).toMatchObject({ coverage: "recovered", receipt: active.receipt, recoveredAtRevision: complete.revision });
  expect(p.trail.find((step) => step.did === "core.judge_journal_coverage")).toBeDefined();
  const reopened = automationStudioAnswerFirstTrailsOf({});
  const restored = reopened.of("attempt", { carriedOn: true, askedAgain: false, judgeEvidence: kept.judgeEvidence ?? null, judgeEvidenceIssue: kept.judgeEvidenceIssue ?? null });
  expect(reopened.sourceOwner(restored)).toBeUndefined();
  expect(restored.find((step) => step.did === "core.judge_journal_recovered")?.judgeEvidence?.evidence).toMatchObject({ receipt: active.receipt, recoveredAtRevision: complete.revision });
});

it("reopens the warning through the real carry/journal path and no harmless read or higher revision clears it", async () => {
  const p = await setup();
  await expect(p.store.save("project", "flow", { ...record(), judgeEvidence: p.conflict }, { sourceOwner: p.sourceOwner })).rejects.toThrow("actual attempt data was saved");
  const before = (await p.open().get("project", "flow", "attempt"))!;
  const carried = automationStudioAnswerFirstCarriedOpening({ projectId: "project", flowId: "flow", taskId: "task", attemptId: "attempt", before, kept: undefined, acts: undefined, askedUsd: 5, budgetUsd: 5, opened: false });
  expect(carried.judgeEvidenceIssue).toEqual(before.judgeEvidenceIssue);
  const journal = automationStudioAnswerFirstTrailsOf({});
  const trail = journal.of("attempt", { carriedOn: true, askedAgain: false, judgeEvidence: carried.judgeEvidence ?? null, judgeEvidenceIssue: carried.judgeEvidenceIssue ?? null });
  expect(journal.sourceOwner(trail)).toBeUndefined();
  expect(trail.find((step) => step.did === "core.judge_journal_coverage")?.judgeEvidence?.evidence).toMatchObject({ coverage: "historical_incomplete", receipt: before.judgeEvidenceIssue!.receipt });
  trail.push({ did: "example.harmless_read", judgeEvidence: { version: 1, role: "observation", evidence: { observed: "An unrelated real read" }, missing: [], withheld: false } });
  const later = journal.checkpoint(trail, {}, OPTIONS)!;
  const reopenedStore = p.open();
  await reopenedStore.saveJudgeEvidence("project", "flow", "attempt", later, { sourceOwner: journal.sourceOwner(trail) });
  expect((await p.open().get("project", "flow", "attempt"))?.judgeEvidenceIssue).toMatchObject({ code: "checkpoint_conflict" });
  expect(journal.sourceOwner(trail)).toBeUndefined();
});

it("does not let another owner, an invented token or a stale receipt clear the warning", async () => {
  const p = await setup();
  await expect(p.store.saveJudgeEvidence("project", "flow", "attempt", p.conflict, { sourceOwner: p.sourceOwner })).rejects.toThrow();
  const firstReceipt = (await p.store.get("project", "flow", "attempt"))!.judgeEvidenceIssue!.receipt;
  const other = automationStudioAnswerFirstTrailsOf({});
  const otherTrail = other.of("another-logical-attempt", { carriedOn: false, askedAgain: false });
  const otherOwner = other.sourceOwner(otherTrail)!;
  await expect(p.store.saveJudgeEvidence("project", "flow", "attempt", p.conflict, { sourceOwner: otherOwner })).rejects.toThrow();
  expect((await p.store.get("project", "flow", "attempt"))!.judgeEvidenceIssue!.receipt).not.toBe(firstReceipt);
  const later = p.journal.checkpoint(p.trail, { after: { checked: true } }, OPTIONS)!;
  await p.store.saveJudgeEvidence("project", "flow", "attempt", later, { sourceOwner: p.sourceOwner });
  expect((await p.store.get("project", "flow", "attempt"))?.judgeEvidenceIssue).toBeDefined();
  await p.store.saveJudgeEvidence("project", "flow", "attempt", { ...later, revision: later.revision + 1 }, { sourceOwner: {} });
  expect((await p.store.get("project", "flow", "attempt"))?.judgeEvidenceIssue).toBeDefined();
});

it("retains historical uncertainty while independently complete current action proof can pass and missing required proof cannot", async () => {
  const p = await setup();
  await expect(p.store.saveJudgeEvidence("project", "flow", "attempt", p.conflict, { sourceOwner: p.sourceOwner })).rejects.toThrow();
  const held = (await p.open().get("project", "flow", "attempt"))!;
  const journal = automationStudioAnswerFirstTrailsOf({});
  const trail = journal.of("attempt", { carriedOn: true, askedAgain: false, judgeEvidence: held.judgeEvidence ?? null, judgeEvidenceIssue: held.judgeEvidenceIssue ?? null });
  const current: AutomationStudioFlowLessSummary = { instructions: "Set the preference to checked", acts: [{ id: "actual.act", what: "Changed the preference", where: "Settings", classes: ["modify_existing"], state: "landed" }], trail, witnesses: journal.witnesses(trail, { after: { checked: true } }) };
  const proof = automationStudioFlowLessJudgedSummary(current, [], OPTIONS);
  expect(proof.sent.evidenceProjection?.missing).toEqual([]);
  expect(JSON.stringify(proof.sent)).toContain("historical_incomplete");
  expect(JSON.stringify(proof.sent)).toContain("effect_unknown");
  expect(automationStudioResultVerdict({ summary: proof.read, basis: "model", diagnosis: { answersRequest: "yes" } }).verdict).toBe("answers");
  const missing = automationStudioFlowLessJudgedSummary({ ...current, witnesses: journal.witnesses(trail, {}) }, [], OPTIONS);
  expect(missing.sent.evidenceProjection?.missing).toContainEqual({ source: "witnesses.after", codes: ["judge_evidence.after_state_missing"] });
  expect(automationStudioResultVerdict({ summary: missing.read, basis: "model", diagnosis: { answersRequest: "yes" } }).verdict).toBe("unsure");
});

it("preserves malformed issue metadata as explicit unknown without losing the stored actual journal", async () => {
  const p = await setup();
  const file = path.join(p.root, "answer-attempts.json");
  const raw = JSON.parse(await readFile(file, "utf8"));
  expect(raw.version).toBe(1);
  expect(raw.data.attempts).toHaveLength(1);
  raw.data.attempts[0].judgeEvidenceIssue = { version: 2, receipt: "invalid" };
  await writeFile(file, JSON.stringify(raw));
  const held = (await p.open().get("project", "flow", "attempt"))!;
  expect(held.judgeEvidenceIssue).toBeNull();
  expect(held.judgeEvidence).toEqual(p.first);
  const journal = automationStudioAnswerFirstTrailsOf({});
  const trail = journal.of("attempt", { carriedOn: true, askedAgain: false, judgeEvidence: held.judgeEvidence ?? null, judgeEvidenceIssue: held.judgeEvidenceIssue ?? null });
  expect(journal.sourceOwner(trail)).toBeUndefined();
  expect(trail.find((step) => step.did === "core.judge_journal_coverage")?.judgeEvidence?.evidence).toMatchObject({ code: "checkpoint_issue_invalid" });
});

it("does not allow an ordinary full-row caller to manufacture a recovered receipt", async () => {
  const p = await setup();
  const forged = { version: 1 as const, receipt: "b15ad329-893d-4499-a6f7-3828b9fb30a2", revision: 1, code: "checkpoint_conflict" as const, recoveredAtRevision: 2 };
  await expect(p.store.save("project", "flow", { ...record(), judgeEvidence: p.first, judgeEvidenceIssue: forged }, { sourceOwner: p.sourceOwner })).rejects.toThrow("actual attempt data was saved");
  const kept = (await p.open().get("project", "flow", "attempt"))!;
  expect(kept.attempt).toEqual(record().attempt);
  expect(kept.judgeEvidence).toEqual(p.first);
  expect(kept.judgeEvidenceIssue?.recoveredAtRevision).toBeUndefined();
  expect(kept.judgeEvidenceIssue?.receipt).not.toBe(forged.receipt);
});
