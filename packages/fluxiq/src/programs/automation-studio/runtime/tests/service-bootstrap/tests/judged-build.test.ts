// A Flow the model says is ready is judged, through the real
// `generateFlowBootstrapAdaptation` (t195-w25, phase 2's judge).
//
// The parts are tested where they live: the packet the judge is shown
// (`result-verification/build-test/tests/summary.test.ts`), how its answer is
// read (`.../judge.test.ts`) and what the phases do with a verdict
// (`flow-bootstrap/unfinished-build/tests/judged.test.ts`). What only a service
// can show is that they meet: that the loop's own test of the Flow reaches the
// judge as `buildTest`, that the judge asks through the build's provider and
// the build pays for it, that a `no` becomes a repair round told what the judge
// said, and that a Flow nobody could judge is never proposed: with nothing left
// to pay the judge, the build ends at its budget with the Flow kept (user,
// 2026-10-02). Each case here fails if the service stops passing its judge.
//
// No model is called: the provider is scripted, and the domain is a stand-in
// that runs, replays and checks its steps as the dry run asks it to.
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { automationStudioActivityHub } from "../../../activity/index.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import { AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD, type AutomationStudioLlmEvidenceRuntimeBinding, type AutomationStudioLlmProvider, type AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../native-node-runtime.ts";
import { AutomationStudioService } from "../../../service.ts";
import { automationStudioReplayingBinding } from "../../replaying-binding.ts";
import { blankFixture, caller, copyDataDirSeed, expectNoTopology, isJudgeRequest, JUDGE_USAGE, judgeReply, mockProvider, plan, rejectedGenerationDiagnostic, seedDataDir, type DataDirSeed } from "./fixtures.ts";

const SEEDING_TIMEOUT_MS = 60_000;

let tempRoot: string;
let seedRoot: string;
let example: DataDirSeed<Awaited<ReturnType<typeof blankFixture>>>;
const services = new Set<AutomationStudioService>();
let activity: ClientGatewayActivity[] = [];
let unsubscribe: () => void = () => undefined;

beforeAll(async () => {
  seedRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-bootstrap-judged-seed-"));
  example = await seedDataDir(path.join(seedRoot, "example"), (instance) => blankFixture(instance, "active", "example"));
}, SEEDING_TIMEOUT_MS);

