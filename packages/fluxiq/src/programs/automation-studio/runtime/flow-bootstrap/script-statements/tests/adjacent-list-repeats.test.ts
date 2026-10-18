// Adjacent steps that each say `repeat over:` one listing are one span over it
// (t567, `run-mvcwqwec-0aa4f98b`): two loops on a listing's single-connection
// rows port cannot be built, and the plan validator's cardinality refusal gave
// the builder nothing to act on. A second span over a listing that is not
// adjacent is refused at its own line, with what to write instead.
import { describe, expect, it } from "vitest";
import { AutomationStudioNodeRegistry } from "../../../../nodes/index.ts";
import { validateAutomationStudioFlowBootstrapPlan, type AutomationStudioFlowBootstrapPlan } from "../../plan/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../plan/tests/index.ts";
import { acceptAutomationStudioFlowBootstrapResult, parseAutomationStudioFlowScript } from "../../authoring/index.ts";
import { automationStudioFlowScriptAdjacentListRepeats } from "../index.ts";

const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
const registry = new AutomationStudioNodeRegistry();
for (const definition of webDomainNodeDefinitionsFixture()) registry.register(definition);

const LOANS = JSON.stringify({ item: ".loan", fields: { title: ".title" } });
const HOLDS = JSON.stringify({ item: ".hold", fields: { title: ".title" } });

const OPEN = ["step: open the loans", "  node: web.browser.navigate", "  url: https://library.test/account/loans"];
const LIST_LOANS = ["step loans: list the loans due this week", "  node: web.dom.extract_list", `  extractList: ${LOANS}`, "  extractList.minItems: 0"];
const LIST_HOLDS = ["step holds: list the holds ready to collect", "  node: web.dom.extract_list", `  extractList: ${HOLDS}`, "  extractList.minItems: 0"];
const press = (description: string, selector: string, extra: string[] = [], label = ""): string[] => [
  `step${label ? ` ${label}` : ""}: ${description}`, "  node: web.dom.click", `  selector: ${selector}`, "  consequences: none", ...extra
];

function accept(lines: string[]) {
  return acceptAutomationStudioFlowBootstrapResult({ result: { summary: "renew loans", flow: lines.join("\n") }, registry, resolution });
}

/** Each node by definition, and each edge as `index:port -> index:port`. */
function shape(plan: AutomationStudioFlowBootstrapPlan) {
  const subflow = plan.subflows[0]!;
  const at = new Map(subflow.nodes.map((node, index) => [node.key, index] as const));
  return {
    nodes: subflow.nodes.map((node) => node.definitionId),
    edges: subflow.edges.map((edge) => `${at.get(edge.source.nodeKey)}:${edge.source.portId} -> ${at.get(edge.target.nodeKey)}:${edge.target.portId}`).sort()
  };
}

const errors = <Issue extends { severity: string }>(issues: readonly Issue[]): Issue[] => issues.filter((issue) => issue.severity === "error");

describe("adjacent steps that each repeat over one listing", () => {
  const ADJACENT = [...OPEN, ...LIST_LOANS, ...press("open the loan", ".loan-open", ["  repeat over: loans"]), ...press("renew the loan", ".renew", ["  repeat over: loans"])];

  it("read as one span: the first step repeats over the listing through the last, which takes the router's derived label", () => {
    const parsed = parseAutomationStudioFlowScript(ADJACENT.join("\n"));
    const read = automationStudioFlowScriptAdjacentListRepeats(parsed.script.blocks);
    expect(read.issues).toEqual([]);
    const steps = read.blocks[0]!.steps;
    const renewLine = ADJACENT.indexOf("step: renew the loan") + 1;
    expect(steps[2]!.repeat).toEqual(expect.objectContaining({ over: "loans", through: `:line${renewLine}` }));
    expect(steps[3]!.repeat).toBeUndefined();
    expect(steps[3]!.label).toBe(`:line${renewLine}`);
    // The parsed script is not changed underneath its caller.
    expect(parsed.script.blocks[0]!.steps[3]!.repeat?.over).toBe("loans");
    expect(parsed.script.blocks[0]!.steps[3]!.label).toBeUndefined();
  });

  it("build one loop whose body holds both steps, which the plan validator accepts", () => {
    const accepted = accept(ADJACENT);
    expect(accepted.ok ? errors(accepted.issues) : accepted.issues).toEqual([]);
    if (!accepted.ok) throw new Error("must assemble");
    const { nodes, edges } = shape(accepted.plan);
    expect(nodes).toEqual([
      "web.output.browser-navigate", "web.output.dom-extract_list", "builtin.control.merge", "builtin.control.for-each",
      "web.output.dom-click", "web.output.dom-click", "builtin.control.merge"
    ]);
    expect(edges).toEqual(expect.arrayContaining(["1:records -> 3:items", "3:body -> 4:in", "4:success -> 5:in", "5:success -> 2:branches", "3:done -> 6:in"]));
    expect(edges.filter((edge) => edge.startsWith("1:records"))).toHaveLength(1);
    expect(validateAutomationStudioFlowBootstrapPlan({ plan: accepted.plan, registry, resolution }).ok).toBe(true);
  });

  it("assemble to the plan the same span written with repeat through: assembles to", () => {
    const through = [...OPEN, ...LIST_LOANS, ...press("open the loan", ".loan-open", ["  repeat over: loans", "  repeat through: renew"]), ...press("renew the loan", ".renew", [], "renew")];
    const adjacent = [...OPEN, ...LIST_LOANS, ...press("open the loan", ".loan-open", ["  repeat over: loans"]), ...press("renew the loan", ".renew", ["  repeat over: loans"], "renew")];
    const written = accept(through);
    const merged = accept(adjacent);
    if (!written.ok || !merged.ok) throw new Error("both must assemble");
    expect(shape(merged.plan)).toEqual(shape(written.plan));
    // A labelled last step keeps its own label as the span's end.
    const read = automationStudioFlowScriptAdjacentListRepeats(parseAutomationStudioFlowScript(adjacent.join("\n")).script.blocks);
    expect(read.blocks[0]!.steps[2]!.repeat?.through).toBe("renew");
  });

  it("extend a span written with repeat through: by the adjacent step that repeats over the same listing", () => {
    const lines = [
      ...OPEN, ...LIST_LOANS,
      ...press("open the loan", ".loan-open", ["  repeat over: loans", "  repeat through: check"]),
      "step check: wait for the loan page", "  node: web.dom.wait_for_selector", "  selector: .loan-page",
      ...press("renew the loan", ".renew", ["  repeat over: loans"], "renew")
    ];
    const read = automationStudioFlowScriptAdjacentListRepeats(parseAutomationStudioFlowScript(lines.join("\n")).script.blocks);
    expect(read.issues).toEqual([]);
    expect(read.blocks[0]!.steps[2]!.repeat?.through).toBe("renew");
    const accepted = accept(lines);
    if (!accepted.ok) throw new Error(JSON.stringify(accepted.issues));
    expect(shape(accepted.plan).nodes.filter((node) => node === "builtin.control.for-each")).toHaveLength(1);
    expect(validateAutomationStudioFlowBootstrapPlan({ plan: accepted.plan, registry, resolution }).ok).toBe(true);
  });
});

