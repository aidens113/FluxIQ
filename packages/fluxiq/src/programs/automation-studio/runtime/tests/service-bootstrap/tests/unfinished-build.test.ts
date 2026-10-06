// A build whose exploration stops before the Flow is ready (t208; audit A3,
// cause 1), through the real `generateFlowBootstrapAdaptation`: the Flow so
// far is tested and judged and a repair follows; a repair that gets no further
// ends "not finished" with a message the person reads (t195-w37: "not doable"
// only when the judge says what was asked can no longer be had).
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import { AutomationStudioService } from "../../../service.ts";
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
 * only when `repairs` says so.
 */
async function build(repairs: "finish" | "refuse") {
  const requests: AutomationStudioLlmTaskRequest[] = [];
  let repairing = false;
  let repairCalls = 0;
  const { project, flow } = structuredClone(await copyDataDirSeed(example, tempRoot));
  const provider = mockProvider(async (request) => {
    // The judge of a test of the Flow says yes; it is not one of the model's decisions.
    if (isJudgeRequest(request)) return judgeReply();
    requests.push(request);
    if (repairEntry(request)) repairing = true;
    if (repairing) repairCalls += 1;
    // A round must act before it may finish: the exploration adds a step, the repair first acts again without adding one.
    const first = requests.length === 1 || repairCalls === 1;
    const decision: JsonObject = first
      ? { kind: "tool_call", callId: `call.${requests.length}`, toolId: "example.act", input: { press: requests.length }, ...(repairing ? {} : { add: true }) }
      : repairing && repairs === "finish"
        ? { kind: "complete", result: { summary: "Built.", plan: plan() } }
        // A plan with no Subflow: refused every time, the same way, until the loop stops.
        : { kind: "complete", result: { summary: "Done.", plan: { ...plan(), subflows: [] } } };
    return { response: { kind: "evidence_tool_decision", summary: "Step.", decision }, usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCostUsd: 0.001 } };
  });
  const instance = new AutomationStudioService({
    dataDir: tempRoot,
    llmProviderResolver: (() => ({ provider, maxEstimatedCostUsd: 0.25, maxTotalEstimatedCostUsd: 2 })) as never,
    llmEvidenceRuntime: automationStudioReplayingBinding({
      domainId: "example",
      deniedEvidenceKeys: [],
      tools: [{ toolId: "example.act", description: "Change the target.", inputSchema: { type: "object" }, effect: "mutate" }],
      executeTool: async (input) => ({ kind: "llm_evidence_tool_execution", evidence: { changed: input.callId }, effectApplied: true, resultCode: "example.acted" })
    })
  });
  services.add(instance);
  const generation = instance.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, evidenceGuided: true, caller: caller() });
  return { requests, generation, instance, projectId: project.id, flowId: flow.flowId };
}

/**
 * A model that acts but adds nothing to its Flow, then says it is ready with a
 * result the check refuses, until the round stops. Told to explore again, it
 * adds the step and finishes when `again` says so, or goes on the same way.
 */
async function buildEmpty(again: "finish" | "same", maxCallsPerRun?: number) {
  const requests: AutomationStudioLlmTaskRequest[] = [];
  let exploringAgain = 0;
  const { project, flow } = structuredClone(await copyDataDirSeed(example, tempRoot));
  const provider = mockProvider(async (request) => {
    // The judge of a test of the Flow says yes; it is not one of the model's decisions.
    if (isJudgeRequest(request)) return judgeReply();
    requests.push(request);
    const entry = request.context.evidenceLoop?.evidence.find((item) => item.toolId === "core.resumed")?.value as JsonObject | undefined;
    if (entry?.code === "llm_evidence_loop.explore_again") exploringAgain += 1;
    const finishing = again === "finish" && exploringAgain > 0;
    // Every round acts before it may finish: this domain gives no free first look.
    const acts = request.context.evidenceLoop?.iteration === 1;
    const decision: JsonObject = acts
      ? { kind: "tool_call", callId: `call.${requests.length}`, toolId: "example.act", input: { press: requests.length }, ...(finishing ? { add: true } : {}) }
      : finishing
        ? { kind: "complete", result: { summary: "Built.", plan: plan() } }
        : { kind: "complete", result: { summary: "Done.", plan: { ...plan(), subflows: [] } } };
    return { response: { kind: "evidence_tool_decision", summary: "Step.", decision }, usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCostUsd: 0.001 } };
  });
  const instance = new AutomationStudioService({
    dataDir: tempRoot,
    llmProviderResolver: (() => ({ provider, maxEstimatedCostUsd: 0.25, maxTotalEstimatedCostUsd: 2, ...(maxCallsPerRun ? { maxCallsPerRun } : {}) })) as never,
    llmEvidenceRuntime: automationStudioReplayingBinding({
      domainId: "example",
      deniedEvidenceKeys: [],
      tools: [{ toolId: "example.act", description: "Change the target.", inputSchema: { type: "object" }, effect: "mutate" }],
      executeTool: async (input) => ({ kind: "llm_evidence_tool_execution", evidence: { changed: input.callId }, effectApplied: true, resultCode: "example.acted" })
    })
  });
  services.add(instance);
  const generation = instance.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, evidenceGuided: true, caller: caller() });
  return { requests, generation };
}

