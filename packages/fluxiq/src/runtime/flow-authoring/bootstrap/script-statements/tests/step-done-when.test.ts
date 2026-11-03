// A step's own `done when:` (t413): which lines are a step's and which the
// block's, the expected state a step's lines become on its node, and each
// refusal at the line it is about. The plan is held to the plan validator and
// to the saved Flow's validation, so the expected state is one a Flow keeps.
import { describe, expect, it } from "vitest";
import { acceptAutomationStudioFlowBootstrapResult, automationStudioFlowBootstrapIssuePlace, parseAutomationStudioFlowScript } from "../../authoring/index.ts";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_REQUIREMENTS, type AutomationStudioFlowBootstrapPlan } from "../../plan/index.ts";
import { savedFlowValidation, stateNodeRegistryFixture, webDomainNodeDefinitionsFixture } from "../../plan/tests/index.ts";

const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
const registry = stateNodeRegistryFixture(webDomainNodeDefinitionsFixture());

const accept = (lines: readonly string[]) => acceptAutomationStudioFlowBootstrapResult({ result: { flow: lines.join("\n") }, registry, resolution });

function planOf(lines: readonly string[]): AutomationStudioFlowBootstrapPlan {
  const accepted = accept(lines);
  if (!accepted.ok) throw new Error(JSON.stringify(accepted.issues, null, 2));
  expect(accepted.issues.filter((issue) => issue.severity === "error")).toEqual([]);
  expect(savedFlowValidation(accepted.plan, registry, resolution).errors).toEqual([]);
  return accepted.plan;
}

function refusals(lines: readonly string[]): Array<{ code: string; line?: number }> {
  const accepted = accept(lines);
  expect(accepted.ok).toBe(false);
  return accepted.issues.filter((issue) => issue.severity === "error").map((issue) => {
    const line = automationStudioFlowBootstrapIssuePlace(accepted.locator, issue.path)?.line;
    return { code: issue.code, ...(line === undefined ? {} : { line }) };
  });
}

const open = ["flow: Book a meeting room", "step: open the planner", "  node: web.browser.navigate", "  url: https://rooms.test/plan"];
const hold = ["step hold: put the room on hold", "  done when: text at \".status\" contains \"On hold\"", "  node: web.dom.click", "  selector: #hold", "  consequences: create_new"];
const HELD_FACT = { fact: "text", op: "contains", value: "On hold", target: { locator: ".status" } };

describe("whose `done when:` line it is", () => {
  it("is the step's under its step line, or among its lines with more of them after it", () => {
    const { script } = parseAutomationStudioFlowScript([
      "step a: press a", "done when: exists t1", "node: web.dom.click",
      "step b: press b", "node: web.dom.click", "done when: exists t2", "consequences: none"
    ].join("\n"));
    const [a, b] = script.blocks[0]!.steps;
    expect(a!.done).toEqual([{ text: "exists t1", line: 2 }]);
    expect(b!.done).toEqual([{ text: "exists t2", line: 6 }]);
    expect(script.blocks[0]!.done).toBeUndefined();
  });

  it("stays the block's after a step's last line, before the next step, `end` or the end of the script, and before any step", () => {
    const { script } = parseAutomationStudioFlowScript([
      "done when: exists t0",
      "step a: press a", "node: web.dom.click", "done when: exists t1",
      "step b: press b", "node: web.dom.click",
      "part p: a part", "step c: press c", "node: web.dom.click", "done when: exists t3", "output: x = $step.c.ok", "end",
      "done when: exists t4"
    ].join("\n"));
    expect(script.blocks[0]!.done).toEqual([{ text: "exists t0", line: 1 }, { text: "exists t1", line: 4 }, { text: "exists t4", line: 13 }]);
    expect(script.blocks[1]!.done).toEqual([{ text: "exists t3", line: 10 }]);
    expect(script.blocks.flatMap((block) => block.steps).some((step) => step.done !== undefined)).toBe(false);
  });

  it("stays a handler's when it follows the handler's `when:` or its last step", () => {
    const { script } = parseAutomationStudioFlowScript([
      "step a: press a", "node: web.dom.click",
      "on retry for a: a notice", "when: exists t1", "done when: absent t1", "step: close it", "node: web.dom.click", "done when: absent t2", "then: carry on", "end"
    ].join("\n"));
    expect(script.blocks[1]!.done).toEqual([{ text: "absent t1", line: 5 }, { text: "absent t2", line: 8 }]);
  });
});

