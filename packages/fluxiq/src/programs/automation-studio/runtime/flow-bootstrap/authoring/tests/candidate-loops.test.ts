// A loop written in a Flow script is the loop a draft's repeat becomes (t346).
//
// Candidate mode submits a script or a JSON plan and never a draft, so the
// creation lanes that repeat -- C reads every page of a list and processes the
// rows at the end of the run, D acts on each row a listing kept -- could not be
// written at all. These tests hold a written loop to the legacy one: the same
// script, drafted and written, assembles to the same nodes, parameters and
// edges, and every written loop the graph cannot honour is refused at the line
// or parameter that says it.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioNodeRegistry, type AutomationNodePort, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import type { AutomationStudioFlowDraftStep, AutomationStudioFlowDraftStepRouting } from "../../../flow-draft/index.ts";
import { validateAutomationStudioFlowBootstrapPlan, type AutomationStudioFlowBootstrapPlan } from "../../plan/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../plan/tests/index.ts";
import {
  acceptAutomationStudioFlowBootstrapResult,
  assembleAutomationStudioFlowDraftPlan,
  automationStudioFlowBootstrapWrittenPlanBindingIssues,
  parseAutomationStudioFlowScript,
  type AutomationStudioFlowDraftWrittenStep
} from "../index.ts";

const resolution = {
  scope: { kind: "domain" as const, domainId: "web-automation" },
  runtimeCapabilities: ["web.actions"],
  permissions: ["web-automation.action"]
};

// The library as the web domain declares it downstream: a click that takes the
// row a pass is on, and a next-page step that answers `ended` when there is no
// further page (`domain/src/output-nodes/next-page/parameters.ts`).
const ROW_INPUT: AutomationNodePort = { id: "item", label: "Item", valueType: "any", role: "data", required: false };
const ENDED_OUTPUT: AutomationNodePort = { id: "ended", label: "Ended", valueType: "any", role: "branch" };
const fixture = webDomainNodeDefinitionsFixture();
const click = fixture.find((definition) => definition.id === "web.output.dom-click")!;
const nextPage: AutomationStudioNodeDefinition = {
  ...click,
  id: "web.output.dom-next_page",
  label: "Next Page",
  description: "Go to the list's next page, and answer ended when there is none.",
  source: { kind: "importer", domainId: "web-automation", packageId: "@fluxiq-web-extension/domain", implementationKey: "web.dom.next_page" },
  outputAction: { fixedOutputId: "web.dom.next_page" },
  parameters: [
    { id: "nextPage", label: "Next page", valueType: "object", ui: { control: "value" } },
    { id: "timeoutMs", label: "Timeout", valueType: "number", defaultValue: 30_000 }
  ],
  outputs: [...click.outputs, ENDED_OUTPUT]
};
const registry = new AutomationStudioNodeRegistry();
for (const definition of [...fixture.map((definition) => definition.id === click.id ? { ...definition, inputs: [...definition.inputs, ROW_INPUT] } : definition), nextPage]) registry.register(definition);

const LISTING = JSON.stringify({ item: ".product", fields: { name: ".name", price: ".price" } });
const PROCESS = JSON.stringify({ where: [{ field: "price", lessThan: 50 }] });
const NEXT = JSON.stringify({ item: ".product", pagination: { mode: "next", next: "a.next" } });
const REQUESTS = JSON.stringify({ item: ".request", fields: { name: ".who" } });

function step(position: number, actionId: string, routing?: AutomationStudioFlowDraftStepRouting): AutomationStudioFlowDraftStep {
  return { position, id: `d${position}`, iteration: position, callId: `call.${position}`, actionId, input: {}, effect: "mutate", effectApplied: true, disposition: "kept", ...(routing ? { routing } : {}) };
}

/** What each drafted step writes, in the words the matching script line says. */
const WRITTEN: Record<string, AutomationStudioFlowDraftWrittenStep> = {
  results: { description: "open the results", node: "web.browser.navigate", entries: [{ key: "url", value: "https://shop.test/search?q=earbuds" }] },
  page: { description: "read this page", node: "web.dom.extract_list", entries: [{ key: "extractList", value: LISTING }, { key: "extractList.minItems", value: "0" }, { key: "recordOutput.process", value: PROCESS }] },
  next: { description: "go to the next page", node: "web.dom.next_page", entries: [{ key: "nextPage", value: NEXT }, { key: "consequences", value: "none" }] },
  requests: { description: "open the requests", node: "web.browser.navigate", entries: [{ key: "url", value: "https://social.test/friends/requests" }] },
  list: { description: "list the requests from colleagues", node: "web.dom.extract_list", entries: [{ key: "extractList", value: REQUESTS }, { key: "extractList.minItems", value: "0" }] },
  confirm: { description: "confirm the request", node: "web.dom.click", entries: [{ key: "selector", value: ".confirm" }, { key: "consequences", value: "modify_existing" }] },
  // The draft stores a row binding as the state binding it stands for (`../../../flow-draft/binding-forms.ts`).
  confirmed: { description: "check it was confirmed", node: "web.dom.wait_for_text", entries: [{ key: "text", value: JSON.stringify({ $state: { path: "item.name" } }) }] }
};

