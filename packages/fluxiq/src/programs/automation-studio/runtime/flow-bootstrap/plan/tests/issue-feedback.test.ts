import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import {
  AutomationStudioNodeRegistry,
  canonicalBuiltinAutomationNodeDefinitions,
  parseAutomationStudioRecordOutput
} from "../../../../nodes/index.ts";
import {
  automationStudioFlowBootstrapIssueFeedback,
  validateAutomationStudioFlowBootstrapPlan,
  type AutomationStudioFlowBootstrapIssue,
  type AutomationStudioFlowBootstrapPlan
} from "../index.ts";
import { webDomainNodeDefinitionsFixture } from "./web-domain-definitions-fixture.ts";

// A refused plan is only worth asking about again if the model is told what
// would have been accepted. Live Flow creations were refused three times in a
// row for a record output whose keys the model had never been shown; the
// feedback named the codes and nothing else.

const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
const registry = new AutomationStudioNodeRegistry([...canonicalBuiltinAutomationNodeDefinitions, ...webDomainNodeDefinitionsFixture()]);
const recordOutputPath = "plan.subflows.0.nodes.0.parameters.recordOutput";

function planWith(parameters: JsonObject): AutomationStudioFlowBootstrapPlan {
  return {
    schemaVersion: "0.1",
    router: { name: "Scrape", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } },
    subflows: [{
      key: "primary",
      name: "Primary",
      role: "primary",
      nodes: [{ key: "scrape", definitionId: "web.output.dom-extract_list", definitionVersion: "1.0.0", outputActionId: "web.dom.extract_list", parameters }],
      edges: []
    }]
  };
}

function feedbackFor(parameters: JsonObject): { issues: AutomationStudioFlowBootstrapIssue[]; feedback: JsonObject[] } {
  const plan = planWith(parameters);
  const { issues } = validateAutomationStudioFlowBootstrapPlan({ plan, registry, resolution });
  return { issues, feedback: automationStudioFlowBootstrapIssueFeedback({ issues, plan, registry, resolution }) };
}

const extractList = { item: "li.product", fields: { name: ".name" } };

