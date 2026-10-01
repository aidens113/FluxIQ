// A loop over a list whose listing is not the step right before the act, and a
// pass of such a loop that the page refuses as too fast.
//
// Both are about the Flow a draft's `repeat` becomes, so what is checked is the
// graph and what running it does -- never a field copied back out of the
// statement that asked for it. The first is the shape a live build keeps
// producing: the list is read, something ("Not now", a rerun put back at its
// old place, an optional step's join) lands after it, and the act repeats over
// the list (audit t195-w19a, B2). The second is the waited retry a rate-limited
// press relies on, run end to end through For Each (same audit, R3).
import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, AutomationStudioNodeRegistry, type AutomationNodePort } from "../../../../nodes/index.ts";
import type { AutomationNodeExecutionResult } from "../../../../nodes/index.ts";
import type { AutomationStudioFlowDraftStep, AutomationStudioFlowDraftStepRouting } from "../../../flow-draft/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../plan/tests/index.ts";
import { validateAutomationStudioFlowBootstrapPlan } from "../../plan/index.ts";
import type { AutomationStudioFlowDocument } from "../../../../model/index.ts";
import { runAutomationStudioGraph } from "../../../executor/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../native-node-runtime.ts";
import { assembleAutomationStudioFlowDraftPlan, type AutomationStudioFlowDraftWrittenStep } from "../assemble-draft.ts";

const resolution = {
  scope: { kind: "domain" as const, domainId: "web-automation" },
  runtimeCapabilities: ["web.actions"],
  permissions: ["web-automation.action"]
};

// The real library, with the click able to take "the row this pass is on" the
// way the web domain's click declares it downstream.
const ROW_INPUT: AutomationNodePort = { id: "item", label: "Item", valueType: "any", role: "data", required: false };
const definitions = webDomainNodeDefinitionsFixture().map((definition) => definition.id === "web.output.dom-click" ? { ...definition, inputs: [...definition.inputs, ROW_INPUT] } : definition);
const registry = new AutomationStudioNodeRegistry();
for (const definition of definitions) registry.register(definition);

function step(position: number, actionId: string, input: Record<string, string>, routing?: AutomationStudioFlowDraftStepRouting): AutomationStudioFlowDraftStep {
  return { position, id: `d${position}`, iteration: position, callId: `call.${position}`, actionId, input, effect: "mutate", effectApplied: true, disposition: "kept", ...(routing ? { routing } : {}) };
}

function write(draftStep: AutomationStudioFlowDraftStep): AutomationStudioFlowDraftWrittenStep | undefined {
  if (draftStep.actionId === "press") return { description: "press the control", node: "web.dom.click", entries: [{ key: "selector", value: String(draftStep.input.target) }] };
  if (draftStep.actionId === "read") return { description: "read the rows", node: "web.dom.extract_list", entries: [{ key: "extractList", value: JSON.stringify({ item: String(draftStep.input.target), fields: { name: ".name" } }) }] };
  return undefined;
}

function assemble(steps: AutomationStudioFlowDraftStep[]) {
  return assembleAutomationStudioFlowDraftPlan({ steps, write, registry, resolution, summary: "Confirm each request in turn" });
}

type Plan = NonNullable<ReturnType<typeof assemble>["plan"]>;

/** Every edge as `source:port -> target:port`, with each node named by its definition. */
function wiring(plan: Plan): string[] {
  const subflow = plan.subflows[0]!;
  const named = new Map(subflow.nodes.map((node) => [node.key, node.definitionId]));
  return subflow.edges.map((edge) => `${named.get(edge.source.nodeKey)}:${edge.source.portId} -> ${named.get(edge.target.nodeKey)}:${edge.target.portId}`);
}

/**
 * Every edge as `source:port -> target:port`, with each node named by its role:
 * `names[i]` is the plan's i-th node, after its definitions were checked.
 */
function roleWiring(plan: Plan, definitionIds: string[], names: string[]): string[] {
  const subflow = plan.subflows[0]!;
  expect(subflow.nodes.map((node) => node.definitionId)).toEqual(definitionIds);
  const named = new Map(subflow.nodes.map((node, index) => [node.key, names[index]!]));
  return subflow.edges.map((edge) => `${named.get(edge.source.nodeKey)}:${edge.source.portId} -> ${named.get(edge.target.nodeKey)}:${edge.target.portId}`);
}

const errors = (assembled: ReturnType<typeof assemble>) => assembled.issues.filter((issue) => issue.severity === "error");

