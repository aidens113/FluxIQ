import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { automationStudioTaskAttemptNoLoopsCaught } from "@fluxiq/contracts/automation";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioAttemptActRecord } from "../../../../../../runtime/answer-first/act-record/index.ts";
import { automationStudioAnswerFirstResult } from "../../../../../../runtime/answer-first/result/index.ts";
import { automationStudioResultRunTrail, automationStudioResultSemanticTrail, type AutomationStudioJudgeEvidenceCheckpoint } from "../../../../../../runtime/result-verification/index.ts";
import { AutomationStudioAnswerFirstAttemptStore, type AutomationStudioAnswerFirstAttemptRecord } from "../index.ts";
import { automationStudioAnswerFirstCallChain } from "../../attempt/call-chain.ts";
import { automationStudioAnswerFirstCarriedOpening } from "../../carry-on/index.ts";
import { automationStudioAnswerFirstTrailsOf } from "../../trail/index.ts";
import { automationStudioAnswerFirstWitnesses } from "../../witnesses/index.ts";
import { automaticFeed, REFERENCE } from "../../result-feed/tests/automatic-support.ts";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 }); });
const PROJECTS = { ensureProjectStructure: async () => undefined } as unknown as ConstructorParameters<typeof AutomationStudioAnswerFirstAttemptStore>[2];
const RAW = "RAW_CAPTURE_MUST_NOT_PERSIST";
const ACT = { id: "act.1", what: "Updated a preference", where: "Settings", classes: ["create_new"], state: "landed" as const };
const record = (): AutomationStudioAnswerFirstAttemptRecord => ({ attempt: { taskId: "task", attemptId: "attempt", ordinal: 1, projectId: "project", flowId: "flow", runId: "run.first", path: "explore", status: "working", spend: { calls: 0, inputTokens: 0, outputTokens: 0, usd: 0, ms: 0 }, budget: { usd: 5 }, liveSteps: 1, loopsCaught: automationStudioTaskAttemptNoLoopsCaught(), startedAtMs: REFERENCE }, tried: { version: 1, tried: [], approaches: 0 }, result: { ...automationStudioAnswerFirstResult({ attemptId: "attempt", label: "unverified", timesChecked: 0, acts: [ACT], skippedAsDone: 0 }), source: "exploration" } });
const options = { judgeEvidenceVersion: 1 as const, deniedEvidenceKeys: [] as readonly string[], projectJudgeEvidence: (input: { evidence: unknown }) => ({ role: "action" as const, evidence: { preference: ((input.evidence as JsonObject).evidence as JsonObject).preference ?? false, newlyPrivate: "old allowed semantic value" } }) };
async function disk() {
  const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-judge-checkpoint-")); roots.push(root);
  const open = () => new AutomationStudioAnswerFirstAttemptStore({ root }, { flowDirectory: () => root }, PROJECTS);
  return { root, open, store: open() };
}

