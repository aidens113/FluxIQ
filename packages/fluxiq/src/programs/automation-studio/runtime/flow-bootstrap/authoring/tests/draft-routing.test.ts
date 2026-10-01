// A draft that says when its steps run, and the Flow that makes it true.
//
// Every assertion here is about one claim: the model states a relation between
// steps and the graph is derived from it. So what is checked is the graph --
// which node is in the plan, which port each edge leaves and arrives at -- and
// never a field copied back out of the statement that asked for it.
import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, AutomationStudioNodeRegistry, type AutomationNodePort, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import type { AutomationStudioFlowDraftStep, AutomationStudioFlowDraftStepRouting } from "../../../flow-draft/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../plan/tests/index.ts";
import { validateAutomationStudioFlowBootstrapPlan } from "../../plan/index.ts";
import type { AutomationStudioFlowDocument } from "../../../../model/index.ts";
import { runAutomationStudioGraph } from "../../../executor/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../native-node-runtime.ts";
import { assembleAutomationStudioFlowDraftPlan, type AutomationStudioFlowDraftWrittenStep } from "../assemble-draft.ts";

// The real library: Core's built-ins, which is where the join and the list
// walker come from, plus the web domain's own nodes.
const registry = new AutomationStudioNodeRegistry();
for (const definition of webDomainNodeDefinitionsFixture()) registry.register(definition);

const resolution = {
  scope: { kind: "domain" as const, domainId: "web-automation" },
  runtimeCapabilities: ["web.actions"],
  permissions: ["web-automation.action"]
};

function step(position: number, actionId: string, input: Record<string, string>, routing?: AutomationStudioFlowDraftStepRouting): AutomationStudioFlowDraftStep {
  return {
    position,
    id: `d${position}`,
    iteration: position,
    callId: `call.${position}`,
    actionId,
    input,
    effect: "mutate",
    effectApplied: true,
    disposition: "kept",
    ...(routing ? { routing } : {})
  };
}

function write(draftStep: AutomationStudioFlowDraftStep): AutomationStudioFlowDraftWrittenStep | undefined {
  if (draftStep.actionId === "press") return { description: "press the control", node: "web.dom.click", entries: [{ key: "selector", value: String(draftStep.input.target) }] };
  if (draftStep.actionId === "look") return { description: "wait for the control", node: "web.dom.wait_for_selector", entries: [{ key: "selector", value: String(draftStep.input.target) }] };
  if (draftStep.actionId === "read") return { description: "read the rows", node: "web.dom.extract_list", entries: [{ key: "extractList", value: JSON.stringify({ item: String(draftStep.input.target), fields: { name: ".name" } }) }] };
  return undefined;
}

function assemble(steps: AutomationStudioFlowDraftStep[]) {
  return assembleAutomationStudioFlowDraftPlan({ steps, write, registry, resolution, summary: "Collect the first page of results" });
}

/** Every edge as `source:port -> target:port`, with each node named by its definition. */
function wiring(plan: NonNullable<ReturnType<typeof assemble>["plan"]>): string[] {
  const subflow = plan.subflows[0]!;
  const named = new Map(subflow.nodes.map((node) => [node.key, node.definitionId]));
  return subflow.edges.map((edge) => `${named.get(edge.source.nodeKey)}:${edge.source.portId} -> ${named.get(edge.target.nodeKey)}:${edge.target.portId}`);
}