describe("a Flow build that stops with nothing in its Flow", () => {
  it("does not end while budget remains: it is told nothing is in the Flow yet, explores on, and its Flow is proposed", async () => {
    const { requests, generation } = await buildEmpty("finish");

    await expect(generation).resolves.toMatchObject({ status: "proposed" });
    const entry = requests.map((request) => request.context.evidenceLoop?.evidence.find((item) => item.toolId === "core.resumed")?.value as JsonObject | undefined).find((value) => value?.code === "llm_evidence_loop.explore_again");
    expect(entry).toMatchObject({ stopped: "unusable_decisions", draftSteps: 0, judgement: { stepsInFlow: 0 }, instruction: expect.stringContaining("Nothing is in the Flow yet") });
  });

  it("ends at its budget as a budget hit, with what was tried, how far it got and what blocked it", async () => {
    const { requests, generation } = await buildEmpty("same", 12);

    const diagnostic = await rejectedGenerationDiagnostic(generation);

    expect(requests).toHaveLength(12);
    expect(diagnostic.code).toBe("flow_bootstrap.evidence_budget_exhausted");
    expect(diagnostic.ending).toMatchObject({ kind: "budget_exhausted", bound: "calls", tried: { stepsInFlow: 0, decisions: 12 } });
    expect(diagnostic.ending?.message).toMatch(/^The build stopped at its limit of 12 model calls before the Flow was finished\./u);
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
// repeated it exactly. The service now hands the phases the signature of the
// Flow the first round starts from -- here the kept draft a continuation
// carries on (t240).
describe("a continuation whose first round ends on repeats with the kept draft unchanged", () => {
  it("ends not finished after that one round, never opening an identical second round", async () => {
    let building = 1;
    let call = 0;
    const second: number[] = [];
    const { project, flow } = structuredClone(await copyDataDirSeed(example, tempRoot));
    const provider = mockProvider(async () => {
      call += 1;
      if (building === 2) second.push(call);
      // The first build adds a step each call until its calls run out; the second presses again and again, adding nothing, to no effect.
      const decision: JsonObject = { kind: "tool_call", callId: `call.${call}`, toolId: "example.act", input: { press: call }, ...(building === 1 ? { add: true } : {}) };
      return { response: { kind: "evidence_tool_decision", summary: "Step.", decision }, usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCostUsd: 0.001 } };
    });
    const instance = new AutomationStudioService({
      dataDir: tempRoot,
      llmProviderResolver: (() => ({ provider, maxCallsPerRun: 12, maxEstimatedCostUsd: 0.25, maxTotalEstimatedCostUsd: 2 })) as never,
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
    expect(first.ending).toMatchObject({ kind: "budget_exhausted", bound: "calls" });
    building = 2;
    const diagnostic = await rejectedGenerationDiagnostic(instance.generateFlowBootstrapAdaptation(request));

    // Not finished, not "not doable" (t195-w37): a route is still open; another identical round would only repeat it.
    expect(diagnostic.code).toBe("flow_bootstrap.build_not_finished");
    expect(diagnostic.ending).toMatchObject({ kind: "not_finished", tried: { rounds: 1 } });
    expect(diagnostic.ending?.message).toContain("kept retrying the same things, which had already failed or done nothing, and left the Flow just as it started");
  });
});
