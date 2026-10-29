// The order Core hands a repeat's rows in (t796, `run-mvtdn37t-e1e4d0a7`): a
// listing whose node hands its rows on in page order and carries its own sort
// gives that sort to each For Each it feeds, which orders the rows before it
// takes its first `repeat most`. Checked on the plan a script or a draft
// assembles into, and on hand-built plans for what is left alone.
import { describe, expect, it } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import { AutomationStudioNodeRegistry, canonicalBuiltinAutomationNodeDefinitions, type AutomationNodePort } from "../../../../nodes/index.ts";
import type { AutomationStudioFlowDraftStep, AutomationStudioFlowDraftStepRouting } from "../../../flow-draft/index.ts";
import type { AutomationStudioFlowBootstrapPlan } from "../../plan/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../plan/tests/index.ts";
import { assembleAutomationStudioFlowDraftPlan, type AutomationStudioFlowDraftWrittenStep } from "../../authoring/index.ts";
import { automationStudioFlowPlanRepeatOrder } from "../repeat-order.ts";

const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
const READ = "web.output.dom-extract_list";
const FOR_EACH = "builtin.control.for-each";
const ROW_INPUT: AutomationNodePort = { id: "item", label: "Item", valueType: "any", role: "data", required: false };

/** The web library, its read declaring what the downstream domain declares (`rows-order.ts`) unless told not to. */
function library(pageOrder: boolean): AutomationStudioNodeRegistry {
  return new AutomationStudioNodeRegistry([
    ...canonicalBuiltinAutomationNodeDefinitions,
    ...webDomainNodeDefinitionsFixture().map((definition) => {
      if (definition.id === "web.output.dom-click") return { ...definition, inputs: [...definition.inputs, ROW_INPUT] };
      if (definition.id !== READ || !pageOrder) return definition;
      return { ...definition, metadata: { ...definition.metadata, answersRows: "page_order", recordProcessWrittenAt: { sort: "extractList.sort", limit: "extractList.maxItems" } } };
    })
  ]);
}
const pageOrder = library(true);

const newestFirst = [{ field: "published", order: "desc", as: "date" }];

/** A catalogue read feeding a For Each whose body places a hold, as a `repeat over` span assembles. */
function holdLoop(listing: JsonObject, loop: JsonObject = { stopAfter: 3 }): AutomationStudioFlowBootstrapPlan {
  const nodes = [
    { key: "s1", definitionId: READ, parameters: listing },
    { key: "s2", definitionId: "builtin.control.merge" },
    { key: "s3", definitionId: FOR_EACH, parameters: loop },
    { key: "s4", definitionId: "web.output.dom-click", consequences: ["create_new"] },
    { key: "s5", definitionId: "builtin.control.merge" }
  ];
  const edges = ["s1.success>s2.in", "s1.records>s3.items", "s2.success>s3.in", "s3.body>s4.in", "s3.item>s4.item", "s4.success>s2.branches", "s3.done>s5.in"];
  return {
    schemaVersion: "0.1",
    router: { name: "Holds", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } },
    subflows: [{
      key: "primary", name: "Primary", role: "primary",
      nodes: nodes.map((node) => ({ definitionVersion: "1.0.0", ...node })),
      edges: edges.map((pair, index) => {
        const [source, target] = pair.split(">") as [string, string];
        const [sourceKey, sourcePort] = source.split(".") as [string, string];
        const [targetKey, targetPort] = target.split(".") as [string, string];
        return { key: `e${index}`, source: { nodeKey: sourceKey, portId: sourcePort }, target: { nodeKey: targetKey, portId: targetPort } };
      })
    }]
  };
}

const ordered = (plan: AutomationStudioFlowBootstrapPlan, registry = pageOrder) => automationStudioFlowPlanRepeatOrder({ plan, registry, resolution });
const loopOf = (plan: AutomationStudioFlowBootstrapPlan) => plan.subflows[0]!.nodes.find((node) => node.definitionId === FOR_EACH)!;

describe("a page-order listing's own sort, lowered onto the For Each it feeds", () => {
  it("gives the For Each the listing's sort beside its stop, and leaves the listing as written", () => {
    const listing = { extractList: { handle: "extraction.1", sort: newestFirst } };
    const plan = holdLoop(listing);
    const lowered = ordered(plan);
    expect(loopOf(lowered).parameters).toEqual({ stopAfter: 3, order: newestFirst });
    // The listing keeps its sort, so the answer it saves is in the same order as the rows the repeat walked.
    expect(lowered.subflows[0]!.nodes[0]!.parameters).toEqual(listing);
    // The plan it was given is not changed in place.
    expect(loopOf(plan).parameters).toEqual({ stopAfter: 3 });
  });

  it("writes one sort key the listing gave as a list of one", () => {
    expect(loopOf(ordered(holdLoop({ extractList: { handle: "extraction.1", sort: newestFirst[0]! } }))).parameters?.order).toEqual(newestFirst);
  });

  it.each([
    { case: "a listing whose node does not declare page order", listing: { extractList: { handle: "extraction.1", sort: newestFirst } }, registry: library(false) },
    { case: "no sort", listing: { extractList: { handle: "extraction.1" } }, registry: pageOrder },
    { case: "a sort written off", listing: { extractList: { handle: "extraction.1", sort: [] as JsonValue } }, registry: pageOrder },
    { case: "a sort only in recordOutput.process, which orders only the saved answer", listing: { extractList: { handle: "extraction.1" }, recordOutput: { datasetId: "books", process: { sort: newestFirst } } }, registry: pageOrder }
  ])("leaves the plan as it was for $case", ({ listing, registry }) => {
    const plan = holdLoop(listing as JsonObject);
    expect(ordered(plan, registry)).toBe(plan);
  });

  it("keeps an order the For Each already holds", () => {
    const own = [{ field: "title", order: "asc", as: "text" }];
    const plan = holdLoop({ extractList: { handle: "extraction.1", sort: newestFirst } }, { stopAfter: 3, order: own });
    expect(ordered(plan)).toBe(plan);
  });
});

describe("a drafted repeat over a page-order listing with a sort", () => {
  function step(position: number, actionId: string, input: Record<string, string>, routing?: AutomationStudioFlowDraftStepRouting): AutomationStudioFlowDraftStep {
    return { position, id: `d${position}`, iteration: position, callId: `call.${position}`, actionId, input, effect: "mutate", effectApplied: true, disposition: "kept", ...(routing ? { routing } : {}) };
  }
  function write(draftStep: AutomationStudioFlowDraftStep): AutomationStudioFlowDraftWrittenStep | undefined {
    if (draftStep.actionId === "read") return { description: "list the books", node: "web.dom.extract_list", entries: [{ key: "extractList", value: JSON.stringify({ item: ".book", fields: { title: ".title", published: ".published" }, sort: newestFirst }) }] };
    if (draftStep.actionId === "press") return { description: "place a hold", node: "web.dom.click", entries: [{ key: "selector", value: String(draftStep.input.target) }] };
    return undefined;
  }

  it("assembles a For Each that orders the rows by that sort, then takes the first N", () => {
    const steps = [step(1, "read", { target: ".book" }), step(2, "press", { target: ".hold" }, { kind: "repeat", through: "d2", over: "d1", most: 3 })];
    const assembled = assembleAutomationStudioFlowDraftPlan({ steps, write, registry: pageOrder, resolution, summary: "Place a hold on the three newest books" });
    expect(assembled.issues.filter((issue) => issue.severity === "error")).toEqual([]);
    expect(loopOf(assembled.plan!).parameters).toMatchObject({ stopAfter: 3, order: newestFirst });
  });
});
