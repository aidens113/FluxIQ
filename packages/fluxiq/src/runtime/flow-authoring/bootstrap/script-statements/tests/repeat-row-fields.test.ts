// The row fields a repeat reads, kept by the listing that gives them (t869, `../repeat/row-fields.ts`):
// a read narrowed to the columns the instruction names still stores the field a step in its repeat
// is bound to, and shows only what was asked. Checked on the plan a draft assembles into, and on
// hand-built plans for what is left alone.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import { AutomationStudioNodeRegistry, canonicalBuiltinAutomationNodeDefinitions, type AutomationNodePort } from "../../../../../framework/automation-service/nodes/index.ts";
import type { AutomationStudioFlowDraftStep, AutomationStudioFlowDraftStepRouting } from "../../../draft/index.ts";
import type { AutomationStudioFlowBootstrapPlan } from "../../plan/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../plan/tests/index.ts";
import { assembleAutomationStudioFlowDraftPlan, type AutomationStudioFlowDraftWrittenStep } from "../../authoring/index.ts";
import { automationStudioFlowPlanRepeatRowFields } from "../repeat/index.ts";

const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
const READ = "web.output.dom-extract_list";
const ROW_INPUT: AutomationNodePort = { id: "item", label: "Item", valueType: "any", role: "data", required: false };
const registry = new AutomationStudioNodeRegistry([
  ...canonicalBuiltinAutomationNodeDefinitions,
  ...webDomainNodeDefinitionsFixture().map((definition) => definition.id === "web.output.dom-click" ? { ...definition, inputs: [...definition.inputs, ROW_INPUT] } : definition)
]);
const ASKED = "Save the cheapest lamps, then give me a table of my saved items with columns title and price.";
const BY_ADDRESS = JSON.stringify({ $state: { path: "item.url" } });

const readOf = (plan: AutomationStudioFlowBootstrapPlan) => plan.subflows[0]!.nodes.find((node) => node.definitionId === READ)!;

describe("a drafted repeat that opens each row by its address, under an instruction naming other columns", () => {
  function step(position: number, actionId: string, routing?: AutomationStudioFlowDraftStepRouting): AutomationStudioFlowDraftStep {
    return { position, id: `d${position}`, iteration: position, callId: `call.${position}`, actionId, input: {}, effect: "mutate", effectApplied: true, disposition: "kept", ...(routing ? { routing } : {}) };
  }
  const written = (address: string) => (draftStep: AutomationStudioFlowDraftStep): AutomationStudioFlowDraftWrittenStep | undefined => {
    if (draftStep.actionId === "read") return { description: "list the lamps", node: "web.dom.extract_list", entries: [{ key: "extractList", value: JSON.stringify({ item: ".lamp", fields: { title: ".title", price: ".price", url: ".link" } }) }] };
    if (draftStep.actionId === "open") return { description: "open the lamp", node: "web.browser.navigate", entries: [{ key: "url", value: address }] };
    if (draftStep.actionId === "save") return { description: "save it", node: "web.dom.click", entries: [{ key: "selector", value: ".save" }] };
    return undefined;
  };
  const steps = [step(1, "read"), step(2, "open", { kind: "repeat", through: "d3", over: "d1" }), step(3, "save")];

  it("stores the address the repeat opens each row by, and shows only the columns asked for", () => {
    const assembled = assembleAutomationStudioFlowDraftPlan({ steps, write: written(BY_ADDRESS), registry, resolution, summary: "Save the lamps", instructionText: ASKED });
    expect(assembled.issues.filter((issue) => issue.severity === "error")).toEqual([]);
    const output = readOf(assembled.plan!).parameters?.recordOutput as JsonObject;
    expect((output.schema as { fields: { id: string }[] }).fields.map((field) => field.id)).toEqual(["title", "price", "url"]);
    expect(output.process).toMatchObject({ columns: ["title", "price"] });
  });

  it("leaves the read as the instruction narrowed it when no step of the repeat reads the row", () => {
    const assembled = assembleAutomationStudioFlowDraftPlan({ steps, write: written(JSON.stringify("https://shop.example.test/lamp")), registry, resolution, summary: "Save the lamps", instructionText: ASKED });
    const output = readOf(assembled.plan!).parameters?.recordOutput as JsonObject;
    expect((output.schema as { fields: { id: string }[] }).fields.map((field) => field.id)).toEqual(["title", "price"]);
    expect(output.process).toBeUndefined();
  });
});

describe("on a hand-built plan", () => {
  /** A read feeding a For Each whose body opens the row by `opens` and presses Save. */
  function loop(read: JsonObject, opens: JsonObject): AutomationStudioFlowBootstrapPlan {
    const nodes = [
      { key: "s1", definitionId: READ, parameters: read },
      { key: "s2", definitionId: "builtin.control.merge" },
      { key: "s3", definitionId: "builtin.control.for-each" },
      { key: "s4", definitionId: "web.output.browser-navigate", parameters: opens },
      { key: "s5", definitionId: "web.output.dom-click", consequences: ["modify_existing"] },
      { key: "s6", definitionId: "builtin.control.merge" }
    ];
    const edges = ["s1.success>s2.in", "s1.records>s3.items", "s2.success>s3.in", "s3.body>s4.in", "s4.success>s5.in", "s3.item>s5.item", "s5.success>s2.branches", "s3.done>s6.in"];
    return {
      schemaVersion: "0.1",
      router: { name: "Lamps", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } },
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
  const field = (id: string) => ({ id, label: id, valueType: "string" });
  const read = (fields: string[], process?: JsonObject): JsonObject => ({
    extractList: { item: ".lamp", fields: { title: ".title", price: ".price", url: ".link" } },
    recordOutput: { datasetId: "lamps", writeMode: "append", schema: { schemaVersion: "0.1", fields: fields.map(field) }, ...(process ? { process } : {}) }
  });
  const kept = (plan: AutomationStudioFlowBootstrapPlan) => automationStudioFlowPlanRepeatRowFields({ plan, registry, resolution });

  it("keeps the columns an author already chose to show, and adds the row's field beside them", () => {
    const plan = loop(read(["title", "price"], { columns: ["title"] }), { url: { $state: { path: "item.url" } } });
    const output = readOf(kept(plan)).parameters?.recordOutput as JsonObject;
    expect((output.schema as { fields: { id: string }[] }).fields.map((each) => each.id)).toEqual(["title", "price", "url"]);
    expect(output.process).toEqual({ columns: ["title"] });
    // The plan it was given is not changed in place.
    expect(((readOf(plan).parameters?.recordOutput as JsonObject).schema as { fields: unknown[] }).fields).toHaveLength(2);
  });

  it("returns the same plan when the read already keeps the field, or does not read it", () => {
    const already = loop(read(["title", "url"]), { url: { $state: { path: "item.url" } } });
    expect(kept(already)).toBe(already);
    const unread = loop(read(["title"]), { url: { $state: { path: "item.link" } } });
    expect(kept(unread)).toBe(unread);
  });
});
