// The candidate-only loop format (t346). A model copies an example, so each
// example must build as written into the loop the legacy path builds, and the
// text must stay out of the format the legacy completion schema carries.
import { describe, expect, it } from "vitest";
import { AutomationStudioNodeRegistry, type AutomationNodePort, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import { acceptAutomationStudioFlowBootstrapResult, automationStudioFlowBootstrapWrittenPlanBindingIssues } from "../../authoring/index.ts";
import {
  AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_COMPLETION_SCHEMA,
  AUTOMATION_STUDIO_FLOW_SCRIPT_ACT_EXAMPLE,
  AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT,
  AUTOMATION_STUDIO_FLOW_SCRIPT_LOOP_FORMAT
} from "../index.ts";
import { webDomainNodeDefinitionsFixture } from "./index.ts";

const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
const fixture = webDomainNodeDefinitionsFixture();
const click = fixture.find((definition) => definition.id === "web.output.dom-click")!;
const ROW_INPUT: AutomationNodePort = { id: "item", label: "Item", valueType: "any", role: "data", required: false };
// Next-page as the web domain declares it: a `nextPage` request and an `ended` route.
const nextPage: AutomationStudioNodeDefinition = {
  ...click,
  id: "web.output.dom-next_page",
  label: "Next Page",
  description: "Go to the list's next page, and answer ended when there is none.",
  source: { kind: "importer", domainId: "web-automation", packageId: "@fluxiq-web-extension/domain", implementationKey: "web.dom.next_page" },
  outputAction: { fixedOutputId: "web.dom.next_page" },
  parameters: [{ id: "nextPage", label: "Next page", valueType: "object", ui: { control: "value" } }],
  outputs: [...click.outputs, { id: "ended", label: "Ended", valueType: "any", role: "branch" }]
};
const registry = new AutomationStudioNodeRegistry();
for (const definition of [...fixture.map((definition) => definition.id === click.id ? { ...definition, inputs: [...definition.inputs, ROW_INPUT] } : definition), nextPage]) registry.register(definition);

/** Each example of the loop format, as the script it shows. */
function examples(): Map<string, string> {
  const found = new Map<string, string>();
  let name: string | undefined;
  for (const line of AUTOMATION_STUDIO_FLOW_SCRIPT_LOOP_FORMAT.split("\n")) {
    if (line.startsWith("Example, ")) {
      name = line;
      found.set(name, "");
    } else if (name) found.set(name, `${found.get(name)}${line}\n`);
  }
  return found;
}

describe("the Flow script loop format", () => {
  it("stays out of the format, so the legacy completion schema does not change", () => {
    for (const words of ["repeat over", "repeat while", "$row."]) {
      expect(AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT).not.toContain(words);
      expect(AUTOMATION_STUDIO_FLOW_SCRIPT_ACT_EXAMPLE).not.toContain(words);
      expect(JSON.stringify(AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_COMPLETION_SCHEMA)).not.toContain(words);
    }
  });

  it("shows one example of each loop", () => {
    expect([...examples().keys()]).toEqual(["Example, reading every page of a list:", "Example, acting on each row a listing kept:", "Example, a loop the site asked to slow down:"]);
  });

  it("builds the pages example as written: a Repeat around the read and the next page, left when the list ends", () => {
    const accepted = acceptAutomationStudioFlowBootstrapResult({ result: { flow: examples().get("Example, reading every page of a list:")! }, registry, resolution });
    expect(accepted.ok ? accepted.issues.filter((issue) => issue.severity === "error") : accepted.issues).toEqual([]);
    if (!accepted.ok) return;
    const subflow = accepted.plan.subflows[0]!;
    expect(subflow.nodes.map((node) => node.definitionId)).toEqual([
      "web.output.browser-navigate", "builtin.control.merge", "builtin.control.repeat", "web.output.dom-extract_list", "web.output.dom-next_page", "builtin.control.merge"
    ]);
    expect(subflow.edges.some((edge) => edge.source.nodeKey === "s5" && edge.source.portId === "ended" && edge.target.nodeKey === "s6")).toBe(true);
    expect(subflow.nodes[3]!.parameters?.recordOutput).toMatchObject({ process: { where: [{ field: "year", atLeast: 2015 }] } });
    expect(automationStudioFlowBootstrapWrittenPlanBindingIssues({ plan: accepted.plan, registry, resolution })).toEqual([]);
  });

  it("builds the rows example as written: a For Each over the listing, the press taking each row, the row's field bound", () => {
    const accepted = acceptAutomationStudioFlowBootstrapResult({ result: { flow: examples().get("Example, acting on each row a listing kept:")! }, registry, resolution });
    expect(accepted.ok ? accepted.issues.filter((issue) => issue.severity === "error") : accepted.issues).toEqual([]);
    if (!accepted.ok) return;
    const subflow = accepted.plan.subflows[0]!;
    expect(subflow.nodes.map((node) => node.definitionId)).toEqual([
      "web.output.browser-navigate", "web.output.dom-extract_list", "builtin.control.merge", "builtin.control.for-each",
      "web.output.dom-click", "web.output.dom-wait_for_text", "builtin.control.merge"
    ]);
    expect(subflow.edges.some((edge) => edge.source.nodeKey === "s4" && edge.source.portId === "item" && edge.target.nodeKey === "s5" && edge.target.portId === "item")).toBe(true);
    expect(subflow.nodes[4]!.consequences).toEqual(["modify_existing"]);
    // t378: the rows the repeat visits are the rows the listing kept, so the
    // narrowing is the listing's own `where`, inside its request.
    expect(subflow.nodes[1]!.parameters?.extractList).toMatchObject({ where: [{ field: "status", contains: "overdue" }], minItems: 0 });
    expect(subflow.edges.some((edge) => edge.source.nodeKey === "s2" && edge.source.portId === "records" && edge.target.nodeKey === "s4" && edge.target.portId === "items")).toBe(true);
    expect(subflow.nodes[5]!.parameters?.text).toEqual({ $state: { path: "item.number" } });
    expect(automationStudioFlowBootstrapWrittenPlanBindingIssues({ plan: accepted.plan, registry, resolution })).toEqual([]);
  });

  // t378, lane D (`run-mv0fuual-f9e6f089`) and lane C: the text said "keep some"
  // was `recordOutput.process`, which shapes only the saved answer, and showed no
  // place for `repeat most:`.
  it("says the rows a repeat acts on are narrowed on the listing, and where repeat most goes", () => {
    const text = AUTOMATION_STUDIO_FLOW_SCRIPT_LOOP_FORMAT;
    expect(text).toContain("The rows a `repeat over` acts on are the rows its listing kept. To act on only some, put the condition on the listing step: `extractList.where:");
    expect(text).toContain("It never changes which rows a repeat visits.");
    expect(text).toContain("`repeat most:` goes beside `repeat while:`, on the span's first step, never under its last: `repeat while: next` then `repeat most: 20`.");
    expect(text).toContain("A span whose last step answers ended -- a next-page step -- needs none.");
  });

  // t378 W8, lane D (`run-mv0fuual-f9e6f089`): a trial that met the site's
  // request to slow down is answered in the Flow's own lines -- a guarded
  // dismissal and wait inside the span, and a pace between passes.
  it("teaches how a loop adapts when a trial says the site asked it to slow down", () => {
    const text = AUTOMATION_STUDIO_FLOW_SCRIPT_LOOP_FORMAT;
    expect(text).toContain("An `optional: yes` step may stand inside a span");
    expect(text).toContain("with `only after: <its label>` runs only on the passes where that step was done");
    expect(text).toContain("`repeat pace: <time>` goes beside `repeat over:` or `repeat while:`, on the span's first step");
    expect(text).toContain("a `builtin.timing.wait` step with `only after: <that step's label>` that waits at least the wait the feedback named; and `repeat pace:` of at least that wait on the span's first step.");
  });

  it("builds the slow-down example as written: the notice's way past and the wait meet at a join that closes the loop, and the press keeps its pace", () => {
    const accepted = acceptAutomationStudioFlowBootstrapResult({ result: { flow: examples().get("Example, a loop the site asked to slow down:")! }, registry, resolution });
    expect(accepted.ok ? accepted.issues.filter((issue) => issue.severity === "error") : accepted.issues).toEqual([]);
    if (!accepted.ok) return;
    const subflow = accepted.plan.subflows[0]!;
    expect(subflow.nodes.map((node) => node.definitionId)).toEqual([
      "web.output.browser-navigate", "web.output.dom-extract_list", "builtin.control.merge", "builtin.control.for-each",
      "web.output.dom-click", "web.output.dom-click", "builtin.timing.wait", "builtin.control.merge", "builtin.control.merge"
    ]);
    const edges = subflow.edges.map((edge) => `${edge.source.nodeKey}.${edge.source.portId} -> ${edge.target.nodeKey}.${edge.target.portId}`);
    expect(edges).toEqual(expect.arrayContaining(["s6.failed -> s8.in", "s6.success -> s7.in", "s7.success -> s8.branches", "s8.success -> s3.branches"]));
    expect(subflow.nodes[4]!.paceMs).toBe(6_000);
    expect(subflow.nodes[6]!.parameters).toMatchObject({ duration: 6, unit: "seconds" });
    expect(automationStudioFlowBootstrapWrittenPlanBindingIssues({ plan: accepted.plan, registry, resolution })).toEqual([]);
  });
});
