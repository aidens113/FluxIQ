// @fluxiq-test-group real-sql
// A build whose exploration stops before the Flow is ready (t208; audit A3,
// cause 1), through the real `generateFlowBootstrapAdaptation`: the Flow so
// far is tested and judged and a repair follows; a repair that gets no further
// ends "not finished" with a message the person reads (t195-w37: "not doable"
// only when the judge says what was asked can no longer be had).
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioLlmTaskRequest } from "../../../../../runtime/llm/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_REDIRECT_AT_STEPS_WITHOUT_PROGRESS } from "../../../../../runtime/loop-limits/index.ts";
import { AutomationStudioService } from "../../../service.ts";
import { automationStudioAnsweringInstructionReading } from "./instruction-reading.ts";
import { automationStudioReplayingBinding } from "../../replaying-binding.ts";
import { blankFixture, copyDataDirSeed, caller, isJudgeRequest, judgeReply, mockProvider, plan, rejectedGenerationDiagnostic, seedDataDir, type DataDirSeed } from "./fixtures.ts";

const SEEDING_TIMEOUT_MS = 60_000;

let tempRoot: string;
let seedRoot: string;
let example: DataDirSeed<Awaited<ReturnType<typeof blankFixture>>>;
const services = new Set<AutomationStudioService>();

beforeAll(async () => {
  seedRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-bootstrap-unfinished-seed-"));
  example = await seedDataDir(path.join(seedRoot, "example"), (instance) => blankFixture(instance, "active", "example"));
}, SEEDING_TIMEOUT_MS);

afterAll(async () => {
  if (seedRoot) await rm(seedRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-bootstrap-unfinished-"));
});

afterEach(async () => {
  await Promise.all([...services].map((instance) => instance.close()));
  services.clear();
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

/** Whether this request is the first of a repair: its evidence opens with Core's repair entry. */
function repairEntry(request: AutomationStudioLlmTaskRequest): JsonObject | undefined {
  const entry = request.context.evidenceLoop?.evidence.find((item) => item.toolId === "core.resumed")?.value as JsonObject | undefined;
  return entry?.code === "llm_evidence_loop.repair" ? entry : undefined;
}

/**
 * A model that adds one step to its Flow, then says it is ready with a result
 * the check refuses, until the build stops; in a repair, it finishes properly
 * only when `repairs` says so. Since t1037 the framework drafts every call that
 * worked into the Flow, so the repair's act is one that changes nothing
 * (`lands` absent): it acts without adding a step, as before.
 */
async function build(repairs: "finish" | "refuse") {
  const requests: AutomationStudioLlmTaskRequest[] = [];
  let repairing = false;
  let repairCalls = 0;
  const { project, flow } = structuredClone(await copyDataDirSeed(example, tempRoot));
  // The build reads its instruction when it starts (t976, b2ee9ed45): not one of the model's decisions either.
  const provider = mockProvider(automationStudioAnsweringInstructionReading(async (request) => {
    // The judge of a test of the Flow says yes; it is not one of the model's decisions.
    if (isJudgeRequest(request)) return judgeReply();
    requests.push(request);
    if (repairEntry(request)) repairing = true;
    if (repairing) repairCalls += 1;
    // A round must act before it may finish: the exploration adds a step, the repair first acts again without adding one.
    const first = requests.length === 1 || repairCalls === 1;
    const decision: JsonObject = first
      ? { kind: "tool_call", callId: `call.${requests.length}`, toolId: "example.act", input: { press: requests.length, ...(repairing ? {} : { lands: true }) }, ...(repairing ? {} : { add: true }) }
      : repairing && repairs === "finish"
        ? { kind: "complete", result: { summary: "Built.", plan: plan() } }
        // A plan with no Subflow: refused every time, the same way, until the loop stops.
        : { kind: "complete", result: { summary: "Done.", plan: { ...plan(), subflows: [] } } };
    return { response: { kind: "evidence_tool_decision", summary: "Step.", decision }, usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCostUsd: 0.001 } };
  }, { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCostUsd: 0.001 }));
  const instance = new AutomationStudioService({
    dataDir: tempRoot,
    llmProviderResolver: (() => ({ provider, maxEstimatedCostUsd: 0.25, maxTotalEstimatedCostUsd: 2 })) as never,
    llmEvidenceRuntime: automationStudioReplayingBinding({
      domainId: "example",
      deniedEvidenceKeys: [],
      tools: [{ toolId: "example.act", description: "Change the target.", inputSchema: { type: "object" }, effect: "mutate" }],
      // An act changes the target only where the model's call says it lands (above).
      executeTool: async (input) => ({ kind: "llm_evidence_tool_execution", evidence: { changed: input.value.lands === true ? input.callId : null }, effectApplied: input.value.lands === true, resultCode: "example.acted" })
    })
  });
  services.add(instance);
  const generation = instance.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, evidenceGuided: true, caller: caller() });
  return { requests, generation, instance, projectId: project.id, flowId: flow.flowId };
}

