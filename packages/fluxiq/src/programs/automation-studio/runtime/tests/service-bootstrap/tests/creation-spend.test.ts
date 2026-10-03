// One purse per Flow creation, through the real `generateFlowBootstrapAdaptation`
// (t234). The person's limit is a Flow's: every build of it, until a Flow is
// proposed or a build ends not doable, draws from one ceiling, and what each
// build spent is kept between builds (`flow-bootstrap/creation-spend/`), so
// building again carries the spend on rather than starting a fresh ceiling.
// A refuted-result repair keeps its own ceiling and never touches the record.
// The build loop's decision call reserves the reply decisions actually use
// (`llm/harness/token-limits.ts`).
//
// No model is called: the provider is scripted. The ceiling is read from
// `AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD`, never written here.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, onTestFinished } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { automationStudioActivityHub } from "../../../activity/index.ts";
import type { AutomationStudioFlowBootstrapCreationSpend } from "../../../flow-bootstrap/index.ts";
import {
  AUTOMATION_STUDIO_LLM_DECISION_REPLY_TOKENS,
  AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD,
  AUTOMATION_STUDIO_SESSION_KEY_PROVIDER_DEFAULTS,
  resolveAutomationStudioLlmTokenLimits,
  type AutomationStudioLlmEvidenceRuntimeBinding,
  type AutomationStudioLlmProvider,
  type AutomationStudioLlmTaskRequest
} from "../../../llm/index.ts";
import { AutomationStudioService } from "../../../service.ts";
import { automationStudioReplayingBinding } from "../../replaying-binding.ts";
import { blankFixture, caller, copyDataDirSeed, isJudgeRequest, judgeReply, mockProvider, plan, rejectedGenerationDiagnostic, seedDataDir, type DataDirSeed } from "./fixtures.ts";

const SEEDING_TIMEOUT_MS = 60_000;
const CEILING = AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD;

let tempRoot: string;
let seedRoot: string;
let example: DataDirSeed<Awaited<ReturnType<typeof blankFixture>>>;
const services = new Set<AutomationStudioService>();

beforeAll(async () => {
  seedRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-bootstrap-creation-spend-seed-"));
  example = await seedDataDir(path.join(seedRoot, "example"), (instance) => blankFixture(instance, "active", "example"));
}, SEEDING_TIMEOUT_MS);

