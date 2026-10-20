// A refusal about a node's input is placed at that node's own step (t738).
//
// Office run `run-mvgf04kw-310fc169` (0216-0220): an unconnected required input
// on the script's last step was refused at a path naming the node by key, which
// the locator does not read, so the issue fell back to the block's first step
// and the model was told to "correct that step" -- a step that was right. These
// hold a later step's input refusal to that step's own description and line.
import { describe, expect, it } from "vitest";
import { AutomationStudioNodeRegistry, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import { validateAutomationStudioFlowBootstrapPlan } from "../../plan/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../plan/tests/index.ts";
import { acceptAutomationStudioFlowBootstrapResult, automationStudioFlowBootstrapIssuePlace } from "../index.ts";

const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
const WRITE_RECORDS = "builtin.data.write-records";

/** A node that tallies rows handed to it on a required input, with no parameter standing in for it. */
function tallyDefinition(registry: AutomationStudioNodeRegistry): AutomationStudioNodeDefinition {
  const base = registry.get(WRITE_RECORDS, resolution)!;
  return {
    ...base,
    id: "builtin.data.tally-rows",
    label: "Tally Rows",
    inputs: [...base.inputs.filter((port) => port.role === "control"), { id: "rows", label: "Rows", valueType: "array", required: true }],
    parameters: base.parameters.filter((parameter) => parameter.id !== "records")
  };
}

const registry = new AutomationStudioNodeRegistry();
for (const definition of webDomainNodeDefinitionsFixture()) registry.register(definition);
registry.register(tallyDefinition(registry));

/** A reading list: open it, read two values one by one, then a last step written by each test, at line 13. */
function script(...last: string[]): string {
  return [
    "flow: Keep the reading list's first title and author", // 1
    "step: open the reading list",                          // 2
    "  node: web.browser.navigate",                         // 3
    "  url: https://books.test/list",                       // 4
    "step title: read the first title",                     // 5
    "  node: web.dom.extract",                              // 6
    "  selector: .title",                                    // 7
    "  extract.mode: text",                                 // 8
    "step author: read the first author",                   // 9
    "  node: web.dom.extract",                              // 10
    "  selector: .author",                                   // 11
    "  extract.mode: text",                                 // 12
    ...last
  ].join("\n");
}

/** The script accepted, then validated against the registry as every check after authoring does, and the issue placed by the acceptance's locator. */
function refused(text: string, code: string) {
  const accepted = acceptAutomationStudioFlowBootstrapResult({ result: { flow: text }, registry, resolution });
  if (!accepted.ok) throw new Error(`not accepted: ${JSON.stringify(accepted.issues.map((each) => each.code))}`);
  const issues = validateAutomationStudioFlowBootstrapPlan({ plan: accepted.plan, registry, resolution }).issues;
  const issue = issues.find((each) => each.severity === "error" && each.code === code);
  if (!issue) throw new Error(`not refused with ${code}: ${JSON.stringify(issues.map((each) => each.code))}`);
  return { issue, place: automationStudioFlowBootstrapIssuePlace(accepted.locator, issue.path) };
}

describe("an unconnected required input on a later step", () => {
  it("is placed at that step's own description and line, never the block's first step, and says how a port is fed", () => {
    const { issue, place } = refused(script("step: tally the titles", "  node: builtin.data.tally-rows"), "bootstrap.required_input_unconnected");

    expect(issue.path).toMatch(/^plan\.subflows\.0\.nodes\.\d+\.inputs\.rows$/u);
    expect(place).toEqual({ step: "tally the titles", line: 13 });
    expect(issue.instead).toContain("No script line connects a step's input by name");
  });
});

describe("a Write Records step given no rows and no connection", () => {
  it("is refused at plan validation, placed at its own step and line", () => {
    const { issue, place } = refused(
      script("step: keep the title and author", `  node: ${WRITE_RECORDS}`, "  recordOutput.datasetId: shelf", "  recordOutput.schema: {\"schemaVersion\": \"0.1\", \"fields\": [{\"id\": \"title\", \"label\": \"Title\", \"valueType\": \"string\"}]}"),
      "bootstrap.missing_parameter"
    );

    expect(issue.path).toMatch(/^plan\.subflows\.0\.nodes\.\d+\.parameters\.records$/u);
    expect(place).toEqual({ step: "keep the title and author", line: 13 });
    expect(issue.instead).toContain("Write `records:` on this step");
  });

  it("passes plan validation once its rows are written", () => {
    const accepted = acceptAutomationStudioFlowBootstrapResult({
      result: { flow: script("step: keep the title and author", `  node: ${WRITE_RECORDS}`, "  records: [{title: $step.title.value, author: $step.author.value}]") },
      registry,
      resolution
    });

    if (!accepted.ok) throw new Error(`not accepted: ${JSON.stringify(accepted.issues.map((each) => each.code))}`);
    expect(validateAutomationStudioFlowBootstrapPlan({ plan: accepted.plan, registry, resolution }).issues.filter((issue) => issue.severity === "error")).toEqual([]);
  });
});