describe("a step's `done when:` as its node's expected state", () => {
  it("is the node's `expectedState`, as page facts, and the Flow says it needs facts", () => {
    const plan = planOf([...open, ...hold]);
    const main = plan.subflows[0]!;
    expect(main.nodes[1]!.parameters?.expectedState).toEqual({ facts: [HELD_FACT] });
    expect(main.nodes[0]!.parameters?.expectedState).toBeUndefined();
    expect(plan.metadata).toEqual({ requires: [AUTOMATION_STUDIO_FLOW_BOOTSTRAP_REQUIREMENTS.facts] });
    expect(main.metadata).toEqual({ requires: [AUTOMATION_STUDIO_FLOW_BOOTSTRAP_REQUIREMENTS.facts] });
  });

  it("takes several lines, a handle and a dialog fact, all of which must hold", () => {
    const plan = planOf([...open, "step send: send the request", "done when: exists t9", "done when: dialog alertdialog \"Sending\" absent", "node: web.dom.click", "selector: #send", "consequences: none"]);
    expect(plan.subflows[0]!.nodes[1]!.parameters?.expectedState).toEqual({ facts: [
      { fact: "exists", op: "exists", target: { handle: "t9" } },
      { fact: "dialog", op: "absent", target: { kind: "dialog", role: "alertdialog", name: "Sending" } }
    ] });
  });

  it("leaves the block's own `done when:` its success check, beside a step's", () => {
    const plan = planOf([...open, ...hold, "done when: exists at \"#calendar\""]);
    expect(plan.subflows[0]!.metadata?.["fluxiq.successCheck"]).toEqual([{ fact: "exists", op: "exists", target: { locator: "#calendar" } }]);
    expect(plan.subflows[0]!.nodes[1]!.parameters?.expectedState).toEqual({ facts: [HELD_FACT] });
  });
});

describe("a step's `done when:` refused at its line", () => {
  it("on a step that does not act: a read", () => {
    const lines = [...open, "step read: read the rooms", "  done when: exists t4", "  node: web.dom.extract_list", "  extractList: extraction.1"];
    expect(refusals(lines)).toEqual([{ code: "flow_script.fact_invalid", line: 6 }]);
    expect(accept(lines).issues.find((issue) => issue.code === "flow_script.fact_invalid")?.message).toContain("is on a step that does not act");
  });

  it("on a Core node that runs nothing on the page", () => {
    expect(refusals([...open, "step pause: wait a moment", "  done when: exists t4", "  node: builtin.timing.wait", "  duration: 2", "  unit: seconds"])).toEqual([{ code: "flow_script.fact_invalid", line: 6 }]);
  });

  it("on a step that calls a part, whose own `done when:` proves it", () => {
    const part = ["part pay: pay for it", "step: press pay", "node: web.dom.click", "selector: #pay", "consequences: move_money", "end"];
    expect(refusals([...open, "step paying: pay", "done when: exists t5", "call: pay", ...part])).toEqual([{ code: "flow_script.fact_invalid", line: 6 }]);
  });

  it("on a step that also writes its expected state by hand", () => {
    expect(refusals([...open, "step hold: put it on hold", "done when: exists t5", "node: web.dom.click", "selector: #hold", "expectedState.mode: all", "consequences: none"])).toEqual([{ code: "flow_script.fact_invalid", line: 6 }]);
  });

  it("a line that is not a fact, with the shape it should have had", () => {
    const accepted = accept([...open, "step hold: put it on hold", "done when: the room is held", "node: web.dom.click", "selector: #hold", "consequences: none"]);
    expect(accepted.ok).toBe(false);
    expect(accepted.issues.find((issue) => issue.code === "flow_script.fact_invalid")?.message).toContain("could not be read as a fact about the page");
  });
});