/**
 * A model that acts but adds nothing to its Flow, then says it is ready with a
 * result the check refuses. No count ends its round (t1056): once it is told it
 * keeps repeating, it adds the step and finishes when `again` says so, or goes
 * on the same way until its purse (`purseUsd`) is gone. Since t1037 the
 * framework drafts every call that worked, so an act that adds nothing is one
 * that changed nothing (`lands` absent).
 */
async function buildEmpty(again: "finish" | "same", purseUsd = 2) {
  const requests: AutomationStudioLlmTaskRequest[] = [];
  let exploringAgain = 0;
  let steered = 0;
  let landed = false;
  const { project, flow } = structuredClone(await copyDataDirSeed(example, tempRoot));
  // The build reads its instruction when it starts (t976, b2ee9ed45): not one of the model's decisions either.
  const provider = mockProvider(automationStudioAnsweringInstructionReading(async (request) => {
    // The judge of a test of the Flow says yes; it is not one of the model's decisions.
    if (isJudgeRequest(request)) return judgeReply();
    requests.push(request);
    const evidence = request.context.evidenceLoop?.evidence ?? [];
    const entry = evidence.find((item) => item.toolId === "core.resumed")?.value as JsonObject | undefined;
    if (entry?.code === "llm_evidence_loop.explore_again") exploringAgain += 1;
    // Told that it keeps repeating itself (the no-progress redirect or loop detection's steer): the way out it takes.
    if (evidence.some((item) => item.toolId === "core.no_progress" || item.toolId === "core.loop_check")) steered += 1;
    const finishing = again === "finish" && (exploringAgain > 0 || steered > 0);
    // Every round acts before it may finish, and a model that changes approach acts first: this domain gives no free first look.
    const acts = request.context.evidenceLoop?.iteration === 1 || (finishing && !landed);
    if (acts && finishing) landed = true;
    const decision: JsonObject = acts
      ? { kind: "tool_call", callId: `call.${requests.length}`, toolId: "example.act", input: { press: requests.length, ...(finishing ? { lands: true } : {}) }, ...(finishing ? { add: true } : {}) }
      : finishing
        ? { kind: "complete", result: { summary: "Built.", plan: plan() } }
        : { kind: "complete", result: { summary: "Done.", plan: { ...plan(), subflows: [] } } };
    return { response: { kind: "evidence_tool_decision", summary: "Step.", decision }, usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCostUsd: 0.001 } };
  }, { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCostUsd: 0.001 }));
  const instance = new AutomationStudioService({
    dataDir: tempRoot,
    llmProviderResolver: (() => ({ provider, maxEstimatedCostUsd: 0.25, maxTotalEstimatedCostUsd: purseUsd })) as never,
    llmEvidenceRuntime: automationStudioReplayingBinding({
      domainId: "example",
      deniedEvidenceKeys: [],
      tools: [{ toolId: "example.act", description: "Change the target.", inputSchema: { type: "object" }, effect: "mutate" }],
      // An act changes the target only where the model's call says it lands (above).
      executeTool: async (input) => ({ kind: "llm_evidence_tool_execution", evidence: { changed: input.value.lands === true ? input.callId : null }, effectApplied: input.value.lands === true, resultCode: "example.acted" })
    })
  });
  services.add(instance);
  const generation = instance.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, evidenceGuided: true, caller: caller() });
  return { requests, generation, exploredAgain: () => exploringAgain };
}

