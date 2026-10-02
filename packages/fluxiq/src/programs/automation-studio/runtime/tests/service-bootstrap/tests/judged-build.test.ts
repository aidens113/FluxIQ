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
// said, and that a Flow nobody could judge is proposed and said to be
// unverified. Each case here fails if the service stops passing its judge.
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
import type { AutomationStudioLlmEvidenceRuntimeBinding, AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import { AutomationStudioService } from "../../../service.ts";
import { blankFixture, caller, copyDataDirSeed, isJudgeRequest, JUDGE_USAGE, judgeReply, mockProvider, plan, seedDataDir, type DataDirSeed } from "./fixtures.ts";

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
    const run = await build({ instruction: READ_TOWELS, decisions: [read("call.read"), complete()], judge: ["yes"] });
    const result = await run.generation;

    expect(result.status).toBe("proposed");
    // Two decisions, then the judge, once: it said yes, so it was not asked again.
    expect(run.requests.map(isJudgeRequest)).toEqual([false, false, true]);
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
    expect(result.accounting).toMatchObject({ inputTokens: 2 * USAGE.inputTokens + JUDGE_USAGE.inputTokens, totalTokens: 2 * USAGE.totalTokens + JUDGE_USAGE.totalTokens });
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
      judge: ["no", "no", "yes"] as JudgeAnswer[],
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
      // Two noes for the explored Flow, one yes for the repaired one: the last request.
      expect(run.requests.map(isJudgeRequest)).toEqual([false, false, true, true, false, false, false, true]);
      // The yes was about the repaired Flow: its test read again, and pressed the pack it opened.
      const packet = buildTestOf(run.requests.at(-1));
      expect(packet?.steps.filter((item) => item.action === "shop.read")).toHaveLength(2);
      expect(JSON.stringify(packet?.steps)).toContain("ValueRidge Paper Towels, 12 Rolls");
      // The build paid for every judge call.
      expect(result.accounting?.totalTokens).toBe(5 * USAGE.totalTokens + 3 * JUDGE_USAGE.totalTokens);
      expect(activity.some((event) => event.label === "Flow not verified")).toBe(false);
    }, 30_000);
  });

  it("proposes the Flow, said to be unverified, when the build has no cost left to ask the judge", async () => {
    // The completion spends what the build had left of its $0.25.
    const run = await build({ instruction: READ_TOWELS, decisions: [read("call.read"), complete()], judge: [], usage: (decision) => (decision === 1 ? { ...USAGE, estimatedCostUsd: 0.25 } : USAGE) });
    const result = await run.generation;

    expect(result.status).toBe("proposed");
    // Nobody was asked: the judge never reached the provider.
    expect(run.requests.some(isJudgeRequest)).toBe(false);
    // The person is told the Flow was not verified, and why.
    const notVerified = activity.find((event) => event.label === "Flow not verified");
    expect(notVerified).toMatchObject({ phase: "verifying", detail: { kind: "note", title: "Flow not verified" } });
    expect(notVerified?.detail?.text).toContain("no cost left");
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
      judge: ["no", "no", "yes"],
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