function drafted(steps: AutomationStudioFlowDraftStep[]) {
  return assembleAutomationStudioFlowDraftPlan({ steps, write: (draftStep) => WRITTEN[draftStep.actionId], registry, resolution, summary: "loop" });
}

function written(script: string) {
  return acceptAutomationStudioFlowBootstrapResult({ result: { summary: "loop", flow: script }, registry, resolution });
}

/** A plan as nodes and edges, nodes named by where they sit, a derived dataset id aside: the draft names it after its step id, a script after its node key. */
function shape(plan: AutomationStudioFlowBootstrapPlan) {
  const subflow = plan.subflows[0]!;
  const at = new Map(subflow.nodes.map((node, index) => [node.key, index] as const));
  return {
    nodes: subflow.nodes.map((node) => {
      const parameters = structuredClone(node.parameters ?? {}) as JsonObject;
      const output = parameters.recordOutput;
      if (output && typeof output === "object" && !Array.isArray(output)) {
        delete output.datasetId;
        delete output.label;
      }
      return { definitionId: node.definitionId, parameters, consequences: node.consequences ?? [] };
    }),
    edges: subflow.edges.map((edge) => `${at.get(edge.source.nodeKey)}:${edge.source.portId} -> ${at.get(edge.target.nodeKey)}:${edge.target.portId}`).sort()
  };
}

const errors = <Issue extends { severity: string }>(issues: readonly Issue[]): Issue[] => issues.filter((issue) => issue.severity === "error");

const LANE_C = [
  "flow: Earbuds under 50 on every page of the results",
  "step: open the results",
  "  node: web.browser.navigate",
  "  url: https://shop.test/search?q=earbuds",
  "step page: read this page",
  "  node: web.dom.extract_list",
  `  extractList: ${LISTING}`,
  "  extractList.minItems: 0",
  `  recordOutput.process: ${PROCESS}`,
  "  repeat while: next",
  "step next: go to the next page",
  "  node: web.dom.next_page",
  `  nextPage: ${NEXT}`,
  "  consequences: none"
];

const LANE_D = [
  "flow: Confirm every friend request from a colleague",
  "step: open the requests",
  "  node: web.browser.navigate",
  "  url: https://social.test/friends/requests",
  "step requests: list the requests from colleagues",
  "  node: web.dom.extract_list",
  `  extractList: ${REQUESTS}`,
  "  extractList.minItems: 0",
  "step confirm: confirm the request",
  "  node: web.dom.click",
  "  selector: .confirm",
  "  consequences: modify_existing",
  "  repeat over: requests",
  "  repeat through: confirmed",
  "step confirmed: check it was confirmed",
  "  node: web.dom.wait_for_text",
  "  text: $row.name"
];

describe("lane C: read a page, go to the next, repeat until the list ends, process the rows at run end", () => {
  const legacy = drafted([step(1, "results"), step(2, "page", { kind: "repeat", through: "d3", while: "d3" }), step(3, "next")]);
  const script = written(LANE_C.join("\n"));

  it("parses the repeat as the span's statement", () => {
    const parsed = parseAutomationStudioFlowScript(LANE_C.join("\n"));
    expect(parsed.issues).toEqual([]);
    expect(parsed.script.blocks[0]!.steps[1]!.repeat).toEqual({ while: "next", line: 10 });
  });

  it("assembles to the nodes, parameters and edges the drafted repeat while builds", () => {
    expect(errors(legacy.issues)).toEqual([]);
    expect(script.ok ? errors(script.issues) : script.issues).toEqual([]);
    if (!script.ok || !legacy.plan) throw new Error("both must assemble");
    expect(shape(script.plan)).toEqual(shape(legacy.plan));
    expect(shape(script.plan).nodes.map((node) => node.definitionId)).toEqual([
      "web.output.browser-navigate", "builtin.control.merge", "builtin.control.repeat",
      "web.output.dom-extract_list", "web.output.dom-next_page", "builtin.control.merge"
    ]);
    // The loop closes on success and leaves when there is no further page.
    expect(shape(script.plan).edges).toEqual(expect.arrayContaining(["4:success -> 1:branches", "4:ended -> 5:branches", "2:done -> 5:branches", "2:body -> 3:in"]));
    // The run-end processing rides on the reading step's record output.
    expect((shape(script.plan).nodes[3]!.parameters.recordOutput as JsonObject).process).toEqual(JSON.parse(PROCESS));
  });

  it("validates, and the written-plan checks find nothing to refuse", () => {
    if (!script.ok) throw new Error("must assemble");
    expect(validateAutomationStudioFlowBootstrapPlan({ plan: script.plan, registry, resolution }).ok).toBe(true);
    expect(errors(automationStudioFlowBootstrapWrittenPlanBindingIssues({ plan: script.plan, registry, resolution }))).toEqual([]);
  });
});