afterAll(async () => {
  if (seedRoot) await rm(seedRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-bootstrap-creation-spend-"));
});

afterEach(async () => {
  await Promise.all([...services].map((instance) => instance.close()));
  services.clear();
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

type SpendStore = {
  get(projectId: string, flowId: string): Promise<AutomationStudioFlowBootstrapCreationSpend | undefined>;
  save(record: AutomationStudioFlowBootstrapCreationSpend): Promise<AutomationStudioFlowBootstrapCreationSpend>;
};

/** The service's own store of creation spend: what its next build reads. */
function spends(instance: AutomationStudioService): SpendStore {
  return (instance as unknown as { creationSpends: SpendStore }).creationSpends;
}

/** A domain that only looks: no step with a lasting consequence, so no instruction reading, and nothing a Flow could be proposed from. */
const LOOKING: AutomationStudioLlmEvidenceRuntimeBinding = {
  domainId: "example",
  deniedEvidenceKeys: [],
  tools: [{ toolId: "inspect", description: "Inspect one area.", inputSchema: { type: "object" }, effect: "observe" }],
  executeTool: async (input) => ({ area: String(input.value.area) })
};

/** A model that keeps looking while it may, and whose completions are refused once only completing is offered. */
function lookingDecision(request: AutomationStudioLlmTaskRequest, call: number): JsonObject {
  return request.context.evidenceLoop?.tools.length
    ? { kind: "tool_call", callId: `call.${call}`, toolId: "inspect", input: { area: `area.${call}` } }
    : { kind: "complete", result: { summary: "Unfinished.", plan: { ...plan(), subflows: [] } } };
}

function service(provider: AutomationStudioLlmProvider, binding: AutomationStudioLlmEvidenceRuntimeBinding, resolution: Record<string, unknown> = {}): AutomationStudioService {
  const instance = new AutomationStudioService({
    dataDir: tempRoot,
    llmProviderResolver: (() => ({ provider, ...resolution })) as never,
    llmEvidenceRuntime: binding
  });
  services.add(instance);
  return instance;
}

describe("a Flow creation's one purse", () => {
  it("(a) starts a second build where the first stopped on cost: it ends at once on cost and spends nothing more", async () => {
    // Every call is priced at three tenths of the ceiling and costs that: the
    // purse pays for three and refuses the fourth, so the first build stops
    // with nine tenths spent.
    const perCall = CEILING * 0.3;
    const requests: AutomationStudioLlmTaskRequest[] = [];
    const provider: AutomationStudioLlmProvider = {
      ...mockProvider(async (request) => {
        requests.push(request);
        const decision = lookingDecision(request, requests.length);
        return { response: { kind: "evidence_tool_decision", summary: "Looking.", decision }, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: perCall } };
      }),
      estimateCostUsd: () => perCall
    };
    const { project, flow } = structuredClone(await copyDataDirSeed(example, tempRoot));
    const request = { projectId: project.id, flowId: flow.flowId, evidenceGuided: true as const, caller: caller() };

    const first = service(provider, LOOKING);
    const firstEnding = await rejectedGenerationDiagnostic(first.generateFlowBootstrapAdaptation(request));
    expect(firstEnding.code).toBe("flow_bootstrap.evidence_budget_exhausted");
    expect(firstEnding.ending).toMatchObject({ kind: "budget_exhausted", bound: "cost" });
    const firstCalls = requests.length;
    expect(firstCalls).toBe(3);
    await first.close();
    services.delete(first);

    // Building again, in a new process: the purse opens with what the first spent.
    const second = service(provider, LOOKING);
    const secondEnding = await rejectedGenerationDiagnostic(second.generateFlowBootstrapAdaptation(request));
    expect(secondEnding.code).toBe("flow_bootstrap.evidence_budget_exhausted");
    expect(secondEnding.ending).toMatchObject({ kind: "budget_exhausted", bound: "cost" });
    // Not one call was sent: the carried spend leaves nothing for the first.
    expect(requests).toHaveLength(firstCalls);
    // The record carries both builds' spend, which is the first's alone.
    const record = await spends(second).get(project.id, flow.flowId);
    expect(record).toMatchObject({ kind: "flow_creation_spend", projectId: project.id, flowId: flow.flowId, builds: 2 });
    expect(record?.spentUsd).toBeCloseTo(firstCalls * perCall, 10);
    expect(record!.spentUsd).toBeLessThanOrEqual(CEILING);
  }, 30_000);

  it("(b) clears the record when a build proposes a Flow", async () => {
    // The incomplete-draft pattern: the first build runs out of its four calls,
    // the second continues its draft, takes one step and finishes once its test of the whole Flow is judged a success.
    let continuedAt: number | undefined;
    let call = 0;
    const provider = mockProvider(async (request) => {
      if (isJudgeRequest(request)) return judgeReply("yes");
      call += 1;
      const decision: JsonObject = continuedAt !== undefined && call > continuedAt + 1
        ? { kind: "complete", result: { summary: "Built.", plan: plan() } }
        : { kind: "tool_call", callId: `call.${call}`, toolId: "example.act", input: { press: call }, add: true };
      return { response: { kind: "evidence_tool_decision", summary: "Step.", decision }, usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCostUsd: 0.001 } };
    });
    // A stand-in that says how to run its steps again, so the finishing build's test can run the whole Flow from its start.
    const acting: AutomationStudioLlmEvidenceRuntimeBinding = automationStudioReplayingBinding({
      domainId: "example",
      deniedEvidenceKeys: [],
      tools: [{ toolId: "example.act", description: "Change the target.", inputSchema: { type: "object" }, effect: "mutate" }],
      executeTool: async (input) => ({ kind: "llm_evidence_tool_execution", evidence: { changed: input.callId }, effectApplied: true, resultCode: "example.acted" })
    });
    const { project, flow } = structuredClone(await copyDataDirSeed(example, tempRoot));
    const instance = service(provider, acting, { maxCallsPerRun: 4 });
    const request = { projectId: project.id, flowId: flow.flowId, evidenceGuided: true as const, caller: caller() };

    await rejectedGenerationDiagnostic(instance.generateFlowBootstrapAdaptation(request));
    expect(await spends(instance).get(project.id, flow.flowId)).toMatchObject({ builds: 1, spentUsd: expect.any(Number) });

    continuedAt = call;
    const result = await instance.generateFlowBootstrapAdaptation(request);
    expect(result.status).toBe("proposed");
    // The creation is over: nothing is carried into a later build.
    await expect(spends(instance).get(project.id, flow.flowId)).resolves.toBeUndefined();
  }, 30_000);

  it("(c) a refuted-result repair neither reads nor writes the record", async () => {
    const requests: AutomationStudioLlmTaskRequest[] = [];
    const provider = mockProvider(async (request) => {
      requests.push(request);
      return { response: { kind: "evidence_tool_decision", summary: "Looking.", decision: lookingDecision(request, requests.length) }, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.001 } };
    });
    const { project, flow } = structuredClone(await copyDataDirSeed(example, tempRoot));
    const instance = service(provider, LOOKING, { maxCallsPerRun: 2 });
    // A creation that has spent its whole ceiling: a build that read this could send nothing.
    const stored: AutomationStudioFlowBootstrapCreationSpend = { kind: "flow_creation_spend", projectId: project.id, flowId: flow.flowId, spentUsd: CEILING, builds: 3, createdAt: 1_000, updatedAt: 2_000 };
    await spends(instance).save(stored);
    const now = Date.now();
    const brief = {
      schemaVersion: "0.1" as const, instructionId: "instruction.repair", title: "Repair the result", body: "The last run's result was refuted; build the Flow again.",
      scope: { kind: "flow" as const, projectId: project.id, flowId: flow.flowId }, priority: 100, status: "active" as const, requirement: "required" as const, createdAt: now, updatedAt: now
    };
    const repair = (instance as unknown as { generateFlowBootstrapAdaptationInternal: (input: unknown, brief: unknown, costLeftUsd?: number) => Promise<unknown> }).generateFlowBootstrapAdaptationInternal;

    await rejectedGenerationDiagnostic(repair({ projectId: project.id, flowId: flow.flowId, evidenceGuided: true, caller: caller() }, brief, CEILING));

    // It spent from its own ceiling, so it was not stopped by the creation's spend...
    expect(requests.length).toBeGreaterThan(0);
    // ...and left the creation's record as it was.
    await expect(spends(instance).get(project.id, flow.flowId)).resolves.toEqual(stored);
  }, 30_000);

  it("(d) asks each decision for a reply of at most 2,000 tokens, leaving the input and the window as the resolver set them", async () => {
    const decisions: AutomationStudioLlmTaskRequest[] = [];
    const provider = mockProvider(async (request) => {
      if (request.context.evidenceLoop?.tools.length) decisions.push(request);
      return { response: { kind: "evidence_tool_decision", summary: "Looking.", decision: lookingDecision(request, decisions.length) }, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.001 } };
    });
    const defaults = AUTOMATION_STUDIO_SESSION_KEY_PROVIDER_DEFAULTS;
    const { project, flow } = structuredClone(await copyDataDirSeed(example, tempRoot));
    const instance = service(provider, LOOKING, { tokenLimits: { ...defaults.tokenLimits }, maxCallsPerRun: 2 });

    await rejectedGenerationDiagnostic(instance.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, evidenceGuided: true, caller: caller() }));

    expect(AUTOMATION_STUDIO_LLM_DECISION_REPLY_TOKENS).toBe(2_000);
    const resolved = resolveAutomationStudioLlmTokenLimits(defaults.tokenLimits).limits;
    // The resolver's own reply allowance is larger, so the decision's is the one that binds.
    expect(resolved.maxOutputTokens).toBeGreaterThan(AUTOMATION_STUDIO_LLM_DECISION_REPLY_TOKENS);
    expect(decisions.length).toBeGreaterThan(0);
    for (const decision of decisions) {
      expect(decision.tokenLimits).toEqual({ maxInputTokens: resolved.maxInputTokens, maxOutputTokens: 2_000, maxTotalTokens: resolved.maxTotalTokens });
    }
  }, 30_000);

  it("(e) counts the judge's calls against the same purse", async () => {
    const decisionCost = CEILING * 0.01;
    // The judge is asked twice about a "no" (`result-verification/verify.ts`). Its two answers fit, and leave the
    // purse too little for the repair's next decision, which is held at the most any call has reported costing
    // (the mock does not price: `llm/build-purse/purse.ts`).
    const judgeCost = CEILING * 0.4;
    const requests: AutomationStudioLlmTaskRequest[] = [];
    let paid = 0;
    let decided = 0;
    const script: JsonObject[] = [
      { kind: "tool_call", callId: "call.read", toolId: "shop.read", input: { list: "shelf" }, add: true },
      { kind: "complete", result: { summary: "Built.", plan: plan() } }
    ];
    const provider = mockProvider(async (request) => {
      requests.push(request);
      if (isJudgeRequest(request)) {
        paid += judgeCost;
        const reply = judgeReply("no", JUDGE_SAID);
        return { ...reply, usage: { ...reply.usage, estimatedCostUsd: judgeCost } };
      }
      const decision = script[decided++];
      if (!decision) throw new Error(`The model was asked for decision ${decided}; the script has ${script.length}.`);
      paid += decisionCost;
      return { response: { kind: "evidence_tool_decision", summary: "Step.", decision }, usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCostUsd: decisionCost } };
    });
    const { project, flow } = structuredClone(await copyDataDirSeed(example, tempRoot));
    const instance = service(provider, shopBinding(), { maxCallsPerRun: 24 });
    const instruction = await instance.getFlowInstruction(project.id, "instruction.build");
    await instance.saveFlowInstruction(project.id, { ...instruction!, body: "Read the paper towels listed on the shelf, and give me a table of each one's name and price.", updatedAt: Date.now() });

    const ending = await rejectedGenerationDiagnostic(instance.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, evidenceGuided: true, caller: caller() }));

    // The judge was asked, and said no, twice.
    const judged = requests.findIndex(isJudgeRequest);
    expect(judged).toBe(2);
    expect(requests.filter(isJudgeRequest)).toHaveLength(2);
    // Its spend left the purse too little for another call, so no repair decision was sent after it.
    expect(requests.slice(judged + 1).some((request) => !isJudgeRequest(request))).toBe(false);
    expect(ending.code).toBe("flow_bootstrap.evidence_budget_exhausted");
    // What the creation carries is every call the build paid for, the judge's included.
    const record = await spends(instance).get(project.id, flow.flowId);
    expect(paid).toBeGreaterThanOrEqual(judgeCost + 2 * decisionCost);
    expect(record?.spentUsd).toBeCloseTo(paid, 10);
  }, 30_000);

  it("(f) ends on cost, asking nobody, when the purse refuses the instruction reading a lasting step needs", async () => {
    // The press costs the whole ceiling, so the reading of what the
    // instruction permits -- one more call, made when the domain asks before
    // the refund -- cannot be paid for. Read as "the instruction permits
    // nothing", it raised a permission question and ended the build on it.
    const decisions: AutomationStudioLlmTaskRequest[] = [];
    const readings: AutomationStudioLlmTaskRequest[] = [];
    const provider = mockProvider(async (request) => {
      if (!request.context.evidenceLoop?.tools.length) {
        readings.push(request);
        return { response: { kind: "evidence_tool_decision", summary: "Read.", decision: { kind: "complete", result: { consequences: [] } } }, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.001 } };
      }
      decisions.push(request);
      return { response: { kind: "evidence_tool_decision", summary: "Press.", decision: { kind: "tool_call", callId: `call.${decisions.length}`, toolId: "example.press", input: { handle: "refund" }, add: true } }, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: CEILING } };
    });
    const asked: string[] = [];
    const refunding: AutomationStudioLlmEvidenceRuntimeBinding = {
      domainId: "example",
      deniedEvidenceKeys: [],
      tools: [{ toolId: "example.press", description: "Press a control by its handle.", inputSchema: { type: "object" }, effect: "mutate" }],
      executeTool: async (input) => {
        const decision = await input.permission({ consequences: ["move_money"], control: { name: "Refund", kind: "button" }, verb: "press" });
        if (!decision.permitted) {
          asked.push(String(decision.requestId));
          return { kind: "llm_evidence_tool_execution", evidence: { ok: false, code: "permission_required" }, effectApplied: false, resultCode: "example.permission_required" };
        }
        return { kind: "llm_evidence_tool_execution", evidence: { pressed: "Refund" }, effectApplied: true };
      }
    };
    const { project, flow } = structuredClone(await copyDataDirSeed(example, tempRoot));
    const instance = service(provider, refunding);
    const phases: string[] = [];
    const unsubscribe = automationStudioActivityHub.subscribe((event) => phases.push(String(event.phase)));
    onTestFinished(unsubscribe);

    const ending = await rejectedGenerationDiagnostic(instance.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, evidenceGuided: true, caller: caller(), permissionAskTimeoutMs: 60_000 }));

    // The reading was never sent, and nothing after it was.
    expect(readings).toHaveLength(0);
    expect(decisions).toHaveLength(1);
    // The money ran out, and the build says so: never a permission question.
    expect(ending.code).toBe("flow_bootstrap.evidence_budget_exhausted");
    expect(ending.ending).toMatchObject({ kind: "budget_exhausted", bound: "cost" });
    expect(ending.permissionRequest).toBeUndefined();
    // Nobody was asked to wait on an answer.
    expect(phases).not.toContain("waiting_permission");
  }, 30_000);

  // The rule is $0.10 per Flow, and the chat call that decided to build the
  // Flow is part of that Flow's cost (t234 W9): it is made before the Flow
  // exists, so the build is told it and opens its purse with it carried.
  it("(g) opens the purse with the chat's reading of the message carried, and saves it into the record", async () => {
    // Half the ceiling carried, and each call priced at three tenths: one call
    // fits and the second does not. With nothing carried, three would be sent.
    const interpretationCostUsd = CEILING * 0.5;
    const perCall = CEILING * 0.3;
    const requests: AutomationStudioLlmTaskRequest[] = [];
    const provider: AutomationStudioLlmProvider = {
      ...mockProvider(async (request) => {
        requests.push(request);
        return { response: { kind: "evidence_tool_decision", summary: "Looking.", decision: lookingDecision(request, requests.length) }, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: perCall } };
      }),
      estimateCostUsd: () => perCall
    };
    const { project, flow } = structuredClone(await copyDataDirSeed(example, tempRoot));
    const instance = service(provider, LOOKING);

    const ending = await rejectedGenerationDiagnostic(instance.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, evidenceGuided: true, caller: caller(), interpretationCostUsd }));

    expect(ending.code).toBe("flow_bootstrap.evidence_budget_exhausted");
    expect(ending.ending).toMatchObject({ kind: "budget_exhausted", bound: "cost" });
    expect(requests).toHaveLength(1);
    // The record carries the reading with the build's own spend.
    const record = await spends(instance).get(project.id, flow.flowId);
    expect(record).toMatchObject({ kind: "flow_creation_spend", builds: 1 });
    expect(record?.spentUsd).toBeCloseTo(interpretationCostUsd + perCall, 10);
  }, 30_000);

  it("(h) a refuted-result repair ignores the chat's reading of the message", async () => {
    const requests: AutomationStudioLlmTaskRequest[] = [];
    const provider = mockProvider(async (request) => {
      requests.push(request);
      return { response: { kind: "evidence_tool_decision", summary: "Looking.", decision: lookingDecision(request, requests.length) }, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.001 } };
    });
    const { project, flow } = structuredClone(await copyDataDirSeed(example, tempRoot));
    const instance = service(provider, LOOKING, { maxCallsPerRun: 2 });
    const now = Date.now();
    const brief = {
      schemaVersion: "0.1" as const, instructionId: "instruction.repair", title: "Repair the result", body: "The last run's result was refuted; build the Flow again.",
      scope: { kind: "flow" as const, projectId: project.id, flowId: flow.flowId }, priority: 100, status: "active" as const, requirement: "required" as const, createdAt: now, updatedAt: now
    };
    const repair = (instance as unknown as { generateFlowBootstrapAdaptationInternal: (input: unknown, brief: unknown, costLeftUsd?: number) => Promise<unknown> }).generateFlowBootstrapAdaptationInternal;

    // Carried, the whole ceiling would leave the repair nothing to send.
    await rejectedGenerationDiagnostic(repair({ projectId: project.id, flowId: flow.flowId, evidenceGuided: true, caller: caller(), interpretationCostUsd: CEILING }, brief, CEILING));

    expect(requests.length).toBeGreaterThan(0);
    await expect(spends(instance).get(project.id, flow.flowId)).resolves.toBeUndefined();
  }, 30_000);
});