describe("a step the Flow does not always take", () => {
  it("carries on past an optional step, through a join the failure also reaches", () => {
    const assembled = assemble([
      step(1, "press", { target: "#consent-accept" }, { kind: "optional" }),
      step(2, "press", { target: "#search-submit" })
    ]);

    expect(assembled.issues.filter((issue) => issue.severity === "error")).toEqual([]);
    expect(assembled.plan?.subflows[0]?.nodes.map((node) => node.definitionId)).toEqual([
      "web.output.dom-click", "builtin.control.merge", "web.output.dom-click"
    ]);
    // Both ways out of the dismissal reach the join, and the Flow leaves the
    // join once -- which is the whole of "do this only if it is there".
    expect(wiring(assembled.plan!)).toEqual(expect.arrayContaining([
      "web.output.dom-click:failed -> builtin.control.merge:in",
      "web.output.dom-click:success -> builtin.control.merge:branches",
      "builtin.control.merge:success -> web.output.dom-click:in"
    ]));
  });

  it("joins at the Merge already written after an optional step rather than adding a second", () => {
    // A Flow read back as a draft carries its own join as the step after the
    // optional one (`llm/node-tools/draft-from-flow.ts`, run-munq5s8x-6d620cdf).
    const withJoin = (draftStep: AutomationStudioFlowDraftStep): AutomationStudioFlowDraftWrittenStep | undefined =>
      draftStep.actionId === "join" ? { description: "the paths meet here", node: "builtin.control.merge" } : write(draftStep);
    const assembled = assembleAutomationStudioFlowDraftPlan({
      steps: [
        step(1, "press", { target: "#soft-check" }, { kind: "optional" }),
        step(2, "join", {}),
        step(3, "press", { target: "#search-submit" })
      ],
      write: withJoin, registry, resolution, summary: "Collect the first page of results"
    });

    expect(assembled.issues.filter((issue) => issue.severity === "error")).toEqual([]);
    expect(assembled.plan?.subflows[0]?.nodes.map((node) => node.definitionId)).toEqual([
      "web.output.dom-click", "builtin.control.merge", "web.output.dom-click"
    ]);
    expect(wiring(assembled.plan!)).toEqual(expect.arrayContaining([
      "web.output.dom-click:failed -> builtin.control.merge:in",
      "web.output.dom-click:success -> builtin.control.merge:branches"
    ]));
    // The join is the draft's own step, so it is traced back to it (the
    // presses are written here by alias, which that trace does not count).
    expect(assembled.draftStepIdByNodeKey).toEqual({ s2: "d2" });
  });

  it("runs a guarded step only when the check before it succeeded", () => {
    const assembled = assemble([
      step(1, "look", { target: "#consent" }),
      step(2, "press", { target: "#consent-accept" }, { kind: "only_if", check: "d1" }),
      step(3, "press", { target: "#search-submit" })
    ]);

    expect(assembled.issues.filter((issue) => issue.severity === "error")).toEqual([]);
    const wired = wiring(assembled.plan!);
    // The check falls into the step it guards, and its failure goes past it.
    expect(wired).toContain("web.output.dom-wait_for_selector:success -> web.output.dom-click:in");
    expect(wired).toContain("web.output.dom-wait_for_selector:failed -> builtin.control.merge:in");
  });

  it("refuses a guard that is not the step before the one it guards, and says how to move it", () => {
    const assembled = assemble([
      step(1, "look", { target: "#consent" }),
      step(2, "press", { target: "#something-else" }),
      step(3, "press", { target: "#consent-accept" }, { kind: "only_if", check: "d1" })
    ]);

    expect(assembled.plan).toBeUndefined();
    expect(assembled.issues.map((issue) => issue.code)).toContain("flow_draft.check_not_before_step");
  });
});

describe("a step that recovers another", () => {
  it("wires the failure to the recovery and brings both paths back together", () => {
    const assembled = assemble([
      step(1, "press", { target: "#buy" }, { kind: "on_failed", to: "d2" }),
      step(2, "press", { target: "#buy-fallback" }),
      step(3, "press", { target: "#checkout" })
    ]);

    expect(assembled.issues.filter((issue) => issue.severity === "error")).toEqual([]);
    const wired = wiring(assembled.plan!);
    expect(wired).toContain("web.output.dom-click:failed -> web.output.dom-click:in");
    expect(wired).toContain("web.output.dom-click:success -> builtin.control.merge:in");
    // The recovery is not also run in its own turn: it is reached only from
    // the failure, and its success rejoins the line.
    expect(assembled.plan?.subflows[0]?.nodes).toHaveLength(4);
    expect(wired.filter((edge) => edge.endsWith("builtin.control.merge:branches"))).toHaveLength(1);
  });

  it("refuses a recovery into a step the Flow has already run", () => {
    const assembled = assemble([
      step(1, "press", { target: "#first" }),
      step(2, "press", { target: "#buy" }, { kind: "on_failed", to: "d1" })
    ]);

    expect(assembled.plan).toBeUndefined();
    expect(assembled.issues.map((issue) => issue.code)).toContain("flow_draft.recovery_behind_step");
  });
});