afterAll(async () => {
  if (seedRoot) await rm(seedRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-bootstrap-judged-"));
  activity = [];
  unsubscribe = automationStudioActivityHub.subscribe((event) => activity.push(event));
});

afterEach(async () => {
  unsubscribe();
  await Promise.all([...services].map((instance) => instance.close()));
  services.clear();
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

const USAGE = { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCostUsd: 0.001 };

const READ_TOWELS = "Read the paper towels listed on the shelf, and give me a table of each one's name and price.";

/** What the shelf shows while the build explores, and what the Flow's own test reads from it: told apart, so a judge shown the test's rows is plainly shown the test. */
const EXPLORED_ROWS = [{ name: "ValueRidge Paper Towels, 6 Rolls", price: "$8.97" }];
const TESTED_ROWS = [{ name: "ValueRidge Paper Towels, 6 Rolls", price: "$8.97" }, { name: "ValueRidge Paper Towels, 12 Rolls", price: "$16.47" }];

/**
 * Lane A's run 40 instruction (`run-muq6lqnw-fdfa7aac`), as
 * `result-verification/build-test/tests/live-run-drafts.ts` keeps it.
 */
const PICKUP_CART = "Switch my pickup store to Millbrook Crossing Supercenter, then add two packs of the ValueRidge Essentials Select-A-Size Paper Towels in the 12 Double Rolls size and one pack of the ValueRidge Everyday Dinner Napkins in the 250 Count size to my cart, both for pickup. Keep what is already in my cart as it is, and do not check out.";

type Usage = typeof USAGE;
type JudgeAnswer = "yes" | "no" | "unknown";

/**
 * One build: the model answers with each decision in turn, and the judge of
 * each finished round's test with each answer in turn, both through the one
 * provider the build resolved. A request the script has no answer for fails
 * the build, so a test can never pass on an extra call it did not expect.
 */
async function build(script: {
  instruction: string;
  decisions: JsonObject[];
  judge: JudgeAnswer[];
  judgeSaid?: Record<string, string>;
  /** What each decision cost, by its index; `USAGE` where absent. */
  usage?: (decision: number) => Usage;
}) {
  const requests: AutomationStudioLlmTaskRequest[] = [];
  let decided = 0;
  let judged = 0;
  const provider = mockProvider(async (request) => {
    // The build's one read of the instruction is not a model decision of the script: it answers that nothing
    // lasting is asked for, so no step is checked for it. Since t174-w89 it is made before the first test,
    // which needs it (`service/instruction-authority.ts`); it used to be made only after the build.
    if (request.metadata?.source === "instructionAuthority") {
      return { response: { kind: "evidence_tool_decision", summary: "Read.", decision: { kind: "complete", result: { instructed: [] } } }, usage: USAGE };
    }
    requests.push(request);
    if (isJudgeRequest(request)) {
      const answer = script.judge[judged++];
      if (!answer) throw new Error(`The judge was asked ${judged} times; the script answers ${script.judge.length}.`);
      return judgeReply(answer, answer === "yes" ? {} : script.judgeSaid ?? {});
    }
    const decision = script.decisions[decided];
    if (!decision) throw new Error(`The model was asked for decision ${decided + 1}; the script has ${script.decisions.length}.`);
    const usage = script.usage?.(decided) ?? USAGE;
    decided += 1;
    return { response: { kind: "evidence_tool_decision", summary: "Step.", decision }, usage };
  });
  const shop = shopBinding();
  const { project, flow } = structuredClone(await copyDataDirSeed(example, tempRoot));
  const instance = new AutomationStudioService({
    dataDir: tempRoot,
    llmProviderResolver: (() => ({ provider, maxCallsPerRun: 24, maxEstimatedCostUsd: 0.25 })) as never,
    llmEvidenceRuntime: shop.binding
  });
  services.add(instance);
  const instruction = await instance.getFlowInstruction(project.id, "instruction.build");
  await instance.saveFlowInstruction(project.id, { ...instruction!, body: script.instruction, updatedAt: Date.now() });
  const generation = instance.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, evidenceGuided: true, caller: caller() });
  return { instance, project, flow, requests, replays: shop.replays, generation };
}

/**
 * The stand-in shop. `shop.read` reads the shelf and is a step a Flow keeps;
 * `shop.type` and `shop.press` act. Each call declares the step it is -- what
 * it ran with, and the page it found -- so the build's own test can run the
 * Flow again from its start: a read is read again, a press that changes the
 * cart (`modify_existing`) is only checked, and anything else is run again.
 */
function shopBinding(): { binding: AutomationStudioLlmEvidenceRuntimeBinding; replays: JsonObject[] } {
  const replays: JsonObject[] = [];
  let page = "shop/home";
  const from = () => ({ location: page });
  const binding: AutomationStudioLlmEvidenceRuntimeBinding = {
    domainId: "example",
    deniedEvidenceKeys: [],
    tools: [
      { toolId: "shop.look", description: "Look at the page in view.", inputSchema: { type: "object" }, effect: "observe", initialObservation: { input: {} } },
      { toolId: "shop.read", description: "Read the rows of the list in view.", inputSchema: { type: "object" }, effect: "observe" },
      { toolId: "shop.type", description: "Type text into a field.", inputSchema: { type: "object" }, effect: "mutate" },
      { toolId: "shop.press", description: "Press a control by its name.", inputSchema: { type: "object" }, effect: "mutate" }
    ],
    executeTool: async ({ toolId, value }) => {
      if (typeof value.replay === "string") {
        replays.push({ toolId, ...value });
        if (value.replay === "reset") {
          page = String((value.from as JsonObject | undefined)?.location ?? "shop/home");
          return { kind: "llm_evidence_tool_execution", evidence: { page }, effectApplied: true, resultCode: "core.replay.replayed" };
        }
        if (value.replay === "verify") return { kind: "llm_evidence_tool_execution", evidence: { control: String(value.control), there: true }, effectApplied: false, resultCode: "core.replay.verified" };
        if (toolId === "shop.read") return { kind: "llm_evidence_tool_execution", evidence: { rows: TESTED_ROWS }, effectApplied: true, resultCode: "core.replay.replayed" };
        return { kind: "llm_evidence_tool_execution", evidence: { done: true }, effectApplied: true, resultCode: "core.replay.replayed" };
      }
      if (toolId === "shop.look") return { kind: "llm_evidence_tool_execution", evidence: { page }, effectApplied: false };
      if (toolId === "shop.read") {
        const ranWith: JsonObject = { list: String(value.list ?? "shelf") };
        return { kind: "llm_evidence_tool_execution", evidence: { rows: EXPLORED_ROWS }, effectApplied: true, draft: { effect: "observe", proposes: true, ranWith, replay: { from: from() } } };
      }
      const found = from();
      const ranWith: JsonObject = { ...value };
      if (toolId === "shop.press") page = `shop/${String(value.control).toLowerCase().replace(/[^a-z0-9]+/gu, "-")}`;
      return { kind: "llm_evidence_tool_execution", evidence: { page }, effectApplied: true, draft: { ranWith, replay: { from: found } } };
    }
  };
  return { binding, replays };
}

const read = (call: string): JsonObject => ({ kind: "tool_call", callId: call, toolId: "shop.read", input: { list: "shelf" }, add: true });
const complete = (acts?: JsonObject[]): JsonObject => ({ kind: "complete", result: { summary: "Built.", plan: plan(), ...(acts ? { acts } : {}) } });

/** The build-test packet a judge request carries. */
function buildTestOf(request: AutomationStudioLlmTaskRequest | undefined) {
  return request?.context.resultSummary?.buildTest;
}

/** The entry a round's first decision is opened with, when it is a repair. */
function resumedEntry(request: AutomationStudioLlmTaskRequest | undefined): JsonObject | undefined {
  return request?.context.evidenceLoop?.evidence.find((entry) => entry.toolId === "core.resumed")?.value as JsonObject | undefined;
}

describe("a Flow the model says is ready", () => {
  it("reaches the judge, which is shown what the Flow's own test observed", async () => {
    const run = await build({ instruction: READ_TOWELS, decisions: [read("call.read"), complete()], judge: ["yes", "yes"] });
    const result = await run.generation;

    expect(result.status).toBe("proposed");
    // Two decisions, then the judge twice: a yes finishes the build, so it is confirmed by a second call (murwcmx2, C-H).
    expect(run.requests.map(isJudgeRequest)).toEqual([false, false, true, true]);
    const judge = run.requests[2]!;
    expect(judge).toMatchObject({ taskKind: "loop_verification", expectedOutput: "diagnosis" });
    // The judge read the test that ran the Flow from its start: the rows the test read, never the ones the exploration saw.
    const packet = buildTestOf(judge);
    expect(packet).toMatchObject({ kind: "build_test", test: "ran" });
    const step = packet?.steps.find((item) => item.action === "shop.read");
    expect(step).toMatchObject({ outcome: "replayed", observed: { rows: TESTED_ROWS } });
    expect(run.replays.map((call) => `${String(call.toolId)}:${String(call.replay)}`)).toEqual(["shop.read:reset", "shop.read:step"]);
    // The judge is asked about the Flow's instruction, and the build pays for it.
    expect(JSON.stringify(judge.context.instructions)).toContain("paper towels listed on the shelf");
    expect(result.accounting).toMatchObject({ inputTokens: 2 * USAGE.inputTokens + 2 * JUDGE_USAGE.inputTokens, totalTokens: 2 * USAGE.totalTokens + 2 * JUDGE_USAGE.totalTokens });
    // Judged yes: said as judged, never as unverified.
    expect(activity.some((event) => event.label === "Judging the Flow")).toBe(true);
    expect(activity.some((event) => event.label === "Flow not verified")).toBe(false);
  }, 30_000);

  describe("judged no, twice", () => {
    const said = {
      expected: "A table of every paper towel on the shelf with its name and price.",
      observed: "The test read one list of two rows; nothing reads the prices of the 12 Rolls pack on its own page.",
      changed: "Open the 12 Rolls pack and read its price as well."
    };
    const script = () => ({
      instruction: READ_TOWELS,
      // The exploration's read and completion; then the repair's own read, and its completion.
      decisions: [read("call.read"), complete(), { kind: "tool_call", callId: "call.open", toolId: "shop.press", input: { control: "ValueRidge Paper Towels, 12 Rolls" }, add: true }, read("call.read.again"), complete()],
      judge: ["no", "no", "yes", "yes"] as JudgeAnswer[],
      judgeSaid: said
    });

    it("starts a repair round whose first decision carries what the judge observed and advised", async () => {
      const run = await build(script());
      await run.generation;

      // The exploration's two decisions, the judge asked twice (a no is asked again), then the repair.
      expect(run.requests.slice(0, 4).map(isJudgeRequest)).toEqual([false, false, true, true]);
      const repairOpens = run.requests[4];
      expect(isJudgeRequest(repairOpens!)).toBe(false);
      expect(resumedEntry(repairOpens)).toMatchObject({
        code: "llm_evidence_loop.repair",
        stopped: "judged_wrong",
        judgement: { judge: { verdict: "no", expected: said.expected, observed: said.observed, advice: said.changed } }
      });
      // The judge's words reached the model in the repair, and in no decision before it.
      expect(run.requests.slice(0, 2).some((request) => JSON.stringify(request).includes(said.observed))).toBe(false);
      expect(activity.some((event) => event.label === "Repairing the Flow")).toBe(true);
    }, 30_000);

    it("proposes the repaired Flow once the judge answers yes", async () => {
      const run = await build(script());
      const result = await run.generation;

      expect(result.status).toBe("proposed");
      // Two noes for the explored Flow, a yes for the repaired one and its confirmation: the last requests.
      expect(run.requests.map(isJudgeRequest)).toEqual([false, false, true, true, false, false, false, true, true]);
      // The yes was about the repaired Flow: its test read again, and pressed the pack it opened.
      const packet = buildTestOf(run.requests.at(-1));
      expect(packet?.steps.filter((item) => item.action === "shop.read")).toHaveLength(2);
      expect(JSON.stringify(packet?.steps)).toContain("ValueRidge Paper Towels, 12 Rolls");
      // The build paid for every judge call.
      expect(result.accounting?.totalTokens).toBe(5 * USAGE.totalTokens + 4 * JUDGE_USAGE.totalTokens);
      expect(activity.some((event) => event.label === "Flow not verified")).toBe(false);
    }, 30_000);
  });

  it("ends at its budget with the Flow kept, never proposed unjudged, when the build has no cost left to ask the judge", async () => {
    // The completion spends all the build had: its run cost ceiling.
    const run = await build({ instruction: READ_TOWELS, decisions: [read("call.read"), complete()], judge: [], usage: (decision) => (decision === 1 ? { ...USAGE, estimatedCostUsd: AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD } : USAGE) });
    const diagnostic = await rejectedGenerationDiagnostic(run.generation);

    // A build finishes only on a judged success of the Flow as it stands (user, 2026-10-02): unjudged, it is never proposed.
    // Nobody was asked -- the judge never reached the provider -- and no repair could be paid for, so the build ends at its budget.
    expect(run.requests.some(isJudgeRequest)).toBe(false);
    expect(diagnostic.code).toBe("flow_bootstrap.evidence_budget_exhausted");
    expect(diagnostic.ending).toMatchObject({ kind: "budget_exhausted", bound: "cost", tried: { rounds: 1, stepsInFlow: 1, tested: "replayed_clean" } });
    // The person is told the Flow ran but was not judged, and that it was kept.
    expect(diagnostic.ending?.message).toContain("not judged");
    expect(diagnostic.ending?.message).toContain("The Flow so far was kept as a draft");
    expect(diagnostic.evidenceLoop?.incompleteDraft).toMatchObject({ revision: 1, steps: 1 });
    await expectNoTopology(run.instance, run.project.id, run.flow.flowId);
    expect(activity.some((event) => event.label === "Flow not verified")).toBe(false);
  }, 30_000);
});

describe("lane A's run 40: the napkins claimed on the towels' Add to cart", () => {
  const press = (call: string, control: string, extra: JsonObject = {}): JsonObject => ({ kind: "tool_call", callId: call, toolId: "shop.press", input: { control, ...extra }, add: true });
  const type = (call: string, text: string): JsonObject => ({ kind: "tool_call", callId: call, toolId: "shop.type", input: { field: "Search", text }, add: true });
  const towels = [
    press("call.store", "Set as my store", { store: "Millbrook Crossing Supercenter", consequences: ["modify_existing"] }),
    type("call.type", "ValueRidge Select-A-Size Paper Towels"),
    press("call.search", "Search"),
    press("call.product", "ValueRidge Essentials Select-A-Size Paper Towels"),
    press("call.size", "12 Double Rolls"),
    press("call.add", "Add to cart", { consequences: ["modify_existing"] })
  ];
  // Run 40's claims: the store on the store step, and both adds -- the napkins' among them -- on the towels' one Add.
  // Positions as the draft numbers them: the free look is 1, so the store is 2 and the towels' Add is 7.
  const claims = [{ action: "a1", step: "2" }, { action: "a2", step: "7" }, { action: "a3", step: "7" }];
  const napkins = [
    type("call.type.napkins", "ValueRidge Everyday Dinner Napkins"),
    press("call.search.napkins", "Search"),
    press("call.product.napkins", "ValueRidge Everyday Dinner Napkins"),
    press("call.size.napkins", "250 Count"),
    press("call.add.napkins", "Add to cart", { consequences: ["modify_existing"] })
  ];
  const said = {
    observed: "No step searches for or adds the napkins; the one Add to cart is on the towels' page.",
    changed: "Search the napkins, choose 250 Count and add them to the cart."
  };

  it("is no longer refused at completion: it reaches the judge, whose packet shows no step naming the napkins", async () => {
    const run = await build({
      instruction: PICKUP_CART,
      decisions: [...towels, complete(claims), ...napkins, complete([...claims.slice(0, 2), { action: "a3", step: "12" }])],
      judge: ["no", "no", "yes", "yes"],
      judgeSaid: said
    });
    const result = await run.generation;

    // The first completion was accepted as it came: the request after it is the judge, not a refusal fed back to the model.
    expect(run.requests.slice(0, 8).map(isJudgeRequest)).toEqual([false, false, false, false, false, false, false, true]);
    expect(run.requests.slice(0, 8).some((request) => request.context.evidenceLoop?.evidence.some((entry) => entry.toolId === "core.completion_check"))).toBe(false);
    // What the judge was shown: every step the Flow takes, in its own words, and none of them names the napkins.
    const packet = buildTestOf(run.requests[7]);
    expect(packet?.steps).toHaveLength(6);
    // The build's own act check still sees the fault it used to refuse for -- the napkins' add claimed on the
    // towels' Add, which a2 already claims -- and passes it to the judge as information.
    expect(packet?.missingActs).toMatchObject({ acts: expect.arrayContaining([expect.objectContaining({ id: "a3", step: "7", reason: expect.stringMatching(/^step_(?:claimed_twice|acts_on_another_object)$/u) })]) });
    expect(JSON.stringify(packet?.steps)).toContain("Add to cart");
    expect(JSON.stringify(packet?.steps)).toMatch(/Select-A-Size Paper Towels/u);
    expect(JSON.stringify(packet?.steps)).not.toMatch(/napkin/iu);
    // The Add was only checked by the test, never pressed again: once in this test, then each Add in the repair's.
    expect(packet?.steps.at(-1)).toMatchObject({ outcome: "verified" });
    expect(run.replays.filter((call) => call.control === "Add to cart").map((call) => call.replay)).toEqual(["verify", "verify", "verify"]);

    // The judge's no was repaired from what it said, and the repaired Flow -- which does add the napkins -- was proposed on its yes.
    expect(resumedEntry(run.requests[9])).toMatchObject({ judgement: { judge: { verdict: "no", observed: said.observed, advice: said.changed } } });
    expect(result.status).toBe("proposed");
    expect(isJudgeRequest(run.requests.at(-1)!)).toBe(true);
    expect(JSON.stringify(buildTestOf(run.requests.at(-1))?.steps)).toContain("ValueRidge Everyday Dinner Napkins");
  }, 60_000);
});

// A round the judging reserve stopped (t254 stage 2, decision 4). The phases'
// part is tested where it lives (`flow-bootstrap/unfinished-build/tests/reserve-judging.test.ts`);
// what only a service shows is that it meets the build's wiring: the Flow so far
// is tested with the judge reading that test, the completion check writes it as
// the plan built, and a yes proposes it. The provider is priced at a flat rate
// per token so the purse keeps a judging reserve, and the stand-in's steps are
// nodes of its library, so the draft is the Flow's own steps.
const RESERVE_READ_ID = "domain.example.read";
/** One dollar per million tokens, in and out: a decision is held at about a cent. */
const RESERVE_PER_TOKEN_USD = 1e-6;
const RESERVE_SAID = { observed: "The test read the rows, but no price column was read.", changed: "Read the price of each row as well." };

function reserveDefinition(id: string, label: string): AutomationStudioNodeDefinition {
  return {
    schemaVersion: "0.1", id, version: "1.0.0", label, description: `${label} in the active target.`, category: "action",
    source: { kind: "importer", domainId: "example", packageId: "example.package", implementationKey: id },
    availability: { kind: "domain", domainId: "example" },
    requiredRuntimeCapabilities: ["example.actions"],
    capabilities: { executable: true, codeBacked: true },
    inputs: [{ id: "in", label: "In", valueType: "any", required: false }],
    outputs: [{ id: "success", label: "Success", valueType: "any" }],
    parameters: [{ id: "where", label: "Where", valueType: "string", required: false }],
    outputAction: { fixedOutputId: id }
  };
}

function reserveRuntime() {
  return new AutomationStudioNativeNodeRuntime({ permissions: [], runtimeCapabilities: ["example.actions"] }).register({
    schemaVersion: "0.1", sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, packageId: "example.package", packageVersion: "1.0.0", domainId: "example",
    nodes: [reserveDefinition(RESERVE_READ_ID, "Read")]
  }, { packageId: "example.package", packageVersion: "1.0.0", implementations: { [RESERVE_READ_ID]: () => ({ status: "success", route: "success", outputs: { success: true } }) } });
}

/** The domain: one free look, and the ability to run a node of its library. */
function reserveBinding(): AutomationStudioLlmEvidenceRuntimeBinding {
  return {
    domainId: "example",
    deniedEvidenceKeys: [],
    tools: [{ toolId: "example.inspect", description: "Inspect what is in view.", inputSchema: { type: "object" }, effect: "observe", initialObservation: { input: {} } }],
    runsNodes: {},
    executeTool: async ({ toolId, value }) => toolId === "core.run_node"
      ? { kind: "llm_evidence_tool_execution" as const, evidence: { ran: String(value.node), rows: ["Paper towels"] }, effectApplied: true, draft: { actionId: String(value.node), input: value, proposes: true } }
      : { rows: ["Paper towels"] }
  };
}

/**
 * A build whose first decision runs the read and costs $0.07, so its second
 * does not fit beside the judging kept back; the judge answers `judge` in turn.
 *
 * The build's total is $0.10, set by the resolver's own total. It used to be
 * the run cost ceiling's default; since t261 (2026-10-03) the ordinary default
 * is $0.25 and $0.10 binds only a Lab-scoped runtime, under which a second
 * decision fits beside the reserve and the scenario is a different one.
 */
async function reserveBuild(judge: Array<"yes" | "no">) {
  const runtime = reserveRuntime();
  const requests: AutomationStudioLlmTaskRequest[] = [];
  const evidenceRuntime = automationStudioReplayingBinding(reserveBinding());
  let decided = 0;
  let judged = 0;
  const scripted = mockProvider(async (request) => {
    if (request.metadata?.source === "instructionAuthority") {
      return { response: { kind: "evidence_tool_decision", summary: "Read.", decision: { kind: "complete", result: { instructed: [] } } }, usage: USAGE };
    }
    requests.push(request);
    if (isJudgeRequest(request)) {
      const answer = judge[judged++];
      if (!answer) throw new Error(`The judge was asked ${judged} times; the script answers ${judge.length}.`);
      return judgeReply(answer, answer === "yes" ? {} : RESERVE_SAID);
    }
    decided += 1;
    if (decided > 1) throw new Error("Only the first decision fits beside the judging kept back.");
    return { response: { kind: "evidence_tool_decision", summary: "Read the rows.", decision: { kind: "tool_call", callId: "call.read", toolId: "core.run_node", input: { node: RESERVE_READ_ID, parameters: { where: "rows" }, consequences: [] }, add: true } }, usage: { ...USAGE, estimatedCostUsd: 0.07 } };
  });
  const provider: AutomationStudioLlmProvider = { ...scripted, estimateCostUsd: ({ inputTokens, outputTokens }) => (inputTokens + outputTokens) * RESERVE_PER_TOKEN_USD };
  const instance = new AutomationStudioService({
    dataDir: tempRoot,
    llmProviderResolver: (() => ({ provider, tokenLimits: { maxInputTokens: 992_000, maxOutputTokens: 8_000, maxTotalTokens: 1_000_000 }, maxCallsPerRun: 24, maxEstimatedCostUsd: 0.1, maxTotalEstimatedCostUsd: 0.1, timeoutMs: 20_000 })) as never,
    llmEvidenceRuntime: evidenceRuntime
  });
  instance.bindNativeNodeRuntime(runtime);
  services.add(instance);
  const project = await instance.createProject({ name: "Reserve", domainId: "example" });
  const flow = await instance.createFlow({ projectId: project.id, flowId: "flow.reserve", name: "Catalog" });
  const now = Date.now();
  await instance.saveFlowInstruction(project.id, {
    schemaVersion: "0.1", instructionId: "instruction.reserve", title: "Read the catalog", body: "Read the rows the catalog lists.",
    scope: { kind: "flow", projectId: project.id, flowId: flow.flowId }, priority: 100, status: "active", requirement: "required", createdAt: now, updatedAt: now
  });
  const generation = instance.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, evidenceGuided: true, caller: caller() });
  return { instance, project, flow, requests, replays: evidenceRuntime.replays, generation };
}