/** What the judge said of the Flow's test (as `./judged-build.test.ts` has it). */
const JUDGE_SAID = {
  expected: "A table of every paper towel on the shelf with its name and price.",
  observed: "The test read one list of two rows; nothing reads the prices of the 12 Rolls pack on its own page.",
  changed: "Open the 12 Rolls pack and read its price as well."
};

/**
 * A stand-in shop (as `./judged-build.test.ts` has it): `shop.read` reads the
 * shelf and is a step a Flow keeps, and replays itself for the Flow's test.
 */
function shopBinding(): AutomationStudioLlmEvidenceRuntimeBinding {
  let page = "shop/home";
  return {
    domainId: "example",
    deniedEvidenceKeys: [],
    tools: [
      { toolId: "shop.look", description: "Look at the page in view.", inputSchema: { type: "object" }, effect: "observe", initialObservation: { input: {} } },
      { toolId: "shop.read", description: "Read the rows of the list in view.", inputSchema: { type: "object" }, effect: "observe" }
    ],
    executeTool: async ({ toolId, value }) => {
      if (typeof value.replay === "string") {
        if (value.replay === "reset") {
          page = String((value.from as JsonObject | undefined)?.location ?? "shop/home");
          return { kind: "llm_evidence_tool_execution", evidence: { page }, effectApplied: true, resultCode: "core.replay.replayed" };
        }
        return { kind: "llm_evidence_tool_execution", evidence: { rows: [{ name: "Towels", price: "$1" }] }, effectApplied: true, resultCode: "core.replay.replayed" };
      }
      if (toolId === "shop.look") return { kind: "llm_evidence_tool_execution", evidence: { page }, effectApplied: false };
      return { kind: "llm_evidence_tool_execution", evidence: { rows: [{ name: "Towels", price: "$1" }] }, effectApplied: true, draft: { effect: "observe", proposes: true, ranWith: { list: String(value.list ?? "shelf") }, replay: { from: { location: page } } } };
    }
  };
}
