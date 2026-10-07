// The build's test and the stored Flow run a loop the same way (design t252 D6, "Parity").
//
// The build's test is the replay walker (`../replay-draft.ts`, `../replay-span.ts`),
// not a graph run: it keeps reanchor, site memory, sometimes-present and
// verify-only. The stored Flow is the graph the draft assembles into, run by
// the executor's For Each. Two interpreters of one draft drift apart unless
// something pins them together, and this is that pin: one draft -- a Flow
// input, a list, a repeat over it holding a row-scoped press and a row-bound
// step, and a step after the loop -- is assembled and materialised the way the
// build does it and run by `runAutomationStudioGraph` with fake native nodes,
// then tested by the walker with a fake host. Both must send the same calls:
// the same node, the same resolved parameters, the same row, in the same order.
//
// What is compared is the node, its resolved `parameters`, and `item`. The
// executor hands a native node the plan node's `parameterValues` resolved, and
// the walker sends the step's `ranWith.parameters` resolved. One difference is
// Core-only and dropped, on both sides, before comparing: assembly writes every
// parameter the step left out at its definition's default onto the plan node
// (`materialiseDefaults`, `../../../flow-bootstrap/authoring/normalise.ts`), so
// the stored Flow's nodes carry `timeoutMs: 10000` where the step that ran
// named none. A key in `DEFAULTS_ASSEMBLY_WRITES` is dropped only while it
// holds exactly its definition's default, so any other value of it is still
// compared. The read's `recordOutput` is compared: assembly writes one dataset
// per read step (read-list S1), and the walker sends the same, built from the
// node's full definition (`definitionOf`, `../replay.ts`). The
// declaration (`consequences`) sits beside the parameters on both sides, and
// the walker's envelope -- `replay`, `from`, `produced`, `node` -- is not a
// parameter; neither is compared.
// The llm barrel first, as `../../decision-context/tests/recorded-runs.ts` says why.
import { describe, expect, it } from "vitest";
import {
  automationStudioFlowBootstrapDraftNodeStep,
  automationStudioLlmNodeDescriptions,
  replayAutomationStudioFlowDraft,
  type AutomationStudioLlmEvidenceToolExecutionResult
} from "../../index.ts";
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, AutomationStudioNodeRegistry, type AutomationNodeExecutionResult, type AutomationNodePort, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import { createBlankAutomationStudioFlowArtifact } from "../../../../model/index.ts";
import {
  applyAutomationStudioFlowDraftAmendments,
  automationStudioFlowDraftStepIsProposed,
  type AutomationStudioFlowDraftStep
} from "../../../flow-draft/index.ts";
import { assembleAutomationStudioFlowDraftPlan, normalizeAutomationStudioFlowBuildPlan, validateAutomationStudioFlowBootstrapPlan } from "../../../flow-bootstrap/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../../flow-bootstrap/plan/tests/index.ts";
import { runAutomationStudioGraph } from "../../../executor/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../native-node-runtime.ts";
import { canonicalFlowDocument } from "../../../service/flows/index.ts";

const resolution = {
  scope: { kind: "domain" as const, domainId: "web-automation" },
  runtimeCapabilities: ["web.actions"],
  permissions: ["web-automation.action"]
};

// The web domain's library, with the click taking the row a pass is on, as the
// domain's press declares it downstream; typing does not take it.
const ROW_INPUT: AutomationNodePort = { id: "item", label: "Item", valueType: "any", role: "data", required: false };
const fixture = webDomainNodeDefinitionsFixture();
// A next-page press, as the domain's next-page node declares it downstream
// (read-list design S2, "What S4 and S5 need"): a click with an `ended` branch
// it answers when there is no further page.
const clickDefinition = fixture.find((definition) => definition.id === "web.output.dom-click")!;
const nextPageDefinition: AutomationStudioNodeDefinition = {
  ...clickDefinition,
  id: "web.output.dom-next_page",
  label: "Next Page",
  description: "Show the next page of a detected list, or answer ended when there is none.",
  source: { kind: "importer", domainId: "web-automation", packageId: "@fluxiq-web-extension/domain", implementationKey: "web.dom.next_page" },
  outputAction: { fixedOutputId: "web.dom.next_page" },
  outputs: [...clickDefinition.outputs, { id: "ended", label: "No more pages", valueType: "any", role: "branch" }]
};
const definitions = [...fixture.map((definition) => definition.id === "web.output.dom-click" ? { ...definition, inputs: [...definition.inputs, ROW_INPUT] } : definition), nextPageDefinition];
const registry = new AutomationStudioNodeRegistry();
for (const definition of definitions) registry.register(definition);

const TYPE = "web.output.dom-type";
const LIST = "web.output.dom-extract_list";
const CLICK = "web.output.dom-click";
const NEXT = "web.output.dom-next_page";