describe("a build the judging reserve stopped, through the service (t254 stage 2)", () => {
  it("tests the Flow so far for the judge and proposes it, written from the draft, when the judge says yes", async () => {
    const run = await reserveBuild(["yes", "yes"]);
    const result = await run.generation;

    expect(result.status).toBe("proposed");
    // One decision, the second refused beside the reserve; then the judge twice about the Flow so far.
    expect(run.requests.map(isJudgeRequest)).toEqual([false, true, true]);
    // The judge read the phases' own test of that Flow, run from its start.
    expect(run.replays.filter((call) => call.value.replay !== "reset").map((call) => call.value.node)).toEqual([RESERVE_READ_ID]);
    expect(run.requests[1]?.context.resultSummary?.buildTest).toMatchObject({ kind: "build_test", test: "ran" });
    // The plan built is the draft's: the read it ran.
    const record = (await run.instance.getFlowBootstrapAdaptation(run.project.id, run.flow.flowId, result.adaptationId))!;
    expect(record.topology.subflows[0]!.graphFlow.nodes.map((node) => node.definitionId)).toEqual([RESERVE_READ_ID]);
  }, 60_000);

  it("ends at its budget with the judge's findings and the Flow kept as a draft when the judge says no", async () => {
    const run = await reserveBuild(["no", "no"]);
    const diagnostic = await rejectedGenerationDiagnostic(run.generation);

    expect(run.requests.map(isJudgeRequest)).toEqual([false, true, true]);
    expect(diagnostic.code).toBe("flow_bootstrap.evidence_budget_exhausted");
    expect(diagnostic.ending).toMatchObject({ kind: "budget_exhausted", bound: "cost" });
    expect(diagnostic.ending?.message).toContain("went on testing and judging the Flow as it stood");
    expect(diagnostic.ending?.message).toContain(`The judge found: ${RESERVE_SAID.observed.replace(/\.$/u, "")}.`);
    expect(diagnostic.ending?.message).toContain(`What the judge says is left to change: "${RESERVE_SAID.changed.replace(/\.$/u, "")}".`);
    expect(diagnostic.ending?.message).toContain("The Flow so far was kept as a draft");
  }, 60_000);
});