describe("the feedback on a refused plan", () => {
  it("names every issue at its path, and gives the record output shape it accepts once for that parameter", () => {
    const { issues, feedback } = feedbackFor({ extractList, recordOutput: { name: "products", fields: ["name", "price"] } });

    expect(feedback.map((item) => item.code)).toEqual(issues.map((issue) => issue.code));
    expect(feedback.map((item) => item.code)).toEqual(expect.arrayContaining(["record_output.unknown_key", "record_output.invalid_dataset_id", "record_schema.not_object"]));
    expect(feedback.every((item) => item.path === recordOutputPath)).toBe(true);
    const accepted = feedback.filter((item) => item.accepted !== undefined);
    expect(accepted).toHaveLength(1);
    expect(accepted[0]).toBe(feedback[0]);
    expect(accepted[0]!.accepted).toEqual({
      parameter: "recordOutput",
      keys: ["datasetId", "label", "recordsPath", "schema", "writeMode", "maxRecords"],
      requiredKeys: ["datasetId", "schema", "writeMode"],
      shape: expect.stringContaining("this node supplies it"),
      example: expect.any(Object)
    });
    const example = (accepted[0]!.accepted as { example: JsonObject }).example;
    expect(parseAutomationStudioRecordOutput({ ...example, recordsPath: "result.extracted" })).toMatchObject({ ok: true });
  });

  it("gives a parameter's declared type, description and example for a value its definition refused", () => {
    const { feedback } = feedbackFor({ extractList: "li.product" });

    expect(feedback).toEqual([{
      code: "bootstrap.invalid_parameter_value",
      path: "plan.subflows.0.nodes.0.parameters.extractList",
      accepted: {
        parameter: "extractList",
        type: "object",
        required: true,
        description: expect.stringContaining("item: CSS selector of each record"),
        example: { item: "li.product", fields: { name: ".name", price: ".price", url: "a@href" }, paginate: { mode: "next", next: "a.next", maxPages: 5 }, minItems: 1 }
      }
    }]);
  });

  // The key here is one that names nothing this node has, because a key that
  // is plainly one of its own -- `recordsOutput` for `recordOutput`, which
  // this row used to be written with -- is no longer refused at all: it is
  // corrected into the plan and recorded as an assumption
  // (`../name-correction.ts`). What is left for this feedback to answer is a
  // key with no plausible candidate, and that is what it is asked here.
  it("lists the parameters a node declares when the plan names one it does not", () => {
    const { feedback } = feedbackFor({ extractList, screenshot: null });

    expect(feedback).toEqual([{
      code: "bootstrap.unknown_parameter",
      path: "plan.subflows.0.nodes.0.parameters.screenshot",
      accepted: { parameters: ["extractList", "timeoutMs", "recordOutput", "expectedState"] }
    }]);
  });

  it("does not answer at all for a parameter name it could resolve itself", () => {
    const { issues } = feedbackFor({ extractList, recordsOutput: null });

    expect(issues).toEqual([]);
  });

  it("gives the shape of the parameter a domain's positioned refusal names, once", () => {
    const at = "plan.subflows.0.nodes.0.parameters";
    const issues: AutomationStudioFlowBootstrapIssue[] = [
      { severity: "error", code: "web.handle.misplaced", message: "withheld", path: at },
      { severity: "error", code: "web.handle.misplaced:extractList.fields.0", message: "withheld", path: at },
      { severity: "error", code: "web.handle.malformed:extractList.paginate", message: "withheld", path: at },
      { severity: "error", code: "web.handle.misplaced:notDeclared.0", message: "withheld", path: at }
    ];

    const feedback = automationStudioFlowBootstrapIssueFeedback({ issues, plan: planWith({ extractList }), registry, resolution });

    expect(feedback[0]).toEqual({ code: "web.handle.misplaced", path: at });
    expect(feedback[1]).toMatchObject({ code: "web.handle.misplaced:extractList.fields.0", path: at, accepted: { parameter: "extractList", type: "object" } });
    expect(feedback[2]).toEqual({ code: "web.handle.malformed:extractList.paginate", path: at });
    expect(feedback[3]).toEqual({ code: "web.handle.misplaced:notDeclared.0", path: at });
  });

  it("adds no accepted shape to an issue that is not about a parameter, and carries an authored sentence but not an unlisted code's", () => {
    const issues: AutomationStudioFlowBootstrapIssue[] = [
      { severity: "error", code: "bootstrap.definition_unavailable", message: "Core's own sentence", path: "plan.subflows.0.nodes.0.definitionId" },
      { severity: "error", code: "bootstrap.primary_count", message: "withheld", path: "plan.subflows" },
      { severity: "error", code: "bootstrap.invalid_plan", message: "withheld" }
    ];

    // `definition_unavailable` is one of Core's own authored refusals, so its
    // sentence travels with the code: a code and a path say where a plan was
    // refused and never why, and a model that cannot read why can only send the
    // same plan back. The other two are not listed, so they stay code and path.
    expect(automationStudioFlowBootstrapIssueFeedback({ issues, plan: planWith({}), registry, resolution })).toEqual([
      { code: "bootstrap.definition_unavailable", path: "plan.subflows.0.nodes.0.definitionId", message: "Core's own sentence" },
      { code: "bootstrap.primary_count", path: "plan.subflows" },
      { code: "bootstrap.invalid_plan" }
    ]);
    expect(automationStudioFlowBootstrapIssueFeedback({ issues: [{ severity: "error", code: "record_output.unknown_key", message: "withheld", path: recordOutputPath }] }))
      .toEqual([{ code: "record_output.unknown_key", path: recordOutputPath }]);
    expect(automationStudioFlowBootstrapIssueFeedback({ issues: [{ severity: "error", code: "record_output.unknown_key", message: "withheld", path: recordOutputPath }], plan: { not: "a plan" }, registry, resolution }))
      .toEqual([{ code: "record_output.unknown_key", path: recordOutputPath }]);
  });

  it("carries the sentence of an act only a step the Flow may skip does", () => {
    expect(automationStudioFlowBootstrapIssueFeedback({ issues: [{ severity: "error", code: "bootstrap.instructed_act_only_optional", message: "Only an optional step does it." }] }))
      .toEqual([{ code: "bootstrap.instructed_act_only_optional", message: "Only an optional step does it." }]);
  });

  it("never carries a validator's message", () => {
    const { feedback } = feedbackFor({ extractList, recordOutput: { nonsense: true } });

    expect(JSON.stringify(feedback)).not.toContain("does not satisfy");
  });

  // Whole since 2026-09-30: it was held to sixteen issues, 300-character paths and a 3,000-byte budget on shapes.
  it("carries every issue, each whole path printable, and every parameter's accepted shape once", () => {
    const plan = {
      schemaVersion: "0.1",
      router: { name: "Many", rules: [], fallback: { kind: "fail" } },
      subflows: [{
        key: "primary", name: "Primary", role: "primary", edges: [],
        nodes: Array.from({ length: 40 }, (_, index) => ({ key: `n${index}`, definitionId: "web.output.dom-extract_list", definitionVersion: "1.0.0", parameters: {} }))
      }]
    };
    const issues: AutomationStudioFlowBootstrapIssue[] = [
      ...Array.from({ length: 40 }, (_, index) => ({ severity: "error" as const, code: "record_output.unknown_key", message: "withheld", path: `plan.subflows.0.nodes.${index}.parameters.recordOutput` })),
      { severity: "error", code: "bootstrap.invalid_symbol", message: "withheld", path: `plan. ${"x".repeat(400)}` }
    ];

    const feedback = automationStudioFlowBootstrapIssueFeedback({ issues: [issues[40]!, ...issues], plan, registry, resolution });

    expect(feedback).toHaveLength(42);
    expect(feedback[0]!.path).toBe(`plan.${"x".repeat(400)}`);
    expect(feedback[0]!.path).not.toContain(" ");
    // One shape per node's record output, all forty: the shape is given once per parameter, never cut to a budget.
    expect(feedback.filter((item) => item.accepted !== undefined)).toHaveLength(40);
  });
});