/** The draft run 33's shape reduces to: the listing, a dismissal, the act over the listing, the read after. */
const BETWEEN = [
  step(1, "read", { target: ".request" }),
  step(2, "press", { target: "#notifications-not-now" }),
  step(3, "press", { target: ".request-confirm" }, { kind: "repeat", through: "d3", over: "d1" }),
  step(4, "read", { target: ".accepted" })
];

const OPTIONAL_BETWEEN = BETWEEN.map((draftStep) => draftStep.id === "d2" ? { ...draftStep, routing: { kind: "optional" } as const } : draftStep);

describe("a span that repeats over a list read before the steps just ahead of it", () => {
  it("walks the list's rows, with the step between run once before the loop", () => {
    const assembled = assemble(BETWEEN);

    expect(errors(assembled)).toEqual([]);
    const wired = wiring(assembled.plan!);
    expect(wired).toContain("web.output.dom-extract_list:records -> builtin.control.for-each:items");
    // The loop is entered from the step between, not from the list.
    expect(wired).toContain("web.output.dom-click:success -> builtin.control.merge:branches");
    const byRole = roleWiring(assembled.plan!, [
      "web.output.dom-extract_list", "web.output.dom-click", "builtin.control.merge", "builtin.control.for-each",
      "web.output.dom-click", "builtin.control.merge", "web.output.dom-extract_list"
    ], ["list", "dismiss", "loop", "each", "act", "exit", "after"]);
    // The list keeps its own way on, into the dismissal; the dismissal enters the loop.
    expect(byRole).toContain("list:success -> dismiss:in");
    expect(byRole).toContain("list:records -> each:items");
    expect(byRole).toContain("dismiss:success -> loop:branches");
    // The act is the loop's body and closes it; the dismissal is not in it.
    expect(byRole).toContain("loop:success -> each:in");
    expect(byRole).toContain("each:body -> act:in");
    expect(byRole).toContain("each:item -> act:item");
    expect(byRole).toContain("act:success -> loop:branches");
    expect(byRole).toContain("each:done -> exit:in");
    expect(byRole).toContain("exit:success -> after:in");
    expect(byRole.filter((edge) => edge.endsWith("-> dismiss:in"))).toEqual(["list:success -> dismiss:in"]);
  });

  it("still builds when the step between is optional, so its join stands between", () => {
    const assembled = assemble(OPTIONAL_BETWEEN);

    expect(errors(assembled)).toEqual([]);
    const byRole = roleWiring(assembled.plan!, [
      "web.output.dom-extract_list", "web.output.dom-click", "builtin.control.merge", "builtin.control.merge",
      "builtin.control.for-each", "web.output.dom-click", "builtin.control.merge", "web.output.dom-extract_list"
    ], ["list", "dismiss", "join", "loop", "each", "act", "exit", "after"]);
    expect(byRole).toContain("list:success -> dismiss:in");
    expect(byRole).toContain("list:records -> each:items");
    // Both ways out of the dismissal meet at its join, and the join enters the loop.
    expect(byRole).toContain("dismiss:failed -> join:in");
    expect(byRole).toContain("dismiss:success -> join:branches");
    expect(byRole).toContain("join:success -> loop:branches");
    expect(byRole).toContain("act:success -> loop:branches");
  });

  it("produces plans the validator accepts, with the step between plain or optional", () => {
    for (const draft of [BETWEEN, OPTIONAL_BETWEEN]) {
      const validated = validateAutomationStudioFlowBootstrapPlan({ plan: assemble(draft).plan!, registry, resolution });
      expect(validated.issues.filter((issue) => issue.severity === "error")).toEqual([]);
      expect(validated.ok).toBe(true);
    }
  });

  it("refuses a list written after the span, and names the list step rather than advising a check loop", () => {
    const assembled = assemble([
      step(1, "press", { target: ".request-confirm" }, { kind: "repeat", through: "d1", over: "d2" }),
      step(2, "read", { target: ".request" })
    ]);

    expect(assembled.plan).toBeUndefined();
    const refusal = assembled.issues.find((issue) => issue.code === "flow_draft.repeat_not_after_its_source");
    expect(refusal?.message).toContain("step 2");
    expect(refusal?.message).not.toContain("no over");
  });

  it("gives each pass its own row when the Flow runs, with the step between run once", async () => {
    const assembled = assemble(BETWEEN);
    expect(errors(assembled)).toEqual([]);
    const rows: JsonValue[] = [{ name: "synthetic-first" }, { name: "synthetic-second" }, { name: "synthetic-third" }];
    const clicked: Array<{ selector: unknown; item: unknown }> = [];
    let reads = 0;
    const trace = await run(assembled.plan!, {
      "web.dom.extract_list": () => { reads += 1; return { status: "success", route: "success", outputs: { records: reads === 1 ? rows : [] } }; },
      "web.dom.click": ({ inputs, parameters }) => { clicked.push({ selector: parameters.selector, item: inputs.item }); return { status: "success", route: "success", outputs: {} }; }
    });

    expect(trace.status).toBe("succeeded");
    // The dismissal once with no row, then the act once per row with that row.
    expect(clicked).toEqual([
      { selector: "#notifications-not-now", item: undefined },
      ...rows.map((row) => ({ selector: ".request-confirm", item: row }))
    ]);
    expect(reads).toBe(2);
  });
});