describe("lane D: act on each row a listing kept, with the row bound", () => {
  const legacy = drafted([step(1, "requests"), step(2, "list"), step(3, "confirm", { kind: "repeat", through: "d4", over: "d2" }), step(4, "confirmed")]);
  const script = written(LANE_D.join("\n"));

  it("assembles to the nodes, parameters, row binding and edges the drafted repeat over builds", () => {
    expect(errors(legacy.issues)).toEqual([]);
    expect(script.ok ? errors(script.issues) : script.issues).toEqual([]);
    if (!script.ok || !legacy.plan) throw new Error("both must assemble");
    expect(shape(script.plan)).toEqual(shape(legacy.plan));
    const { nodes, edges } = shape(script.plan);
    expect(nodes.map((node) => node.definitionId)).toEqual([
      "web.output.browser-navigate", "web.output.dom-extract_list", "builtin.control.merge", "builtin.control.for-each",
      "web.output.dom-click", "web.output.dom-wait_for_text", "builtin.control.merge"
    ]);
    expect(edges).toEqual(expect.arrayContaining(["1:records -> 3:items", "3:body -> 4:in", "3:item -> 4:item", "5:success -> 2:branches", "3:done -> 6:in"]));
    expect(nodes[5]!.parameters.text).toEqual({ $state: { path: "item.name" } });
  });

  it("validates, and the written-plan checks find nothing to refuse", () => {
    if (!script.ok) throw new Error("must assemble");
    expect(validateAutomationStudioFlowBootstrapPlan({ plan: script.plan, registry, resolution }).ok).toBe(true);
    expect(errors(automationStudioFlowBootstrapWrittenPlanBindingIssues({ plan: script.plan, registry, resolution }))).toEqual([]);
  });

  it("binds a Flow input and an earlier step's output by label", () => {
    const accepted = written([
      ...LANE_D.slice(0, 4),
      "step search: search for the colleague",
      "  node: web.dom.type",
      "  selector: #search",
      "  text: $input.colleague = Ada",
      "step echo: type what the search held",
      "  node: web.dom.type",
      "  selector: #note",
      "  text: $step.search.success"
    ].join("\n"));
    expect(accepted.ok ? errors(accepted.issues) : accepted.issues).toEqual([]);
    if (!accepted.ok) return;
    const nodes = accepted.plan.subflows[0]!.nodes;
    expect(nodes[1]!.parameters?.text).toEqual({ $state: { path: "colleague", fallback: "Ada" } });
    expect(nodes[2]!.parameters?.text).toEqual({ $state: { path: "$node.s2.success" } });
    expect(errors(automationStudioFlowBootstrapWrittenPlanBindingIssues({ plan: accepted.plan, registry, resolution }))).toEqual([]);
  });
});