describe("a span that repeats", () => {
  it("walks the rows a list step produced, and closes the loop through a join", () => {
    const assembled = assemble([
      step(1, "read", { target: ".row" }),
      step(2, "press", { target: ".row-open" }, { kind: "repeat", through: "d3", over: "d1" }),
      step(3, "press", { target: ".row-back" }),
      step(4, "press", { target: "#done" })
    ]);

    expect(assembled.issues.filter((issue) => issue.severity === "error")).toEqual([]);
    const wired = wiring(assembled.plan!);
    // The rows go into the list walker's own list port, never into its path.
    expect(wired).toContain("web.output.dom-extract_list:records -> builtin.control.for-each:items");
    expect(wired).toContain("web.output.dom-extract_list:success -> builtin.control.merge:branches");
    expect(wired).toContain("builtin.control.merge:success -> builtin.control.for-each:in");
    expect(wired).toContain("builtin.control.for-each:body -> web.output.dom-click:in");
    expect(wired).toContain("builtin.control.for-each:done -> builtin.control.merge:in");
    // The last step of the span goes back to the head of the loop rather than on.
    expect(wired).toContain("web.output.dom-click:success -> builtin.control.merge:branches");
  });

  it("repeats a span while a check keeps succeeding, with no list walker at all", () => {
    const assembled = assemble([
      step(1, "look", { target: ".next-page" }),
      step(2, "press", { target: ".next-page" }, { kind: "repeat", through: "d2", over: "d1" }),
      step(3, "press", { target: "#done" })
    ]);

    expect(assembled.issues.filter((issue) => issue.severity === "error")).toEqual([]);
    const definitions = assembled.plan?.subflows[0]?.nodes.map((node) => node.definitionId) ?? [];
    expect(definitions).not.toContain("builtin.control.for-each");
    const wired = wiring(assembled.plan!);
    // The check is inside the loop, so it is asked again on every pass.
    expect(wired).toContain("builtin.control.merge:success -> web.output.dom-wait_for_selector:in");
    expect(wired).toContain("web.output.dom-wait_for_selector:success -> web.output.dom-click:in");
    expect(wired).toContain("web.output.dom-wait_for_selector:failed -> builtin.control.merge:in");
    expect(wired).toContain("web.output.dom-click:success -> builtin.control.merge:branches");
  });

  // One sentence blamed `through` for all three of these, and a live build
  // whose `over` named a step no longer in the Flow resent the same completion
  // nine times (`run-muog33va-96469cb2`). Each now says which reference is wrong.
  it("says which end of an unknown span is wrong, and how to put it right", () => {
    const span = (routing: AutomationStudioFlowDraftStepRouting) => assemble([
      step(1, "read", { target: ".row" }),
      step(2, "press", { target: ".row-open" }),
      step(3, "press", { target: ".row-confirm" }, routing)
    ]).issues.find((issue) => issue.code === "flow_draft.repeat_span_unknown")?.message;

    expect(span({ kind: "repeat", through: "d3", over: "d9" })).toBe("Step 3 repeats over a step that is not in the Flow: it was dropped or never added. Send amend_draft repeat on step 3 again with over naming the kept step just before it whose rows it walks.");
    expect(span({ kind: "repeat", through: "d9", over: "d2" })).toBe("Step 3 repeats through a step that is not in the Flow: it was dropped or never added. Send amend_draft repeat on step 3 again with through naming the last kept step of the span.");
    expect(span({ kind: "repeat", through: "d1", over: "d2" })).toBe("Step 3 repeats through step 1, which comes before it. through names the last step of the span, at or after step 3; put steps in order with an amend_draft reorder first.");
  });

  it("produces a plan the validator accepts, cycle and all", () => {
    const assembled = assemble([
      step(1, "read", { target: ".row" }),
      step(2, "press", { target: ".row-open" }, { kind: "repeat", through: "d2", over: "d1" }),
      step(3, "press", { target: "#done" })
    ]);
    const validated = validateAutomationStudioFlowBootstrapPlan({ plan: assembled.plan!, registry, resolution });

    expect(validated.issues.filter((issue) => issue.severity === "error")).toEqual([]);
    expect(validated.ok).toBe(true);
  });
});

// A step whose node can act on "the row this pass is on" declares an optional
// `item` input after its way in. The web domain's nodes gain it downstream, so
// here the library is the real one with that input added to the nodes named.
const ROW_INPUT: AutomationNodePort = { id: "item", label: "Item", valueType: "any", role: "data", required: false };

function rowRegistry(...ids: string[]): { registry: AutomationStudioNodeRegistry; definitions: AutomationStudioNodeDefinition[] } {
  const definitions = webDomainNodeDefinitionsFixture().map((definition) => ids.includes(definition.id) ? { ...definition, inputs: [...definition.inputs, ROW_INPUT] } : definition);
  const rowed = new AutomationStudioNodeRegistry();
  for (const definition of definitions) rowed.register(definition);
  return { registry: rowed, definitions };
}

function assembleWith(rowed: AutomationStudioNodeRegistry, steps: AutomationStudioFlowDraftStep[]) {
  return assembleAutomationStudioFlowDraftPlan({ steps, write, registry: rowed, resolution, summary: "Open each result in turn" });
}

