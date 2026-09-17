import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioNodeRegistry, canonicalBuiltinAutomationNodeDefinitions } from "../../../../nodes/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../../flow-bootstrap/plan/tests/web-domain-definitions-fixture.ts";
import { checkAutomationStudioFlowBootstrapCompletion } from "../bootstrap-completion.ts";

// What a model is told when the plan it completed is refused. Live Flow
// creations were refused three times in a row for a record output whose keys
// the model had never been shown, and for handles whose placement the domain
// named by position without the feedback saying how to read one.

const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
const registry = new AutomationStudioNodeRegistry([...canonicalBuiltinAutomationNodeDefinitions, ...webDomainNodeDefinitionsFixture()]);
const extractList = { item: "li.product", fields: { name: ".name" } };

function planWith(parameters: JsonObject): JsonObject {
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

type Feedback = { refusal: string; issues: JsonObject[]; instruction: string };

async function refusal(result: JsonObject, binding?: Parameters<typeof checkAutomationStudioFlowBootstrapCompletion>[0]["binding"]) {
  const verdict = await checkAutomationStudioFlowBootstrapCompletion({ result, projectId: "project.1", flowId: "flow.1", registry, resolution, binding });
  if (verdict.ok) throw new Error("expected a refusal");
  return { verdict, feedback: verdict.check.feedback as unknown as Feedback };
}

describe("the feedback on a completed plan that was refused", () => {
  it("gives the record output shape a refused parameter takes", async () => {
    const { verdict, feedback } = await refusal({ summary: "Scrape the products", plan: planWith({ extractList, recordOutput: { name: "products", fields: ["name"] } }) });

    expect(verdict.code).toBe("flow_bootstrap.evidence_completion_plan_invalid");
    expect(verdict.check.issueCodes).toEqual(expect.arrayContaining(["record_output.unknown_key", "record_output.invalid_dataset_id"]));
    expect(feedback.issues[0]).toMatchObject({
      path: "plan.subflows.0.nodes.0.parameters.recordOutput",
      accepted: { parameter: "recordOutput", keys: expect.arrayContaining(["datasetId", "schema", "writeMode"]), example: expect.any(Object) }
    });
    expect(feedback.issues.filter((issue) => issue.accepted !== undefined)).toHaveLength(1);
    expect(feedback.instruction).toContain("carries accepted");
  });

  it("says how to read a positioned code, and gives the shape of the parameter a domain's refusal names", async () => {
    const binding = { resolvePlanNodeParameters: () => ({ status: "refused" as const, issueCodes: ["web.handle.misplaced", "web.handle.misplaced:extractList.fields.0"] }) };

    const { verdict, feedback } = await refusal({ summary: "Scrape the products", plan: planWith({ extractList }) }, binding);

    expect(verdict.code).toBe("flow_bootstrap.evidence_completion_parameters_unresolved");
    expect(feedback.issues).toEqual([
      { code: "web.handle.misplaced", path: "plan.subflows.0.nodes.0.parameters" },
      { code: "web.handle.misplaced:extractList.fields.0", path: "plan.subflows.0.nodes.0.parameters", accepted: expect.objectContaining({ parameter: "extractList" }) }
    ]);
    expect(feedback.instruction).toContain("A code written <code>:<path> names where inside that node's parameters the issue is");
    expect(feedback.instruction).toContain("a parameter's own description names any further keys it takes beside the handle.");
  });

  it("still answers a plan that does not parse, or a result that is not wrapped, by code alone", async () => {
    const unparsed = await refusal({ summary: "Scrape the products", plan: { schemaVersion: "9", subflows: "none" } });
    expect(unparsed.verdict.code).toBe("flow_bootstrap.evidence_completion_plan_invalid");
    expect(unparsed.feedback.issues.length).toBeGreaterThan(0);
    expect(unparsed.feedback.issues.every((issue) => issue.accepted === undefined)).toBe(true);

    const unwrapped = await refusal({ summary: "", plan: planWith({ extractList }) });
    expect(unwrapped.feedback.issues).toEqual([{ code: "bootstrap.completion_wrapper_invalid", path: "result" }]);
  });

  it("accepts a plan that passes every check", async () => {
    const verdict = await checkAutomationStudioFlowBootstrapCompletion({ result: { summary: "Scrape the products", plan: planWith({ extractList }) }, projectId: "project.1", flowId: "flow.1", registry, resolution });

    expect(verdict).toMatchObject({ ok: true, summary: "Scrape the products" });
  });
});
