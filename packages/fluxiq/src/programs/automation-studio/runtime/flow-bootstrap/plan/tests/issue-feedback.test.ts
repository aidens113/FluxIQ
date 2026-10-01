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
