// @fluxiq-test-group real-sql
// One answer-first attempt through the real service, provider-free (t861, plan D1, D2, D9): a
// scripted model, a stub target that counts presses, and real SQL for the rows. Each case asserts
// on the calls the target saw and on the task kinds the provider saw, because what must not
// happen here (a trial, a reset, a second press) leaves no other trace.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AutomationStudioRunDatasets } from "../../datasets/index.ts";
import type { AutomationStudioFlowPaths } from "../../paths/index.ts";
import { judgeReply } from "../../../tests/service-bootstrap/tests/fixtures.ts";
import { automationStudioAnswerFirstAttemptStoreOf, automationStudioAnswerFirstRunActStoreOf } from "../index.ts";
import { complete, fakeLibrary, judgedYes, READ_LOANS, RENEW_CARD, RENEW_LOAN, runNode, scriptedAttempt, toolCall, type FakeLibrary } from "./fake-library.ts";

vi.setConfig({ testTimeout: 120_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const owned = (service: unknown) => service as Parameters<typeof automationStudioAnswerFirstAttemptStoreOf>[1] & { projectPaths: Parameters<typeof automationStudioAnswerFirstAttemptStoreOf>[1]["paths"]; flowPaths: AutomationStudioFlowPaths; projects: Parameters<typeof automationStudioAnswerFirstAttemptStoreOf>[1]["projects"] };
const storesOf = (service: unknown) => ({ paths: owned(service).projectPaths, flows: owned(service).flowPaths, projects: owned(service).projects });

function answerOf(attempt: { answered: Awaited<ReturnType<typeof scriptedAttempt>>["answered"] }) {
  if (attempt.answered.status !== "answered") throw new Error(`expected an answer, got ${attempt.answered.status}`);
  return attempt.answered;
}

/** Nothing of a build's test ever reached the target or the provider. */
function expectNoTrialOrReset(library: FakeLibrary, requests: readonly { taskKind: string; context: { evidenceLoop?: { tools: readonly { toolId: string }[] } } }[]): void {
  expect(library.calls.filter((call) => call.value.replay === "reset")).toEqual([]);
  expect(library.calls.filter((call) => call.value.replay === "verify")).toEqual([]);
  expect(library.calls.filter((call) => call.toolId === "core.test_candidate" || call.toolId === "core.submit_candidate")).toEqual([]);
  expect(new Set(requests.map((request) => request.taskKind))).toEqual(new Set(["evidence_tool_decision", "loop_verification"]));
  const offered = requests.flatMap((request) => request.context.evidenceLoop?.tools.map((tool) => tool.toolId) ?? []);
  expect(offered).not.toContain("core.test_candidate");
  expect(offered).not.toContain("core.submit_candidate");
}

describe("one answer-first attempt", () => {
  it("(a) reaches its result: rows from a read, read back, confirmed once, one act on the record, a draft saved, and no trial or reset", async () => {
    const attempt = await scriptedAttempt({
      instruction: "Renew the card on my library account and list every loan.",
      permittedConsequences: ["modify_existing"],
      script: [
        runNode("read", READ_LOANS, {}, [], { add: true }),
        runNode("card", RENEW_CARD, {}, ["modify_existing"], { add: true }),
        complete("Listed the loans and renewed the card.")
      ]
    }, cleanups);
    const answer = answerOf(attempt);
    expect(answer.attempt).toMatchObject({ status: "achieved", path: "explore", flowId: attempt.flowId, budget: { usd: 5 } });
    expect(answer.attempt.endedAtMs).toBeGreaterThanOrEqual(answer.attempt.startedAtMs);
    expect(answer.result).toMatchObject({ kind: "rows", label: "confirmed", timesChecked: 1, source: "exploration" });
    expect(answer.result?.rows?.totalRows).toBe(3);
    expect(answer.result?.rows?.previewRows.map((row) => row.title)).toEqual(["Atlas of Rivers", "Birds of the Coast", "Clockmaking"]);
    expect(answer.result?.acts).toHaveLength(1);

    // Read back from the store under the run the attempt names.
    const page = await (attempt.service as unknown as { runDatasets: AutomationStudioRunDatasets }).runDatasets.getRunDatasetPage({ projectId: attempt.projectId, runId: answer.attempt.runId!, datasetId: answer.result!.rows!.datasetId, limit: 10 });
    expect(page?.rows).toHaveLength(3);

    // One act record, beside the Flow, for the first real run to carry.
    const record = await automationStudioAnswerFirstRunActStoreOf(attempt.service, storesOf(attempt.service)).get(attempt.projectId, attempt.flowId);
    expect(record?.acts.map((act) => act.state)).toEqual(["landed"]);
    expect(attempt.library.renewals).toEqual({ card: 1 });

    expectNoTrialOrReset(attempt.library, attempt.requests);
    expect(attempt.requests.filter((request) => request.taskKind === "loop_verification")).toHaveLength(1);
    expect(attempt.requests.filter((request) => request.taskKind === "evidence_tool_decision")[0]?.domainInstructions?.text).toMatch(/get them their result/u);
    expect(attempt.requests.find((request) => request.taskKind === "loop_verification")?.domainInstructions?.text ?? "").not.toMatch(/get them their result/u);

    // The draft: saved, unverified, and nothing put into the Flow.
    expect(answer.candidateId).toMatch(/^candidate\./u);
    const owner = attempt.service as unknown as { flowPaths: AutomationStudioFlowPaths };
    const draft = JSON.parse(await readFile(path.join(owner.flowPaths.flowDirectory(attempt.projectId, attempt.flowId), "candidate-draft.json"), "utf8")) as { data?: unknown; verification?: string };
    expect(JSON.stringify(draft)).toContain("not_performed");
    expect((await attempt.service.listFlowSubflowSummaries({ projectId: attempt.projectId, flowId: attempt.flowId, limit: 1, offset: 0 })).total).toBe(0);

    // The attempt store holds it, strictly parsed.
    const kept = await automationStudioAnswerFirstAttemptStoreOf(attempt.service, storesOf(attempt.service)).latest(attempt.projectId, attempt.flowId);
    expect(kept?.attempt.attemptId).toBe(answer.attempt.attemptId);
    expect(kept?.result?.label).toBe("confirmed");
    expect(kept?.candidateId).toBe(answer.candidateId);
    expect(answer.attempt.liveSteps).toBeGreaterThanOrEqual(2);
    expect(answer.attempt.spend.calls).toBeGreaterThanOrEqual(4);
    expect(answer.attempt.spend.usd).toBeGreaterThan(0);
  });

  it("(b) a forward run acts on the rows not yet done, and an already-done row is not acted on again", async () => {
    const library = fakeLibrary();
    const attempt = await scriptedAttempt({
      library,
      instruction: "Renew every loan on my library account.",
      permittedConsequences: ["modify_existing"],
      script: [
        runNode("read", READ_LOANS, {}, [], { add: true }),
        runNode("first", RENEW_LOAN, { title: "Atlas of Rivers" }, ["modify_existing"], { add: true }),
        { kind: "amend_draft", amendments: [{ step: 3, change: "repeat", over: 2 }] },
        toolCall("forward", "core.run_flow", { from: 2 }),
        complete("Renewed every loan.")
      ]
    }, cleanups);
    const answer = answerOf(attempt);
    expect(answer.attempt.status).toBe("achieved");
    // Pressed once each: the first by hand, the other two by the forward run, and the first never again.
    expect(library.renewals).toEqual({ "Atlas of Rivers": 1, "Birds of the Coast": 1, Clockmaking: 1 });
    const passes = library.calls.filter((call) => call.value.replay === "step" && call.value.node === RENEW_LOAN);
    expect(passes.map((call) => (call.value.item as { title?: string }).title)).toEqual(["Birds of the Coast", "Clockmaking"]);
    expect(library.calls.filter((call) => call.value.node === RENEW_LOAN)).toHaveLength(3);
    expect(answer.result?.acts).toHaveLength(3);
    expectNoTrialOrReset(library, attempt.requests);
    // The forward form is what was offered: dry run off, core.run_flow on.
    const offered = attempt.requests.filter((request) => request.taskKind === "evidence_tool_decision").at(-1)?.context.evidenceLoop?.tools.map((tool) => tool.toolId);
    expect(offered).toContain("core.run_flow");
  });

  it("(c) a task with a lasting act and no rows ends done on site with its act", async () => {
    const attempt = await scriptedAttempt({
      instruction: "Renew the card on my library account.",
      permittedConsequences: ["modify_existing"],
      script: [runNode("card", RENEW_CARD, {}, ["modify_existing"], { add: true }), complete("Renewed the card.")]
    }, cleanups);
    const answer = answerOf(attempt);
    expect(answer.attempt.status).toBe("achieved");
    expect(answer.result).toMatchObject({ kind: "done_on_site", label: "confirmed", timesChecked: 1 });
    expect(answer.result?.rows).toBeUndefined();
    expect(answer.result?.acts).toHaveLength(1);
    expect(answer.result?.acts[0]).toMatchObject({ state: "landed", classes: ["modify_existing"] });
    expect(attempt.library.renewals).toEqual({ card: 1 });
  });

  it("(d) a budget exhausted mid-way ends budget_out with the best result and the draft", async () => {
    const attempt = await scriptedAttempt({
      instruction: "List every loan on my library account.",
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.04 },
      resolver: { maxTotalEstimatedCostUsd: 0.1 },
      wrapProvider: (provider) => ({ ...provider, estimateCostUsd: () => 0.04 }),
      // It reads, then never completes; the purse ends it.
      keepLooking: true,
      script: [runNode("read", READ_LOANS, {}, [], { add: true })]
    }, cleanups);
    const answer = answerOf(attempt);
    expect(answer.attempt.status).toBe("budget_out");
    expect(answer.attempt.budget.usd).toBe(0.1);
    expect(answer.attempt.endedAtMs).toBeDefined();
    expect(answer.result).toMatchObject({ kind: "rows", label: "unverified", timesChecked: 0 });
    expect(answer.result?.rows?.totalRows).toBe(3);
    expect(answer.result?.missingWhat).toMatch(/budget/u);
    expect(answer.candidateId).toMatch(/^candidate\./u);
    const kept = await automationStudioAnswerFirstAttemptStoreOf(attempt.service, storesOf(attempt.service)).latest(attempt.projectId, attempt.flowId);
    expect(kept?.attempt.status).toBe("budget_out");
    expect(kept?.steps?.length).toBeGreaterThan(0);
  });

  it("refuses a completion with nothing to judge with no model call, and a judge's no goes back and is not asked again on the same evidence", async () => {
    const library = fakeLibrary(["Atlas of Rivers"]);
    const said: string[] = [];
    const attempt = await scriptedAttempt({
      library,
      instruction: "List every loan on my library account.",
      judge: [judgeReply("no", { expected: "Every loan", observed: "One loan is missing", defects: [{ kind: "other", row: "Atlas of Rivers", requestWords: "every loan" }] }), judgedYes],
      script: [
        complete("Nothing yet."),
        (request) => {
          said.push(JSON.stringify(request.context.evidenceLoop?.evidence));
          return runNode("read", READ_LOANS, {}, [], { add: true });
        },
        complete("Listed."),
        complete("Listed, again."),
        (request) => {
          said.push(JSON.stringify(request.context.evidenceLoop?.evidence));
          library.loans.push({ title: "Birds of the Coast", due: "2030-01-02" });
          return runNode("read2", READ_LOANS, { page: 2 }, [], {});
        },
        complete("Listed it all.")
      ]
    }, cleanups);
    const answer = answerOf(attempt);
    expect(said[0]).toContain("answer_first.nothing_to_judge");
    expect(said[1]).toContain("answer_first.same_evidence");
    expect(answer.attempt.status).toBe("achieved");
    // A no, then a yes on new evidence: two judge calls for four completions.
    expect(attempt.requests.filter((request) => request.taskKind === "loop_verification")).toHaveLength(2);
    expect(answer.result).toMatchObject({ label: "confirmed", timesChecked: 2 });
    expect(answer.result?.rows?.previewRows.map((row) => row.title)).toEqual(["Atlas of Rivers", "Birds of the Coast"]);
  });
});