it("saves actual call findings before cloning, reopens and carries them with exact processing/source evidence, and keeps the logical before", async () => {
  const io = await disk();
  const p = automaticFeed({ where: [{ field: "promoted", equals: "false" }], columns: ["title"] });
  p.read("one", [{ id: "a", title: "Original", promoted: false, price: "$2" }]);
  const original = { ...record(), steps: p.steps, processing: p.processing, processingReferenceTimeMs: REFERENCE, resultEvidence: p.feed.evidence() };
  await io.store.save("project", "flow", original);
  const journal = automationStudioAnswerFirstTrailsOf({});
  const trail = journal.of("attempt", { carriedOn: false, askedAgain: false });
  const witnesses = automationStudioAnswerFirstWitnesses({ read: async (side) => ({ preference: side === "after", page: RAW }) });
  const chain = automationStudioAnswerFirstCallChain({ domain: async () => ({ kind: "llm_evidence_tool_execution", evidence: { page: RAW, preference: true }, effectApplied: true, resultCode: "example.applied", draft: { effect: "mutate" } }), record: new AutomationStudioAttemptActRecord(), sink: { fromCall: async () => undefined }, witnesses, stepped: () => undefined, answered: () => undefined, judgeEvidence: options, trailed: async (step) => {
    trail.push(step);
    await io.store.saveJudgeEvidence("project", "flow", "attempt", journal.checkpoint(trail, witnesses.readings(), options)!);
  } });
  const answer = await chain({ callId: "core.call.1", toolId: "core.run_node", value: { node: "example.update", parameters: {}, consequences: ["create_new"] } });
  expect(answer).toMatchObject({ effectApplied: true, resultCode: "example.applied" });
  const stored = (await io.open().get("project", "flow", "attempt"))!;
  expect(stored.processingReferenceTimeMs).toBe(REFERENCE);
  expect(stored.processing).toEqual(original.processing);
  expect(stored.resultEvidence).toEqual(original.resultEvidence);
  expect(stored.result).toEqual(original.result);
  expect(stored.judgeEvidence?.trail[0]).toMatchObject({ callId: "core.call.1", framework: { effectApplied: true }, judgeEvidence: { evidence: { preference: true } } });
  expect(await readFile(path.join(io.root, "answer-attempts.json"), "utf8")).not.toContain(RAW);
  const carried = automationStudioAnswerFirstCarriedOpening({ projectId: "project", flowId: "flow", taskId: "task", attemptId: "attempt", before: stored, kept: undefined, acts: undefined, askedUsd: 5, budgetUsd: 5, opened: false });
  expect(carried.judgeEvidence).toEqual(stored.judgeEvidence);
  expect(carried.resultEvidence).toEqual(original.resultEvidence);
  const restarted = automationStudioAnswerFirstTrailsOf({});
  const resumed = restarted.of("attempt", { carriedOn: true, askedAgain: false, judgeEvidence: carried.judgeEvidence });
  expect(resumed.map((step) => step.did)).toEqual(["example.update"]);
  expect(restarted.capability(resumed, {})).toEqual({ judgeEvidenceVersion: 1 });
  const readings = restarted.witnesses(resumed, { after: { preference: false } });
  expect(readings.before).toMatchObject({ judgeEvidence: { evidence: { preference: false } } });
  expect(readings.after).toEqual({ preference: false });
  const shown = automationStudioResultSemanticTrail(automationStudioResultRunTrail(resumed, []).trail, { deniedEvidenceKeys: ["newlyPrivate"] });
  expect(shown.projection.missing).toEqual([]);
  expect(JSON.stringify(shown)).not.toContain("old allowed semantic value");
  expect(automationStudioResultSemanticTrail(automationStudioResultRunTrail(resumed, []).trail, { deniedEvidenceKeys: undefined }).projection.missing).toEqual([{ source: "trail", codes: ["judge_evidence.denied_keys_missing"] }]);
});

it("normalizes rejected new metadata to null without erasing actual results/effects or pretending it was legacy", async () => {
  const io = await disk();
  await io.store.save("project", "flow", record());
  const file = path.join(io.root, "answer-attempts.json");
  const original = JSON.parse(await readFile(file, "utf8"));
  expect(Object.hasOwn((await io.open().get("project", "flow", "attempt"))!, "judgeEvidence")).toBe(false);
  for (const invalid of [null, { version: 2, trail: [] }, { version: 1, trail: [{ did: "bad", found: { page: RAW } }] }]) {
    const held = structuredClone(original); held.attempts[0].judgeEvidence = invalid;
    await writeFile(file, JSON.stringify(held));
    const reopened = (await io.open().get("project", "flow", "attempt"))!;
    expect(reopened.result).toEqual(record().result);
    expect(reopened.judgeEvidence).toBeNull();
    const journal = automationStudioAnswerFirstTrailsOf({});
    const trail = journal.of("attempt", { carriedOn: true, askedAgain: false, judgeEvidence: reopened.judgeEvidence });
    expect(trail).toMatchObject([{ judgeEvidence: { missing: ["judge_evidence.checkpoint_invalid"] } }]);
    expect(journal.capability(trail, {})).toEqual({ judgeEvidenceVersion: 1 });
  }
});

it("does not let an older full-row save erase a newer ordered call checkpoint", async () => {
  const io = await disk();
  const first: AutomationStudioJudgeEvidenceCheckpoint = { version: 1, trail: [{ did: "example.read", callId: "one", judgeEvidence: { version: 1, role: "data", evidence: { rows: 1 }, missing: [], withheld: false } }] };
  const second: AutomationStudioJudgeEvidenceCheckpoint = { version: 1, trail: [...first.trail, { did: "example.update", callId: "two", framework: { effectApplied: true }, judgeEvidence: { version: 1, role: "action", evidence: { updated: true }, missing: [], withheld: false } }] };
  await io.store.save("project", "flow", { ...record(), judgeEvidence: first });
  await io.store.saveJudgeEvidence("project", "flow", "attempt", second);
  await io.store.save("project", "flow", { ...record(), judgeEvidence: first });
  expect((await io.open().get("project", "flow", "attempt"))?.judgeEvidence).toEqual(second);
  await expect(io.store.saveJudgeEvidence("project", "flow", "attempt", { ...second, version: 2 } as unknown as AutomationStudioJudgeEvidenceCheckpoint)).rejects.toThrow("Invalid semantic evidence");
  expect((await io.open().get("project", "flow", "attempt"))?.judgeEvidence).toEqual(second);
});