// Lane A round 4 (`run-muyrpbnk-fef374e7`, 0037-0068, t356 C3): twelve refusals named a node index and never the
// handles it held, so the model sent the same start-page handles every time.
describe("a refused handle is named", () => {
  const plan = { subflows: [{ nodes: [{ parameters: { target: { handle: "t925" } } }, { parameters: { target: { handle: "t478", location: "~/" }, note: { handle: "t9" } } }] }] };

  it("names the handles under the parameter the code positions, with the location written beside one", () => {
    const feedback = automationStudioFlowBootstrapIssueFeedback({ plan, issues: [
      { code: "web.handle.unknown:target", path: "plan.subflows.0.nodes.1.parameters", severity: "error", message: "" },
      { code: "web.handle.unknown", path: "plan.subflows.0.nodes.1.parameters", severity: "error", message: "" }
    ] });
    expect(feedback[0]).toMatchObject({ code: "web.handle.unknown:target", handles: [{ handle: "t478", location: "~/" }] });
    // Placed on the parameters as a whole with no parameter in its code: every handle the node holds.
    expect(feedback[1]).toMatchObject({ handles: [{ handle: "t478", location: "~/" }, { handle: "t9" }] });
  });

  it("names nothing for an issue that is not about a handle", () => {
    const feedback = automationStudioFlowBootstrapIssueFeedback({ plan, issues: [{ code: "bootstrap.invalid_parameter_value", path: "plan.subflows.0.nodes.0.parameters.target", severity: "error", message: "" }] });
    expect(feedback[0]!.handles).toBeUndefined();
  });
});

// Lane B (`run-mv0fu9pb-57454dc4`, 0058) was refused `web.step.consequences_undeclared`
// for two steps that typed a search and sent it, and nothing said that sending
// a form is a press. An undeclared consequence now says what to write (t378).
describe("the feedback on a step whose consequences are undeclared", () => {
  const undeclared = (path: string): AutomationStudioFlowBootstrapIssue[] => [
    { code: "web.step.consequences_undeclared", path, severity: "error", message: "" },
    { code: "web.step.expected.consequences_classes_or_none", path, severity: "error", message: "" }
  ];
  const plan = (parameters: JsonObject): AutomationStudioFlowBootstrapPlan => ({
    ...planWith({}),
    subflows: [{ key: "primary", name: "Primary", role: "primary", nodes: [{ key: "s1", definitionId: "web.output.dom-type", definitionVersion: "1.0.0", parameters }], edges: [] }]
  });

  it("says once per step that sending its form is a press, and what to write instead", () => {
    const feedback = automationStudioFlowBootstrapIssueFeedback({ plan: plan({ selector: "#q", text: "towels", submit: true }), issues: undeclared("plan.subflows.0.nodes.0.parameters") });
    expect(feedback.map((entry) => entry.instead === undefined)).toEqual([false, true]);
    const instead = String(feedback[0]!.instead);
    expect(instead).toContain("sends its form (submit: true), which is a press");
    expect(instead).toContain("`consequences: none`");
    expect(instead).toContain("`consequences: <classes>`, naming those of move_money, delete, send_or_publish, modify_existing, create_new");
    // Fixed words: nothing the step holds is quoted back.
    expect(instead).not.toContain("towels");
  });

  it("says a step that presses needs the line, and gives each refused step its own sentence", () => {
    const issues = [...undeclared("plan.subflows.0.nodes.0.parameters"), ...undeclared("plan.subflows.0.nodes.1.parameters")];
    const feedback = automationStudioFlowBootstrapIssueFeedback({ plan: plan({ selector: "#buy" }), issues });
    expect(feedback.filter((entry) => entry.instead !== undefined)).toHaveLength(2);
    expect(String(feedback[0]!.instead)).toMatch(/^This step presses something/u);
  });

  it("says nothing instead for any other issue", () => {
    const feedback = automationStudioFlowBootstrapIssueFeedback({ plan: plan({}), issues: [{ code: "web.handle.unknown", path: "plan.subflows.0.nodes.0.parameters", severity: "error", message: "" }] });
    expect(feedback[0]!.instead).toBeUndefined();
  });
});