describe("a span that repeats over rows hands each pass's row on", () => {
  const LIST_LOOP = [
    step(1, "read", { target: ".row" }),
    step(2, "press", { target: ".row-open" }, { kind: "repeat", through: "d4", over: "d1" }),
    step(3, "look", { target: ".row-detail" }),
    step(4, "press", { target: ".row-back" }),
    step(5, "press", { target: "#done" })
  ];

  it("to every step of the span whose node takes a row, and to no other step", () => {
    const { registry: rowed } = rowRegistry("web.output.dom-click");
    const assembled = assembleWith(rowed, LIST_LOOP);

    expect(assembled.issues.filter((issue) => issue.severity === "error")).toEqual([]);
    const subflow = assembled.plan!.subflows[0]!;
    expect(subflow.nodes.map((node) => node.definitionId)).toEqual([
      "web.output.dom-extract_list", "builtin.control.merge", "builtin.control.for-each",
      "web.output.dom-click", "web.output.dom-wait_for_selector", "web.output.dom-click",
      "builtin.control.merge", "web.output.dom-click"
    ]);
    const rowEdges = subflow.edges.filter((edge) => edge.source.portId === "item" || edge.target.portId === "item");
    // Both clicks inside the span take the row; the wait declares no row, and
    // the click after the loop is not in it.
    expect(rowEdges.map((edge) => `${edge.source.nodeKey}:${edge.source.portId} -> ${edge.target.nodeKey}:${edge.target.portId}`)).toEqual([
      `${subflow.nodes[2]!.key}:item -> ${subflow.nodes[3]!.key}:item`,
      `${subflow.nodes[2]!.key}:item -> ${subflow.nodes[5]!.key}:item`
    ]);
    // The row is a value, not the path: every click is still entered by its way in.
    for (const index of [3, 5, 7]) expect(subflow.edges.filter((edge) => edge.target.nodeKey === subflow.nodes[index]!.key && edge.target.portId === "in")).toHaveLength(1);
  });

  it("produces a plan the validator accepts when several steps take the one row", () => {
    const { registry: rowed } = rowRegistry("web.output.dom-click");
    const assembled = assembleWith(rowed, LIST_LOOP);
    const validated = validateAutomationStudioFlowBootstrapPlan({ plan: assembled.plan!, registry: rowed, resolution });

    expect(validated.issues.filter((issue) => issue.severity === "error")).toEqual([]);
    expect(validated.ok).toBe(true);
  });

  it("hands no row to a span that repeats while a check holds, which has none to hand", () => {
    const { registry: rowed } = rowRegistry("web.output.dom-click", "web.output.dom-wait_for_selector");
    const assembled = assembleWith(rowed, [
      step(1, "look", { target: ".next-page" }),
      step(2, "press", { target: ".next-page" }, { kind: "repeat", through: "d2", over: "d1" }),
      step(3, "press", { target: "#done" })
    ]);

    expect(assembled.issues.filter((issue) => issue.severity === "error")).toEqual([]);
    expect(assembled.plan!.subflows[0]!.edges.filter((edge) => edge.source.portId === "item" || edge.target.portId === "item")).toEqual([]);
  });

  it("gives the step's own implementation the row of each pass in turn when the Flow runs", async () => {
    const { registry: rowed, definitions } = rowRegistry("web.output.dom-click");
    const assembled = assembleWith(rowed, [
      step(1, "read", { target: ".row" }),
      step(2, "press", { target: ".row-open" }, { kind: "repeat", through: "d3", over: "d1" }),
      step(3, "look", { target: ".row-detail" }),
      // After the loop, and a node that takes a row: it must be handed none.
      step(4, "press", { target: "#done" })
    ]);
    expect(assembled.issues.filter((issue) => issue.severity === "error")).toEqual([]);
    // The row reaches the click by an edge of the graph, not only by name.
    expect(wiring(assembled.plan!)).toContain("builtin.control.for-each:item -> web.output.dom-click:item");

    const rows: JsonValue[] = [{ name: "synthetic-first" }, { name: "synthetic-second" }, { name: "synthetic-third" }];
    const clicked: Array<Record<string, unknown>> = [];
    const waited: Array<Record<string, unknown>> = [];
    const used = new Set(["web.output.dom-extract_list", "web.output.dom-click", "web.output.dom-wait_for_selector"]);
    const runtime = new AutomationStudioNativeNodeRuntime({ permissions: ["web-automation.action"], runtimeCapabilities: ["web.actions"] }).register(
      { schemaVersion: "0.1", sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, packageId: "@fluxiq-web-extension/domain", packageVersion: "1.0.0", domainId: "web-automation", nodes: definitions.filter((definition) => used.has(definition.id)) },
      {
        packageId: "@fluxiq-web-extension/domain",
        packageVersion: "1.0.0",
        implementations: {
          "web.dom.extract_list": () => ({ status: "success", route: "success", outputs: { records: rows } }),
          "web.dom.click": ({ inputs }) => { clicked.push({ ...inputs }); return { status: "success", route: "success", outputs: {} }; },
          "web.dom.wait_for_selector": ({ inputs }) => { waited.push({ ...inputs }); return { status: "success", route: "success", outputs: {} }; }
        }
      }
    );

    const trace = await runAutomationStudioGraph(flowDocument(assembled.plan!), {
      nativeNodeExecutor: ({ node, inputs, signal }) => runtime.execute(node, inputs, signal)
    });

    expect(trace.status).toBe("succeeded");
    // One click per row, each handed the row its pass is on; the step that
    // declares no row is handed none, and nor is the click after the loop,
    // although the run still holds the last row under the bare name `item`
    // (worker t195-w4's probe gave it that row).
    expect(clicked.map((inputs) => inputs.item)).toEqual([...rows, undefined]);
    expect(waited).toHaveLength(3);
    expect(waited.every((inputs) => !("item" in inputs))).toBe(true);
  });
});

