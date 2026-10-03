// "Confirm every friend request with 5 or more mutual friends", built end to
// end through the service, with no model (t252, phase P3 proof).
//
// **Why (live run `run-murwcaj0-40e56557`, lane D).** The build pressed one
// row's Confirm while exploring, a row its own listing excluded; its test sent
// that one press again and found it gone, and the judge read a Flow that
// "confirms only" that row. The stored Flow's loop would have scoped each pass
// to its row, but nothing ever ran it. Since t252 the build's test runs a
// repeat as the Flow does -- once per row its listing returned in the test,
// each pass with that row as `item` and its `$row` bindings resolved -- and a
// step may be written (`core.run_node` with `write: true`) rather than done.
//
// The parts are tested where they live (`llm/node-tools/tests/replay-draft-loop.test.ts`,
// `flow-bootstrap/authoring/tests/draft-bindings.test.ts`). Only a service shows
// they meet: the service hands its node lookup (`nodeOf`) to the build's test,
// the judge reads one pass per kept row, and the stored Flow walks the rows.
// Without `nodeOf` the main case fails: the test sends the Confirm no times.
//
// No model is called: the provider is scripted, and the domain is a stand-in
// that lists eight requests, runs and writes the two nodes, and replays them.
// Here rather than in `../../service-bootstrap/tests/`, which is at its file limit.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import type { AutomationStudioActionDeclaration } from "../../../action-permissions/index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding, AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../native-node-runtime.ts";
import { AutomationStudioService } from "../../../service.ts";
import { blankFixture, caller, copyDataDirSeed, expectNoTopology, isJudgeRequest, judgeReply, mockProvider, rejectedGenerationDiagnostic, seedDataDir, type DataDirSeed } from "../../service-bootstrap/tests/fixtures.ts";

const TIMEOUT_MS = 60_000;

const INSTRUCTION = "Confirm every friend request with 5 or more mutual friends.";
const LIST_ID = "domain.example.friend-requests";
const CONFIRM_ID = "domain.example.confirm-request";
const WHERE = "mutual friends at least 5";
const LOCATION = { location: "https://friends.test/requests" };

type Request = { name: string; mutual: string; count: number };

/** The eight requests on the page, three with 5 or more mutual friends. Tom Becker is the row lane D's build pressed. */
const REQUESTS: Request[] = [
  { name: "Tom Becker", mutual: "1 mutual friend", count: 1 },
  { name: "Ana Ruiz", mutual: "7 mutual friends", count: 7 },
  { name: "Jonas Weber", mutual: "2 mutual friends", count: 2 },
  { name: "Aisha Khan", mutual: "5 mutual friends", count: 5 },
  { name: "Lena Fischer", mutual: "No mutual friends", count: 0 },
  { name: "Mateo Silva", mutual: "12 mutual friends", count: 12 },
  { name: "Priya Nair", mutual: "3 mutual friends", count: 3 },
  { name: "Omar Haddad", mutual: "4 mutual friends", count: 4 }
];
const row = (request: Request): JsonObject => ({ name: request.name, mutual: request.mutual });
const KEPT = REQUESTS.filter((request) => request.count >= 5).map(row);
const KEPT_NAMES = KEPT.map((kept) => String(kept.name));
const EXCLUDED_NAMES = REQUESTS.filter((request) => request.count < 5).map((request) => request.name);
/** The kept row the build explored on: the one a recorded Confirm ran live on. */
const EXPLORED = "Aisha Khan";

let tempRoot: string;
let seedRoot: string;
let example: DataDirSeed<Awaited<ReturnType<typeof blankFixture>>>;
const services = new Set<AutomationStudioService>();

beforeAll(async () => {
  seedRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-authoring-confirm-seed-"));
  example = await seedDataDir(path.join(seedRoot, "example"), (instance) => blankFixture(instance, "active", "example"));
}, TIMEOUT_MS);

