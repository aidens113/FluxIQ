// A draft that says when its steps run, and the Flow that makes it true.
//
// Every assertion here is about one claim: the model states a relation between
// steps and the graph is derived from it. So what is checked is the graph --
// which node is in the plan, which port each edge leaves and arrives at -- and
// never a field copied back out of the statement that asked for it.
import { describe, expect, it } from "vitest";
import { AutomationStudioNodeRegistry } from "../../../../nodes/index.ts";
import type { AutomationStudioFlowDraftStep, AutomationStudioFlowDraftStepRouting } from "../../../flow-draft/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../plan/tests/index.ts";
import { validateAutomationStudioFlowBootstrapPlan } from "../../plan/index.ts";
import type { AutomationStudioFlowDocument } from "../../../../model/index.ts";
import { runAutomationStudioGraph } from "../../../executor/index.ts";
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