describe("a Flow build that stops with nothing in its Flow", () => {
  // No count ends the round (t1056): refused completions in a row once stalled it, and a fresh round was told nothing
  // was in the Flow yet. Now the model is steered in the same round, and the Flow it then builds is proposed.
  it("does not end while budget remains: it is steered in the same round, explores on, and its Flow is proposed", async () => {
    const { requests, generation, exploredAgain } = await buildEmpty("finish");

    await expect(generation).resolves.toMatchObject({ status: "proposed" });
    expect(exploredAgain()).toBe(0);
    expect(requests.some((request) => (request.context.evidenceLoop?.evidence ?? []).some((item) => item.toolId === "core.no_progress" || item.toolId === "core.loop_check"))).toBe(true);
  });

  // A purse is dollars, never a count of calls (t1056): the build runs, steered, until its purse refuses the next call.
  // This provider prices nothing, so each call is held at Core's default model's rates (`llm/build-purse/priced.ts`):
  // a decision's request of about 20,000 tokens at about $0.007, beside a judging pair kept back at about $0.008, while
  // each decision reports costing $0.001. A purse of $0.02 left room for four decisions, too few to show that no count
  // ended it; $0.05 pays for well past the old counts before the hold no longer fits.
  it("ends at its budget as a budget hit, with what was tried, how far it got and what blocked it", async () => {
    const { requests, generation } = await buildEmpty("same", 0.05);

    const diagnostic = await rejectedGenerationDiagnostic(generation);

    expect(requests.length).toBeGreaterThan(12);
    expect(diagnostic.code).toBe("flow_bootstrap.evidence_budget_exhausted");
    expect(diagnostic.ending).toMatchObject({ kind: "budget_exhausted", bound: "cost", tried: { stepsInFlow: 0 } });
    expect(diagnostic.ending?.message).toMatch(/^The build (stopped at its spending limit|used its budget for this Flow)/u);
    expect(diagnostic.ending?.message).toContain("No step I found belonged in the Flow.");
    expect(diagnostic.ending?.message).toMatch(/I worked on it live (?:once|twice|\d+ times)[^.]*\. What held it up was that /u);
    expect(diagnostic.ending?.message).not.toMatch(/\bdecisions?\b/u);
  });
});

describe("a Flow build that stops before its Flow is ready", () => {
  it("tests and judges what it has, then repairs it live, and the repaired Flow is proposed", async () => {
    const { requests, generation, instance, projectId, flowId } = await build("finish");

    const result = await generation;

    expect(result.status).toBe("proposed");
    // The Flow keeps the whole build's record, not the repair's alone: every
    // decision of the exploration and the repair, numbered across the build (t214).
    const decisions = requests.filter((request) => request.context.evidenceLoop).length;
    const stored = await instance.getFlowBootstrapAdaptation(projectId, flowId, result.adaptationId);
    const numbered = [...new Set((stored?.evidenceTrace ?? []).flatMap((row) => row.iteration > 0 ? [row.iteration] : []))];
    expect(numbered).toEqual(Array.from({ length: decisions }, (_, index) => index + 1));
    expect(stored?.auditEvents[0]?.detail).toMatchObject({ decisionCount: decisions, providerCallCount: decisions });
    const repair = requests.map(repairEntry).find(Boolean);
    expect(repair).toMatchObject({ code: "llm_evidence_loop.repair", stopped: "unusable_decisions", judgement: { stepsInFlow: 1 }, instruction: expect.stringContaining("This is the repair") });
    // The repair starts from the Flow as far as it got: the one step added.
    const firstOfRepair = requests.find((request) => repairEntry(request))!;
    expect(firstOfRepair.context.evidenceLoop?.evidence.find((item) => item.toolId === "core.resumed")?.value).toMatchObject({ draftSteps: 1, proposableSteps: 1 });
  });

  // A repair that gets no further ends the build not finished, never "not doable": the user's rule is that a build
  // is not doable only when there is absolutely no way (t195-w37, live run run-murwcaj0-40e56557).
  it("ends not finished, with a message the person reads, when the repair gets no further", async () => {
    const { requests, generation } = await build("refuse");

    const diagnostic = await rejectedGenerationDiagnostic(generation);

    expect(requests.some((request) => repairEntry(request))).toBe(true);
    expect(diagnostic.code).toBe("flow_bootstrap.build_not_finished");
    expect(diagnostic.ending).toMatchObject({ kind: "not_finished", tried: { rounds: 2, stepsInFlow: 1 } });
    expect(diagnostic.ending?.message).toMatch(/^I have not finished this Flow yet\. /u);
    expect(diagnostic.ending?.message).not.toContain("found no way");
    expect(diagnostic.ending?.message).toContain("I worked on it live twice: first exploring the page, then fixing it once after testing what I had.");
  });
});