afterAll(async () => {
  if (seedRoot) await rm(seedRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-authoring-confirm-"));
});

afterEach(async () => {
  await Promise.all([...services].map((instance) => instance.close()));
  services.clear();
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

function node(id: string, label: string, ports: Pick<AutomationStudioNodeDefinition, "inputs" | "outputs" | "parameters">): AutomationStudioNodeDefinition {
  return {
    schemaVersion: "0.1",
    id,
    version: "1.0.0",
    label,
    description: `${label} on the friend requests page.`,
    category: "action",
    source: { kind: "importer", domainId: "example", packageId: "example.package", implementationKey: id },
    availability: { kind: "domain", domainId: "example" },
    requiredRuntimeCapabilities: ["example.actions"],
    capabilities: { executable: true, codeBacked: true },
    ...ports,
    outputAction: { fixedOutputId: id }
  };
}

/**
 * The two nodes, as the build's `nodeOf` reads them: a list whose rows leave
 * on an array port, and a Confirm that takes the row a loop pass is on
 * (`item`) and names the request it confirms (`person`).
 */
function nativeRuntime() {
  return new AutomationStudioNativeNodeRuntime({ permissions: [], runtimeCapabilities: ["example.actions"] }).register({
    schemaVersion: "0.1",
    sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION,
    packageId: "example.package",
    packageVersion: "1.0.0",
    domainId: "example",
    nodes: [
      node(LIST_ID, "List friend requests", {
        inputs: [{ id: "in", label: "In", valueType: "any", required: false }],
        outputs: [{ id: "records", label: "Requests", valueType: "array" }, { id: "success", label: "Success", valueType: "any" }],
        parameters: [{ id: "where", label: "Where", valueType: "string", required: false }]
      }),
      node(CONFIRM_ID, "Confirm request", {
        inputs: [{ id: "in", label: "In", valueType: "any", required: false }, { id: "item", label: "Row", valueType: "object", required: false }],
        outputs: [{ id: "success", label: "Success", valueType: "any" }],
        parameters: [{ id: "person", label: "Person", valueType: "string", required: true }]
      })
    ]
  }, {
    packageId: "example.package",
    packageVersion: "1.0.0",
    implementations: {
      [LIST_ID]: () => ({ status: "success", route: "success", outputs: { records: KEPT, success: true } }),
      [CONFIRM_ID]: () => ({ status: "success", route: "success", outputs: { success: true } })
    }
  });
}

/** One call the domain received, as it came. */
type Call = { callId: string; toolId: string; value: JsonObject };

/**
 * The stand-in friends page. A look shows the eight requests. `core.run_node`
 * runs the list (its `where` keeps the rows with 5 or more mutual friends) or
 * presses one request's Confirm, asking the build's gate first; with `write:
 * true` it checks and freezes the step and does nothing. A replay is answered
 * as the web domain answers one: the list read again with its kept rows on
 * `outputs.records` and their labels on `readRows`, a lasting Confirm checked
 * (`verify`) and never pressed, any other step run again.
 */
function friendsDomain(options: { tested: JsonObject[] }) {
  const calls: Call[] = [];
  const pressed: string[] = [];
  const declared: { nodeDefinitionId: string; parameters: JsonObject; declaredConsequences?: readonly string[] }[] = [];
  const keptOf = (where: JsonValue | undefined, rows: JsonObject[]) => (where === WHERE ? rows : REQUESTS.map(row));
  const ranWith = (value: JsonObject): JsonObject => ({ node: value.node!, parameters: value.parameters ?? {}, consequences: value.consequences ?? [] });
  const confirmDeclaration = (consequences: JsonValue | undefined): AutomationStudioActionDeclaration => ({
    consequences: (Array.isArray(consequences) ? consequences : []) as AutomationStudioActionDeclaration["consequences"],
    control: { name: "Confirm", kind: "button" },
    verb: "press",
    effect: "mutate"
  });
  const binding: AutomationStudioLlmEvidenceRuntimeBinding = {
    domainId: "example",
    deniedEvidenceKeys: [],
    tools: [{ toolId: "friends.look", description: "Look at the friend requests page.", inputSchema: { type: "object" }, effect: "observe", initialObservation: { input: {} } }],
    runsNodes: {},
    executeTool: async ({ callId, toolId, value, permission }) => {
      calls.push({ callId, toolId, value: structuredClone(value) });
      if (toolId === "friends.look") return { kind: "llm_evidence_tool_execution", evidence: { page: "Friend requests", requests: REQUESTS.map(row) }, effectApplied: false };
      const isList = value.node === LIST_ID;
      if (typeof value.replay === "string") {
        if (value.replay === "reset") return { kind: "llm_evidence_tool_execution", evidence: { page: "Friend requests" }, effectApplied: true, resultCode: "core.replay.replayed" };
        if (isList) {
          const rows = keptOf((value.parameters as JsonObject | undefined)?.where, options.tested);
          return { kind: "llm_evidence_tool_execution", evidence: { said: `${rows.length} requests kept`, readRows: { rows: rows.map((kept) => ({ name: kept.name! })) } }, effectApplied: true, resultCode: "core.replay.replayed", outputs: { records: rows } };
        }
        const person = String((value.parameters as JsonObject | undefined)?.person);
        if (value.replay === "verify") {
          // Checked as the web domain checks: the gate is asked for a check that declares nothing.
          await permission({ consequences: [], control: { name: "Confirm", kind: "step" }, verb: "check", effect: "observe" });
          return { kind: "llm_evidence_tool_execution", evidence: { checked: person, there: true }, effectApplied: false, resultCode: "core.replay.verified" };
        }
        return { kind: "llm_evidence_tool_execution", evidence: { confirmed: person }, effectApplied: true, resultCode: "core.replay.replayed" };
      }
      if (value.write === true) {
        return {
          kind: "llm_evidence_tool_execution", evidence: { written: String(value.node) }, effectApplied: false, resultCode: "core.run_node.written",
          draft: { actionId: String(value.node), input: value, ranWith: ranWith(value), effect: isList ? "observe" : "mutate", proposes: true, written: true, replay: { from: LOCATION } }
        };
      }
      if (isList) {
        const rows = keptOf((value.parameters as JsonObject | undefined)?.where, options.tested);
        return {
          kind: "llm_evidence_tool_execution", evidence: { said: `${rows.length} of ${REQUESTS.length} requests kept`, rows }, effectApplied: true, outputs: { records: rows },
          draft: { actionId: LIST_ID, input: value, ranWith: ranWith(value), effect: "observe", proposes: true, replay: { from: LOCATION } }
        };
      }
      const person = String((value.parameters as JsonObject | undefined)?.person);
      const decision = await permission(confirmDeclaration(value.consequences));
      if (!decision.permitted) return { kind: "llm_evidence_tool_execution", evidence: { refused: true }, effectApplied: false, resultCode: "example.refused" };
      pressed.push(person);
      return {
        kind: "llm_evidence_tool_execution", evidence: { confirmed: person }, effectApplied: true,
        draft: { actionId: CONFIRM_ID, input: value, ranWith: ranWith(value), effect: "mutate", proposes: true, replay: { from: LOCATION } }
      };
    },
    resolvePlanNodeParameters: async ({ nodeDefinitionId, parameters, permission, declaredConsequences }) => {
      declared.push({ nodeDefinitionId, parameters: structuredClone(parameters), ...(declaredConsequences ? { declaredConsequences: [...declaredConsequences] } : {}) });
      if (nodeDefinitionId !== CONFIRM_ID || declaredConsequences === undefined) return { status: "unchanged" };
      const decision = await permission(confirmDeclaration([...declaredConsequences]));
      return decision.permitted ? { status: "unchanged" } : { status: "needs_permission", missing: decision.missing, requestId: decision.requestId };
    }
  };
  return { binding, calls, pressed, declared };
}

const USAGE = { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCostUsd: 0.001 };

/** One build of the instruction: the model answers with each decision in turn, the judge with each answer. */
async function build(script: { decisions: JsonObject[]; judge: ("yes" | "no")[]; tested?: JsonObject[] }) {
  const requests: AutomationStudioLlmTaskRequest[] = [];
  let decided = 0;
  let judged = 0;
  const provider = mockProvider(async (request) => {
    // The build's one read of the instruction: nothing lasting is read from it, so the steps' own declarations decide.
    if (request.metadata?.source === "instructionAuthority") {
      return { response: { kind: "evidence_tool_decision", summary: "Read.", decision: { kind: "complete", result: { instructed: [] } } }, usage: USAGE };
    }
    requests.push(request);
    if (isJudgeRequest(request)) {
      const answer = script.judge[judged++];
      if (!answer) throw new Error(`The judge was asked ${judged} times; the script answers ${script.judge.length}.`);
      return judgeReply(answer);
    }
    const decision = script.decisions[decided];
    if (!decision) throw new Error(`The model was asked for decision ${decided + 1}; the script has ${script.decisions.length}.`);
    decided += 1;
    return { response: { kind: "evidence_tool_decision", summary: "Step.", decision }, usage: USAGE };
  });
  const domain = friendsDomain({ tested: script.tested ?? KEPT });
  const { project, flow } = structuredClone(await copyDataDirSeed(example, tempRoot));
  const instance = new AutomationStudioService({
    dataDir: tempRoot,
    llmProviderResolver: (() => ({ provider, maxCallsPerRun: 24, maxEstimatedCostUsd: 0.25 })) as never,
    llmEvidenceRuntime: domain.binding
  });
  instance.bindNativeNodeRuntime(nativeRuntime());
  services.add(instance);
  const instruction = await instance.getFlowInstruction(project.id, "instruction.build");
  await instance.saveFlowInstruction(project.id, { ...instruction!, body: INSTRUCTION, updatedAt: Date.now() });
  const generation = instance.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, evidenceGuided: true, caller: caller() });
  return { instance, project, flow, requests, domain, generation };
}

// The draft numbers its steps from the free look, which is step 1: the listing is 2 and the Confirm 3.
const LIST_STEP = 2;
const CONFIRM_STEP = 3;
const LASTING = ["modify_existing"];

const list = (): JsonObject => ({ kind: "tool_call", callId: "call.list", toolId: "core.run_node", input: { node: LIST_ID, parameters: { where: WHERE }, consequences: [] }, add: true });
const confirmLive = (consequences: string[]): JsonObject => ({ kind: "tool_call", callId: "call.confirm", toolId: "core.run_node", input: { node: CONFIRM_ID, parameters: { person: EXPLORED }, consequences }, add: true, act: "a1" });
const confirmWritten = (consequences: string[]): JsonObject => ({ kind: "tool_call", callId: "call.confirm", toolId: "core.run_node", input: { node: CONFIRM_ID, parameters: { person: { $row: "name" } }, consequences, write: true }, act: "a1" });
const repeat = (): JsonObject => ({ kind: "amend_draft", amendments: [{ step: CONFIRM_STEP, change: "repeat", over: LIST_STEP }] });
const bind = (): JsonObject => ({ kind: "amend_draft", amendments: [{ step: CONFIRM_STEP, change: "bind", input: { person: { $row: "name" } } }] });
const complete = (): JsonObject => ({ kind: "complete", result: { summary: "Confirm every request with 5 or more mutual friends." } });

/** The test's calls of the Confirm node: what the build's test sent for each pass. */
function testConfirms(calls: readonly Call[]) {
  return calls.filter((call) => call.value.node === CONFIRM_ID && typeof call.value.replay === "string");
}

/** The build-test packet the last judge request carried. */
function judgedPacket(requests: readonly AutomationStudioLlmTaskRequest[]) {
  return requests.filter(isJudgeRequest).at(-1)?.context.resultSummary?.buildTest;
}

/**
 * What the judge was shown of the Confirm: one pass per kept row, in the
 * list's order, each named by its row and answered `outcome`; and no judge
 * request names a row the listing left out.
 */
function expectJudgedPerRow(requests: readonly AutomationStudioLlmTaskRequest[], outcome: "verified" | "replayed") {
  // A finishing yes is confirmed by a second call (murwcmx2, C-H).
  expect(requests.filter(isJudgeRequest)).toHaveLength(2);
  const confirm = judgedPacket(requests)?.steps.find((step) => step.action === CONFIRM_ID);
  expect(confirm).toMatchObject({ runs: { kind: "repeat", over: LIST_STEP, through: CONFIRM_STEP }, passes: KEPT_NAMES.map((name, at) => ({ pass: at + 1, row: name, outcome })) });
  for (const name of EXCLUDED_NAMES) expect(JSON.stringify(requests.filter(isJudgeRequest))).not.toContain(name);
}

/** Every call the test sent the Confirm: one per kept row, in order, as `replay`, with that row and its name. */
function expectSentPerRow(calls: readonly Call[], replay: "verify" | "step") {
  const sent = testConfirms(calls);
  expect(sent.map((call) => call.value.replay)).toEqual(KEPT.map(() => replay));
  expect(sent.map((call) => call.value.item)).toEqual(KEPT);
  expect(sent.map((call) => (call.value.parameters as JsonObject).person)).toEqual(KEPT_NAMES);
  // No call of the build's names a row the listing left out; only the free look shows them all.
  for (const name of EXCLUDED_NAMES) expect(JSON.stringify(calls.filter((call) => call.toolId !== "friends.look"))).not.toContain(name);
}

/** The stored Flow's graph: the proposal's only Subflow. */
async function storedGraph(run: Awaited<ReturnType<typeof build>>, adaptationId: string) {
  const record = (await run.instance.getFlowBootstrapAdaptation(run.project.id, run.flow.flowId, adaptationId))!;
  expect(record.topology.subflows).toHaveLength(1);
  return { record, graph: record.topology.subflows[0]!.graphFlow };
}

/** What every row-general Flow of this instruction holds, whichever way its Confirm entered it. */
async function expectRowGeneralFlow(run: Awaited<ReturnType<typeof build>>, adaptationId: string, consequences: string[]) {
  const { record, graph } = await storedGraph(run, adaptationId);
  const nodes = graph.nodes as unknown as { id: string; definitionId: string; parameterValues?: JsonObject; metadata?: JsonObject }[];
  const edges = graph.edges as unknown as { sourceNodeId: string; sourcePortId: string; targetNodeId: string; targetPortId: string }[];
  // Exactly one loop, a For Each over the list's rows.
  const loops = nodes.filter((entry) => entry.definitionId === "builtin.control.for-each");
  expect(loops).toHaveLength(1);
  const forEach = loops[0]!;
  const listNode = nodes.find((entry) => entry.definitionId === LIST_ID)!;
  const confirmNodes = nodes.filter((entry) => entry.definitionId === CONFIRM_ID);
  expect(confirmNodes).toHaveLength(1);
  const confirm = confirmNodes[0]!;
  const edge = (source: string, sourcePortId: string, target: string, targetPortId: string) => expect.objectContaining({ sourceNodeId: source, sourcePortId, targetNodeId: target, targetPortId });
  expect(edges).toContainEqual(edge(listNode.id, "records", forEach.id, "items"));
  // The Confirm is the loop's body, and takes each pass's row.
  expect(edges).toContainEqual(edge(forEach.id, "body", confirm.id, "in"));
  expect(edges).toContainEqual(edge(forEach.id, "item", confirm.id, "item"));
  // Its request is named by the row, never by the one the build explored.
  expect(confirm.parameterValues?.person).toEqual({ $state: { path: "item.name" } });
  expect(JSON.stringify(record.topology)).not.toContain(EXPLORED);
  // The declaration the step was made with stays on the stored node (w8).
  expect(confirm.metadata?.declaredConsequences).toEqual(consequences);
  return { record, nodes, confirm };
}

describe("confirm every friend request with 5 or more mutual friends", () => {
  it("tests the recorded Confirm once per kept row, checked and never pressed, and stores a Flow that walks the rows", async () => {
    const run = await build({ decisions: [list(), confirmLive(LASTING), repeat(), bind(), complete()], judge: ["yes", "yes"] });
    const result = await run.generation;

    expect(result.status).toBe("proposed");
    // The build pressed one kept row while exploring, and its test pressed nothing.
    expect(run.domain.pressed).toEqual([EXPLORED]);
    // Three checks, one per kept row, each with that row and its name resolved from the row.
    expectSentPerRow(run.domain.calls, "verify");
    // Five decisions, then the judge: it read the Confirm as three passes, one per kept row.
    expect(run.requests.map(isJudgeRequest)).toEqual([false, false, false, false, false, true, true]);
    expectJudgedPerRow(run.requests, "verified");

    const { record } = await expectRowGeneralFlow(run, result.adaptationId, LASTING);

    // Applied, the Flow on disk is the one proposed: one loop, its Confirm bound to the row, no explored name.
    const review = { projectId: run.project.id, flowId: run.flow.flowId, adaptationId: result.adaptationId, actorId: "reviewer" };
    await run.instance.reviewFlowBootstrapAdaptation({ ...review, action: "approve" });
    await expect(run.instance.reviewFlowBootstrapAdaptation({ ...review, action: "apply" })).resolves.toMatchObject({ status: "applied" });
    const applied = await run.instance.getFlow(run.project.id, record.topology.subflows[0]!.graphFlow.flowId) as unknown as { nodes: { definitionId: string; parameterValues?: JsonObject }[] };
    expect(applied.nodes.filter((entry) => entry.definitionId === "builtin.control.for-each")).toHaveLength(1);
    expect(applied.nodes.find((entry) => entry.definitionId === CONFIRM_ID)?.parameterValues).toEqual({ person: { $state: { path: "item.name" } } });
    expect(JSON.stringify(applied)).not.toContain(EXPLORED);
  }, TIMEOUT_MS);

  it("tests a written Confirm the same way, stores the same Flow, and its gate records list what it declared", async () => {
    const run = await build({ decisions: [list(), confirmWritten(LASTING), repeat(), complete()], judge: ["yes", "yes"] });
    const result = await run.generation;

    expect(result.status).toBe("proposed");
    // Nothing was pressed, while exploring or in the test.
    expect(run.domain.pressed).toEqual([]);
    expectSentPerRow(run.domain.calls, "verify");
    expectJudgedPerRow(run.requests, "verified");

    const { record } = await expectRowGeneralFlow(run, result.adaptationId, LASTING);
    // The Flow's Confirm was put to the build's gate as a step of the Flow, with the class it declared.
    expect(record.declaredConsequences).toContainEqual(expect.objectContaining({ action: expect.objectContaining({ kind: "flow_step", id: CONFIRM_ID }), consequences: LASTING, permitted: true }));
    // The domain resolved the step with its binding as it stands, and its declaration beside it.
    expect(run.domain.declared.find((entry) => entry.nodeDefinitionId === CONFIRM_ID)).toMatchObject({ parameters: { person: { $state: { path: "item.name" } } }, declaredConsequences: LASTING });
  }, TIMEOUT_MS);

  it("runs a Confirm that declares nothing lasting once per kept row, each with its row, and never only checks it", async () => {
    const run = await build({ decisions: [list(), confirmLive([]), repeat(), bind(), complete()], judge: ["yes", "yes"] });
    const result = await run.generation;

    expect(result.status).toBe("proposed");
    expectSentPerRow(run.domain.calls, "step");
    expectJudgedPerRow(run.requests, "replayed");
    await expectRowGeneralFlow(run, result.adaptationId, []);
  }, TIMEOUT_MS);

  it("refuses to finish a written Confirm the test never reached, when the listing keeps no row", async () => {
    // The model is asked again after the refusal; the script has nothing more, so its provider fails and the build ends there.
    const run = await build({ decisions: [list(), confirmWritten(LASTING), repeat(), complete()], judge: [], tested: [] });
    const diagnostic = await rejectedGenerationDiagnostic(run.generation);
    expect(diagnostic.code).toBe("flow_bootstrap.provider_transport_unknown");

    // The completion was refused before any judge: the written Confirm never ran on a row, so nothing was sent for it.
    expect(run.requests).toHaveLength(5);
    expect(run.requests.some(isJudgeRequest)).toBe(false);
    expect(testConfirms(run.domain.calls)).toEqual([]);
    const refusal = run.requests.at(-1)?.context.evidenceLoop?.evidence.find((entry) => entry.toolId === "core.dry_run");
    expect(refusal?.value).toMatchObject({ ok: false, code: "llm_evidence_loop.full_run_required", steps: [{ step: CONFIRM_STEP, actionId: CONFIRM_ID, replayed: "not_reached" }] });
    // No Flow was stored.
    await expectNoTopology(run.instance, run.project.id, run.flow.flowId);
  }, TIMEOUT_MS);
});