const ROWS: JsonObject[] = [{ name: "Ada Park", mutual: 6 }, { name: "Ben Ito", mutual: 7 }, { name: "Cy Moss", mutual: 9 }];

/** One step the build ran through `core.run_node`, as the draft keeps it. */
function step(position: number, node: string, parameters: JsonObject, options: { consequences?: string[]; observe?: true } = {}): AutomationStudioFlowDraftStep {
  const consequences = options.consequences ?? [];
  return {
    position,
    id: `d${position}`,
    iteration: position,
    callId: `call.${position}`,
    actionId: node,
    toolId: "core.run_node",
    input: structuredClone({ node, parameters, consequences }),
    ranWith: structuredClone({ node, parameters, consequences }),
    effect: options.observe ? "observe" : "mutate",
    effectApplied: true,
    disposition: "kept",
    proposes: true,
    replay: { from: { location: `https://site.test/${position}` }, produced: { at: position } }
  };
}

/**
 * Search on the person's words, read the requests, then for each request press
 * its Confirm and note its name, then press Done. Made general the way the
 * model does it, through `amend_draft`: `repeat` the press through the note
 * over the list, `bind` the note's text to the row's name and the search's
 * text to a Flow input whose test value is the instruction's.
 */
function draft(pressConsequences: string[] = []): AutomationStudioFlowDraftStep[] {
  const steps = [
    step(1, TYPE, { selector: "#search", text: "blue towels" }),
    step(2, LIST, { extractList: { item: ".request", fields: { name: ".name", mutual: ".mutual" } } }, { observe: true }),
    step(3, CLICK, { selector: ".request-confirm" }, { consequences: pressConsequences }),
    step(4, TYPE, { selector: ".request-note", text: "Ada Park" }),
    step(5, CLICK, { selector: "#done" })
  ];
  const amended = applyAutomationStudioFlowDraftAmendments(steps, [
    { step: 3, change: "repeat", over: 2, through: 4 },
    { step: 4, change: "bind", input: { parameters: { text: { $row: "name" } } } },
    { step: 1, change: "bind", input: { text: { $input: "query", test: "blue towels" } } }
  ]);
  expect(amended).toEqual({ applied: 3, refused: [] });
  // What the bindings were stored as (D3): Core's own `$state`.
  expect(steps[3]!.ranWith!.parameters).toEqual({ selector: ".request-note", text: { $state: { path: "item.name" } } });
  expect(steps[0]!.ranWith!.parameters).toEqual({ selector: "#search", text: { $state: { path: "query", fallback: "blue towels" } } });
  return steps;
}

/** One call either interpreter made: the node, its resolved parameters, and the row. */
type Sent = { node: string; parameters: JsonValue | undefined; item: JsonValue | undefined };

type Implementation = (call: { inputs: Readonly<Record<string, JsonValue>>; parameters: Readonly<Record<string, JsonValue>> }) => AutomationNodeExecutionResult;

/**
 * The stored Flow's side: assemble the draft as the build's completion does
 * (`../../harness-options/bootstrap-completion.ts`), validate it, materialise it
 * as an adaptation does (`normalizeAutomationStudioFlowBuildPlan`), and run the
 * primary Subflow's graph, read as the document the runtime executes
 * (`canonicalFlowDocument`), with each web node faked, recording what it was handed.
 */
async function storedFlowRun(steps: readonly AutomationStudioFlowDraftStep[], options: { nextEndsOn?: number } = {}): Promise<{ sent: Sent[]; status: string }> {
  const assembled = assembleAutomationStudioFlowDraftPlan({
    steps: steps.filter(automationStudioFlowDraftStepIsProposed),
    write: automationStudioFlowBootstrapDraftNodeStep,
    registry,
    resolution,
    summary: "Confirm each request"
  });
  expect(assembled.issues.filter((issue) => issue.severity === "error")).toEqual([]);
  const validated = validateAutomationStudioFlowBootstrapPlan({ plan: assembled.plan!, registry, resolution });
  expect(validated.issues.filter((issue) => issue.severity === "error")).toEqual([]);
  const parent = createBlankAutomationStudioFlowArtifact({ flowId: "flow.parity", projectId: "project.parity", name: "Parity", now: 1 });
  const topology = normalizeAutomationStudioFlowBuildPlan({ adaptationId: "adaptation.bootstrap.parity", parentFlow: parent, buildPlan: validated.validated!, sourceInstructionIds: [], now: 1 });
  const graph = topology.subflows.find((entry) => entry.subflow.role === "primary")!.graphFlow;
  const sent: Sent[] = [];
  const recording = (node: string, outputs: Record<string, JsonValue> = {}): Implementation => ({ inputs, parameters }) => {
    sent.push({ node, parameters: { ...parameters }, item: inputs.item });
    return { status: "success", route: "success", outputs };
  };
  // The next-page press answers its `ended` route on its `nextEndsOn`th call, else succeeds.
  let nextCalls = 0;
  const nextPage: Implementation = ({ inputs, parameters }) => {
    nextCalls += 1;
    sent.push({ node: NEXT, parameters: { ...parameters }, item: inputs.item });
    return { status: "success", route: nextCalls === options.nextEndsOn ? "ended" : "success", outputs: {} };
  };
  const used = new Set([TYPE, LIST, CLICK, NEXT]);
  const runtime = new AutomationStudioNativeNodeRuntime({ permissions: ["web-automation.action"], runtimeCapabilities: ["web.actions"] }).register(
    { schemaVersion: "0.1", sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, packageId: "@fluxiq-web-extension/domain", packageVersion: "1.0.0", domainId: "web-automation", nodes: definitions.filter((definition) => used.has(definition.id)) },
    {
      packageId: "@fluxiq-web-extension/domain",
      packageVersion: "1.0.0",
      implementations: {
        "web.dom.type": recording(TYPE),
        "web.dom.extract_list": recording(LIST, { records: ROWS }),
        "web.dom.click": recording(CLICK),
        "web.dom.next_page": nextPage
      }
    }
  );
  // No run inputs: the stored Flow runs on the input's test value, as the build's test does.
  const trace = await runAutomationStudioGraph(canonicalFlowDocument(graph), { nativeNodeExecutor: ({ node, inputs, signal }) => runtime.execute(node, inputs, signal) });
  return { sent, status: trace.status };
}