describe("a draft that says nothing about when its steps run", () => {
  it("is the same straight line it always was, with no derived node in it", () => {
    const assembled = assemble([
      step(1, "press", { target: "#consent-accept" }),
      step(2, "press", { target: "#search-submit" })
    ]);

    expect(assembled.plan?.subflows[0]?.nodes.map((node) => node.definitionId)).toEqual(["web.output.dom-click", "web.output.dom-click"]);
    expect(assembled.plan?.subflows[0]?.edges).toHaveLength(1);
  });
});

// Deriving a graph is only half of it. What the Flow does when the optional
// step fails is the claim, so this runs the graph the assembler emitted, with
// the first dispatch refused, and reads what the run actually did.
describe("the Flow a derived graph makes when it runs", () => {
  it("carries on past an optional step whose action failed, and still reaches the last one", async () => {
    const assembled = assembleAutomationStudioFlowDraftPlan({
      steps: [
        step(1, "dispatch", { target: "dismiss" }, { kind: "optional" }),
        step(2, "dispatch", { target: "search" })
      ],
      write: dispatching, registry, resolution, summary: "Dismiss what is there, then search"
    });
    expect(assembled.issues.filter((issue) => issue.severity === "error")).toEqual([]);

    const dispatched: string[] = [];
    const trace = await runAutomationStudioGraph(flowDocument(assembled.plan!), {
      effectDispatcher: (effect) => {
        const payload = effect.payload as { outputId?: string };
        dispatched.push(String(payload.outputId));
        // The dismissal is not there this time; the search is.
        return payload.outputId === "dismiss"
          ? { status: "failed", route: "failed", outputs: {}, failure: { category: "action_failed", code: "not_found", retryable: false } }
          : { status: "success", route: "success", outputs: { ok: true } };
      },
    });

    // Both dispatches happened, the join was taken, and the run did not stop
    // at the step that had nothing to press.
    expect(dispatched).toEqual(["dismiss", "search"]);
    expect(trace.attempts.map((attempt) => attempt.route)).toEqual(["failed", "success", "success"]);
    expect(trace.status).toBe("succeeded");
  });
});

/** A draft step written as a node Core itself can run, so the graph is executable here. */
function dispatching(draftStep: AutomationStudioFlowDraftStep): AutomationStudioFlowDraftWrittenStep | undefined {
  return { description: "dispatch an output", node: "builtin.policy.action", entries: [{ key: "outputId", value: String(draftStep.input.target) }] };
}

/** The assembled plan's one Subflow as the document the executor runs. */
function flowDocument(plan: NonNullable<ReturnType<typeof assemble>["plan"]>): AutomationStudioFlowDocument {
  const subflow = plan.subflows[0]!;
  return {
    schemaVersion: "0.1",
    flowId: "flow.derived-routing",
    ownerKind: "task",
    ownerId: "task.derived-routing",
    name: "Derived routing",
    createdAt: 1,
    updatedAt: 1,
    nodes: subflow.nodes.map((node) => ({ id: node.key, definitionId: node.definitionId, ...(node.parameters ? { parameterValues: node.parameters } : {}) })),
    edges: subflow.edges.map((edge) => ({ id: edge.key, sourceNodeId: edge.source.nodeKey, targetNodeId: edge.target.nodeKey, sourcePortId: edge.source.portId, targetPortId: edge.target.portId }))
  };
}