describe("the repeat through: form", () => {
  it("comes back unchanged, the same blocks, when each listing is repeated over once", () => {
    const lines = [...OPEN, ...LIST_LOANS, ...press("open the loan", ".loan-open", ["  repeat over: loans", "  repeat through: renew"]), ...press("renew the loan", ".renew", [], "renew")];
    const blocks = parseAutomationStudioFlowScript(lines.join("\n")).script.blocks;
    const read = automationStudioFlowScriptAdjacentListRepeats(blocks);
    expect(read.issues).toEqual([]);
    expect(read.blocks[0]).toBe(blocks[0]);
  });
});

describe("two steps that repeat over one listing with other steps between them", () => {
  it("are refused at the second repeat over line, with what to write instead, and nothing else is refused", () => {
    const lines = [
      ...OPEN, ...LIST_LOANS,
      ...press("open the loan", ".loan-open", ["  repeat over: loans"]),
      "step: wait for the account page", "  node: web.dom.wait_for_selector", "  selector: .account",
      ...press("renew the loan", ".renew", ["  repeat over: loans"])
    ];
    const accepted = accept(lines);
    expect(accepted.ok).toBe(false);
    const second = lines.lastIndexOf("  repeat over: loans") + 1;
    const first = lines.indexOf("step: open the loan") + 1;
    const refused = errors(accepted.issues);
    expect(refused).toEqual([expect.objectContaining({ code: "flow_script.repeat_over_twice", path: `flow.line.${second}` })]);
    expect(refused[0]!.message).toContain(`starts at line ${first} already repeats over it`);
    expect(refused[0]!.message).toContain("A listing is repeated over once");
    expect(refused[0]!.message).toContain("`repeat through: <its last step>`");
  });
});

describe("adjacent steps that repeat over different listings", () => {
  it("still make two loops, one over each listing", () => {
    const lines = [
      ...OPEN, ...LIST_LOANS,
      ...press("renew the loan", ".renew", ["  repeat over: loans"]),
      ...LIST_HOLDS,
      ...press("collect the hold", ".collect", ["  repeat over: holds"])
    ];
    const read = automationStudioFlowScriptAdjacentListRepeats(parseAutomationStudioFlowScript(lines.join("\n")).script.blocks);
    expect(read.issues).toEqual([]);
    expect(read.blocks[0]!.steps.map((step) => step.repeat?.over)).toEqual([undefined, undefined, "loans", undefined, "holds"]);
    expect(read.blocks[0]!.steps.every((step) => step.repeat?.through === undefined)).toBe(true);
    const accepted = accept(lines);
    if (!accepted.ok) throw new Error(JSON.stringify(accepted.issues));
    expect(shape(accepted.plan).nodes.filter((node) => node === "builtin.control.for-each")).toHaveLength(2);
    expect(validateAutomationStudioFlowBootstrapPlan({ plan: accepted.plan, registry, resolution }).ok).toBe(true);
  });
});