/**
 * The build's test: the walker with the build's own node lookup
 * (`automationStudioLlmNodeDescriptions(...).definition`, what `service.ts`
 * passes as `nodeOf`) and a host that answers the list's replay with the same
 * rows on `outputs`, recording each step and pass call.
 */
async function buildTest(steps: readonly AutomationStudioFlowDraftStep[], withNodes = true, options: { nextEndsOn?: number } = {}): Promise<{ sent: (Sent & { replay: JsonValue | undefined })[]; ok: boolean }> {
  const sent: (Sent & { replay: JsonValue | undefined })[] = [];
  // The domain's next-page replay answers `core.replay.ended` when there is no further page (contract C6).
  let nextCalls = 0;
  const executeTool = async ({ value }: { callId: string; toolId: string; value: JsonObject }): Promise<AutomationStudioLlmEvidenceToolExecutionResult> => {
    if (value.replay === "reset") return { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true, resultCode: "core.replay.replayed" };
    sent.push({ node: String(value.node), parameters: value.parameters, item: value.item, replay: value.replay });
    const verify = value.replay === "verify";
    const ended = value.node === NEXT && (nextCalls += 1) === options.nextEndsOn;
    return {
      kind: "llm_evidence_tool_execution",
      evidence: { node: value.node ?? null },
      effectApplied: !verify,
      resultCode: verify ? "core.replay.verified" : ended ? "core.replay.ended" : "core.replay.replayed",
      ...(value.node === LIST ? { outputs: { records: ROWS } } : {})
    };
  };
  const nodeOf = automationStudioLlmNodeDescriptions({ registry, resolution }).definition;
  // The full definitions, as `service.ts` passes `definitionOf`: what lets a read carry the record output assembly writes.
  const definitionOf = (id: string) => registry.get(id, resolution);
  const replayed = await replayAutomationStudioFlowDraft({ steps, attempt: 1, executeTool, ...(withNodes ? { nodeOf, definitionOf } : {}) });
  return { sent, ok: replayed.verdict.ok };
}

/** The parameters assembly writes in at their default when a step left them out (see the header). */
const DEFAULTS_ASSEMBLY_WRITES = ["timeoutMs"] as const;

/** The record output assembly writes on the read, step `d2`, which named none: its own dataset, its columns (read-list S1). */
const READ_RECORD_OUTPUT: JsonObject = {
  datasetId: "web-output-dom-extract-list-d2",
  label: LIST,
  schema: { schemaVersion: "0.1", fields: [{ id: "name", label: "Name", valueType: "string" }, { id: "mutual", label: "Mutual", valueType: "string" }] },
  writeMode: "append"
};

/** A call's parameters without a key assembly wrote in at its definition's default. */
function withoutWrittenDefaults(node: string, parameters: JsonValue | undefined): JsonValue | undefined {
  if (typeof parameters !== "object" || parameters === null || Array.isArray(parameters)) return parameters;
  const declared = registry.get(node)?.parameters ?? [];
  const kept: JsonObject = { ...parameters };
  for (const key of DEFAULTS_ASSEMBLY_WRITES) {
    const fallback = declared.find((parameter) => parameter.id === key)?.defaultValue;
    if (Object.hasOwn(kept, key) && fallback !== undefined && JSON.stringify(kept[key]) === JSON.stringify(fallback)) delete kept[key];
  }
  return kept;
}