// Run 38 (cause C8): a build's first round ended on refused repeats with the
// Flow it started from unchanged, and the phases opened a second round that
// repeated it exactly. The service hands the phases the signature of the
// Flow the first round starts from -- here the kept draft a continuation
// carries on (t240). Since t1049 no count of steps without progress ends the
// round, and since t1056 no count of calls either: a continuation circling on
// presses that do nothing is steered, runs until its purse is gone, and still
// never opens an identical second round.
describe("a continuation that circles on repeats with the kept draft unchanged", () => {
  it("runs, steered, until its purse is gone, never opening an identical second round", async () => {
    let building = 1;
    let call = 0;
    const second: number[] = [];
    // The tool ids of what each of the second build's decisions was shown.
    const shownInSecond: string[][] = [];
    const { project, flow } = structuredClone(await copyDataDirSeed(example, tempRoot));
    const provider = mockProvider(async (request) => {
      call += 1;
      if (building === 2) {
        second.push(call);
        shownInSecond.push((request.context.evidenceLoop?.evidence ?? []).map((entry) => entry.toolId));
      }
      // The first build adds a step each call until its calls run out; the second presses again and again, adding nothing, to no effect.
      const decision: JsonObject = { kind: "tool_call", callId: `call.${call}`, toolId: "example.act", input: { press: call }, ...(building === 1 ? { add: true } : {}) };
      return { response: { kind: "evidence_tool_decision", summary: "Step.", decision }, usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCostUsd: 0.001 } };
    });
    // Each build's purse: the first spends its own to the end, and the second carries that spend under a larger ceiling.
    let purseUsd = 0.015;
    const instance = new AutomationStudioService({
      dataDir: tempRoot,
      llmProviderResolver: (() => ({ provider, maxEstimatedCostUsd: 0.25, maxTotalEstimatedCostUsd: purseUsd })) as never,
      llmEvidenceRuntime: {
        domainId: "example",
        deniedEvidenceKeys: [],
        tools: [{ toolId: "example.act", description: "Change the target.", inputSchema: { type: "object" }, effect: "mutate" }],
        executeTool: async (input) => building === 1 || input.callId === undefined || !second.length
          ? { kind: "llm_evidence_tool_execution", evidence: { changed: input.callId ?? "replayed" }, effectApplied: true, resultCode: "example.acted" }
          : { kind: "llm_evidence_tool_execution", evidence: { changed: false }, effectApplied: false, resultCode: "example.unchanged" }
      }
    });
    services.add(instance);
    const request = { projectId: project.id, flowId: flow.flowId, evidenceGuided: true as const, caller: caller() };

    const first = await rejectedGenerationDiagnostic(instance.generateFlowBootstrapAdaptation(request));
    expect(first.ending).toMatchObject({ kind: "budget_exhausted", bound: "cost" });
    building = 2;
    purseUsd = 0.05;
    const diagnostic = await rejectedGenerationDiagnostic(instance.generateFlowBootstrapAdaptation(request));

    // The purse ends it -- dollars, never a count of calls or of steps without progress -- and in one round: no
    // identical second round is opened.
    expect(diagnostic.code).toBe("flow_bootstrap.evidence_budget_exhausted");
    expect(diagnostic.ending).toMatchObject({ kind: "budget_exhausted", bound: "cost", tried: { rounds: 1 } });
    expect(second.length).toBeGreaterThan(12);
    // Its words say the limit it met, never that it kept retrying the same: that came from a removed count.
    expect(diagnostic.ending?.message).toMatch(/spending limit|budget for this Flow/u);
    expect(diagnostic.ending?.message).not.toContain("kept retrying the same");
    // Steered: from the third press that did nothing, the model was told so, and on the decisions after.
    const steered = shownInSecond.filter((shown) => shown.includes("core.no_progress")).length;
    expect(steered).toBeGreaterThan(AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_REDIRECT_AT_STEPS_WITHOUT_PROGRESS);
  });
});