describe("a pass the page refuses as too fast", () => {
  it("waits as long as the page asked and presses the same row again", async () => {
    const assembled = assemble([
      step(1, "read", { target: ".request" }),
      step(2, "press", { target: ".request-confirm" }, { kind: "repeat", through: "d2", over: "d1" })
    ]);
    expect(errors(assembled)).toEqual([]);
    const rows: JsonValue[] = [{ name: "synthetic-1" }, { name: "synthetic-2" }, { name: "synthetic-3" }, { name: "synthetic-4" }];
    const pressed: unknown[] = [];
    const delays: number[] = [];
    const trace = await run(assembled.plan!, {
      "web.dom.extract_list": () => ({ status: "success", route: "success", outputs: { records: rows } }),
      "web.dom.click": ({ inputs }) => {
        pressed.push(inputs.item);
        // Pass 4's first press: the page says "too fast, try again in 11.5 s"
        // and confirmed nothing.
        if (pressed.length === 4) {
          return { status: "failed", route: "failed", outputs: {}, failure: { code: "web.action.rate_limited", category: "action_failed", retryable: true, stage: "execution", effect: "unacted", retryAfterMs: 11_500 } };
        }
        return { status: "success", route: "success", outputs: {} };
      }
    }, (ms) => { delays.push(ms); return Promise.resolve(); });

    expect(trace.status).toBe("succeeded");
    const clicks = trace.attempts.filter((attempt) => attempt.definitionId === "web.output.dom-click");
    expect(clicks.map((attempt) => attempt.status)).toEqual(["succeeded", "succeeded", "succeeded", "failed", "succeeded"]);
    // Pass 4 has two attempts, both on its own row.
    expect(pressed).toEqual([rows[0], rows[1], rows[2], rows[3], rows[3]]);
    expect(clicks.slice(3).map((attempt) => attempt.inputs.item)).toEqual([rows[3], rows[3]]);
    expect(delays).toEqual([11_500]);
  });
});

type Implementation = (call: { inputs: Readonly<Record<string, JsonValue>>; parameters: Readonly<Record<string, JsonValue>> }) => AutomationNodeExecutionResult;

/** Runs the plan with the web nodes it uses bound to `implementations`. */
async function run(plan: Plan, implementations: Record<string, Implementation>, delay?: (ms: number) => Promise<void>) {
  const used = new Set(["web.output.dom-extract_list", "web.output.dom-click"]);
  const runtime = new AutomationStudioNativeNodeRuntime({ permissions: ["web-automation.action"], runtimeCapabilities: ["web.actions"] }).register(
    { schemaVersion: "0.1", sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, packageId: "@fluxiq-web-extension/domain", packageVersion: "1.0.0", domainId: "web-automation", nodes: definitions.filter((definition) => used.has(definition.id)) },
    { packageId: "@fluxiq-web-extension/domain", packageVersion: "1.0.0", implementations }
  );
  return await runAutomationStudioGraph(flowDocument(plan), {
    nativeNodeExecutor: ({ node, inputs, signal }) => runtime.execute(node, inputs, signal),
    ...(delay ? { delay } : {})
  });
}

/** The assembled plan's one Subflow as the document the executor runs. */
function flowDocument(plan: Plan): AutomationStudioFlowDocument {
  const subflow = plan.subflows[0]!;
  return {
    schemaVersion: "0.1",
    flowId: "flow.repeat-loop",
    ownerKind: "task",
    ownerId: "task.repeat-loop",
    name: "Repeat loop",
    createdAt: 1,
    updatedAt: 1,
    nodes: subflow.nodes.map((node) => ({ id: node.key, definitionId: node.definitionId, ...(node.parameters ? { parameterValues: node.parameters } : {}) })),
    edges: subflow.edges.map((edge) => ({ id: edge.key, sourceNodeId: edge.source.nodeKey, targetNodeId: edge.target.nodeKey, sourcePortId: edge.source.portId, targetPortId: edge.target.portId }))
  };
}