const comparable = (sent: readonly Sent[]): Sent[] => sent.map(({ node, parameters, item }) => ({ node, parameters: withoutWrittenDefaults(node, parameters), item }));

describe("the build's test and the stored Flow run one draft's loop alike", () => {
  it("send the same node, resolved parameters and row, in the same order", async () => {
    const steps = draft();
    const stored = await storedFlowRun(steps);
    const tested = await buildTest(steps);

    expect(stored.status).toBe("succeeded");
    expect(tested.ok).toBe(true);
    const expected: Sent[] = [
      // The Flow input on its test value, outside the loop.
      { node: TYPE, parameters: { selector: "#search", text: "blue towels" }, item: undefined },
      // The list, once, into its own dataset.
      { node: LIST, parameters: { extractList: { item: ".request", fields: { name: ".name", mutual: ".mutual" } }, recordOutput: READ_RECORD_OUTPUT }, item: undefined },
      // Each span member once per row, with that row: the press takes it, the note's text is its name.
      ...ROWS.flatMap((row) => [
        { node: CLICK, parameters: { selector: ".request-confirm" }, item: row },
        { node: TYPE, parameters: { selector: ".request-note", text: row.name! }, item: undefined }
      ]),
      // After the loop, once.
      { node: CLICK, parameters: { selector: "#done" }, item: undefined }
    ];
    expect(comparable(stored.sent)).toEqual(expected);
    expect(comparable(tested.sent)).toEqual(expected);
    expect(tested.sent.every((call) => call.replay === "step")).toBe(true);
  });

  it("check a lasting press once per row where the Flow runs it, on the same row and target", async () => {
    const steps = draft(["modify_existing"]);
    const stored = await storedFlowRun(steps);
    const tested = await buildTest(steps);

    expect(stored.status).toBe("succeeded");
    expect(tested.ok).toBe(true);
    // The whole sequence still matches; only how the press is sent differs.
    expect(comparable(tested.sent)).toEqual(comparable(stored.sent));
    const presses = (sent: readonly (Sent & { replay?: JsonValue | undefined })[]) => sent.filter((call) => call.node === CLICK && call.item !== undefined);
    expect(comparable(presses(stored.sent)).map((call) => [call.parameters, call.item])).toEqual(ROWS.map((row) => [{ selector: ".request-confirm" }, row]));
    expect(presses(tested.sent).map((call) => [call.replay, call.parameters, call.item])).toEqual(ROWS.map((row) => ["verify", { selector: ".request-confirm" }, row]));
    // Nothing else is only checked: the rest is sent as steps.
    expect(tested.sent.filter((call) => !(call.node === CLICK && call.item !== undefined)).every((call) => call.replay === "step")).toBe(true);
  });
});

// Read-list design S2 (4.2(e)): read the list, press Next, again while Next
// found a page. The stored Flow runs it through the Repeat node, the next
// page's `ended` route leaving the loop (contract C4, C5); the build's test
// runs the span pass by pass until the next page's replay answers
// `core.replay.ended` (C6). Both must read and press the same pages.
describe("the build's test and the stored Flow run one draft's do-while alike", () => {
  const doWhile = (): AutomationStudioFlowDraftStep[] => {
    const steps = [
      step(1, TYPE, { selector: "#search", text: "blue towels" }),
      step(2, LIST, { extractList: { item: ".request", fields: { name: ".name", mutual: ".mutual" } } }, { observe: true }),
      step(3, NEXT, { selector: "a.next" }),
      step(4, CLICK, { selector: "#done" })
    ];
    steps[1]!.routing = { kind: "repeat", through: "d3", while: "d3" };
    return steps;
  };

  it("read and press next the same pages, ending where the next page answers ended", async () => {
    const stored = await storedFlowRun(doWhile(), { nextEndsOn: 3 });
    const tested = await buildTest(doWhile(), true, { nextEndsOn: 3 });

    expect(stored.status).toBe("succeeded");
    expect(tested.ok).toBe(true);
    const page = (): Sent[] => [
      // Every pass of the read appends to its one dataset.
      { node: LIST, parameters: { extractList: { item: ".request", fields: { name: ".name", mutual: ".mutual" } }, recordOutput: READ_RECORD_OUTPUT }, item: undefined },
      { node: NEXT, parameters: { selector: "a.next" }, item: undefined }
    ];
    const expected: Sent[] = [
      { node: TYPE, parameters: { selector: "#search", text: "blue towels" }, item: undefined },
      // Three passes: the third next page ends the loop.
      ...page(), ...page(), ...page(),
      { node: CLICK, parameters: { selector: "#done" }, item: undefined }
    ];
    expect(comparable(stored.sent)).toEqual(expected);
    expect(comparable(tested.sent)).toEqual(expected);
  });
});