describe("a written loop the graph cannot honour is refused where it is said", () => {
  /**
   * The issues a script meets: its assembly's, and, once it assembles, the
   * written-plan checks', as a candidate submission meets them.
   */
  function refusals(script: string[]) {
    const accepted = written(script.join("\n"));
    const checked = accepted.ok ? errors(automationStudioFlowBootstrapWrittenPlanBindingIssues({ plan: accepted.plan, registry, resolution })) : [];
    return [...errors(accepted.issues), ...checked].map((issue) => `${issue.code} @ ${issue.path}`);
  }

  it("refuses a row field the listing does not read, naming the parameter", () => {
    expect(refusals(LANE_D.map((line) => line === "  text: $row.name" ? "  text: $row.colour" : line)))
      .toEqual(["flow_draft.row_binding_unknown_field @ plan.subflows.0.nodes.5.parameters.text"]);
  });

  it("refuses a row read outside the span, naming the parameter", () => {
    const outside = LANE_D.map((line) => line === "  repeat through: confirmed" ? "  repeat through: confirm" : line);
    expect(refusals(outside)).toEqual(["flow_draft.row_binding_outside_loop @ plan.subflows.0.nodes.6.parameters.text"]);
  });

  it("refuses a step outside a loop reading a step inside it", () => {
    const after = [...LANE_C, "step: count what was read", "  node: web.dom.type", "  selector: #count", "  text: $step.page.records"];
    expect(refusals(after)).toEqual(["flow_draft.step_binding_repeated_source @ plan.subflows.0.nodes.6"]);
  });

  it("refuses a span whose last step is outside the block or before it", () => {
    expect(refusals(LANE_D.map((line) => line === "  repeat through: confirmed" ? "  repeat through: elsewhere" : line))).toEqual(["flow_script.repeat_span_unknown @ flow.line.13"]);
    expect(refusals(LANE_D.map((line) => line === "  repeat through: confirmed" ? "  repeat through: requests" : line))).toEqual(["flow_script.repeat_span_unknown @ flow.line.13"]);
  });

  it("refuses a span member that branches out of it, and a branch into it", () => {
    const out = [...LANE_D.slice(0, -1), "  text: $row.name", "  on failed: go to requests"];
    expect(refusals(out)).toEqual(["flow_script.repeat_body_branches @ flow.line.18"]);
    const into = [...LANE_D.slice(0, 8), "  on failed: go to confirmed", ...LANE_D.slice(8)];
    expect(refusals(into)).toEqual(["flow_script.branch_into_repeat @ flow.line.9"]);
  });

  it("refuses an unbounded repeat while, and takes it once repeat most bounds it", () => {
    const pressing = LANE_C.map((line) => line === "  node: web.dom.next_page" ? "  node: web.dom.click" : line === `  nextPage: ${NEXT}` ? "  selector: a.next" : line);
    expect(refusals(pressing)).toEqual(["flow_script.repeat_while_never_ends @ flow.line.10"]);
    const bounded = refusals([...pressing.slice(0, 10), "  repeat most: 5", ...pressing.slice(10)]);
    expect(bounded).toEqual([]);
    expect(refusals([...pressing.slice(0, 10), "  repeat most: lots", ...pressing.slice(10)])).toEqual(["flow_script.repeat_invalid @ flow.line.10"]);
  });

  it("refuses a repeat over a listing written after the span, or one naming no step", () => {
    expect(refusals(LANE_D.map((line) => line === "  repeat over: requests" ? "  repeat over: confirmed" : line))).toEqual(["flow_script.repeat_not_after_its_source @ flow.line.13"]);
    expect(refusals(LANE_D.map((line) => line === "  repeat over: requests" ? "  repeat over: nothing" : line))).toEqual(["flow_script.repeat_span_unknown @ flow.line.13"]);
  });

  it("refuses a malformed binding at its parameter", () => {
    expect(refusals(LANE_D.map((line) => line === "  text: $row.name" ? "  text: $input.who" : line))).toEqual(["flow_script.invalid_binding @ plan.subflows.0.nodes.5.parameters.text"]);
    expect(refusals(LANE_D.map((line) => line === "  text: $row.name" ? "  text: $step.nowhere.success" : line))).toEqual(["flow_script.invalid_binding @ plan.subflows.0.nodes.5.parameters.text"]);
  });

  it("refuses a cycle a JSON plan closes through joins alone", () => {
    const plan: AutomationStudioFlowBootstrapPlan = {
      schemaVersion: "0.1",
      router: { name: "loop", rules: [], fallback: { kind: "subflow", targetSubflowKey: "main" } },
      subflows: [{
        key: "main", name: "Main", role: "primary",
        nodes: [
          { key: "open", definitionId: "web.output.browser-navigate", definitionVersion: "1.0.0", parameters: { url: "https://shop.test" }, outputActionId: "web.browser.navigate" },
          { key: "loop", definitionId: "builtin.control.merge", definitionVersion: registry.get("builtin.control.merge", resolution)!.version },
          { key: "press", definitionId: "web.output.dom-click", definitionVersion: "1.0.0", parameters: { selector: "a.more" }, outputActionId: "web.dom.click" }
        ],
        edges: [
          { key: "e1", source: { nodeKey: "open", portId: "success" }, target: { nodeKey: "loop", portId: "branches" } },
          { key: "e2", source: { nodeKey: "loop", portId: "success" }, target: { nodeKey: "press", portId: "in" } },
          { key: "e3", source: { nodeKey: "press", portId: "success" }, target: { nodeKey: "loop", portId: "branches" } }
        ]
      }]
    };
    expect(errors(automationStudioFlowBootstrapWrittenPlanBindingIssues({ plan, registry, resolution })).map((issue) => `${issue.code} @ ${issue.path}`))
      .toEqual(["flow_draft.loop_unbounded @ plan.subflows.0.nodes.1"]);
  });
});

describe("a script that says nothing about repeating", () => {
  it("comes through routing as the very steps it was", () => {
    const script = ["flow: one", "step: open", "  node: web.browser.navigate", "  url: https://shop.test"].join("\n");
    const parsed = parseAutomationStudioFlowScript(script);
    expect(parsed.script.blocks[0]!.steps[0]!.repeat).toBeUndefined();
    const accepted = written(script);
    expect(accepted.ok && accepted.plan.subflows[0]!.nodes.map((node) => node.key)).toEqual(["s1"]);
  });
});
