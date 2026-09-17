import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioNodeRegistry, canonicalBuiltinAutomationNodeDefinitions } from "../../../../nodes/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../../flow-bootstrap/plan/tests/index.ts";
import { checkAutomationStudioFlowBootstrapCompletion } from "../bootstrap-completion.ts";
import { automationStudioPlanNodeHandleSites } from "../plan-node-handles.ts";

// What a model is told when the plan it completed is refused, and what is no
// longer refused at all. Live Flow creations were refused three times in a row
// for a record output whose keys the model had never been shown, and for
// handles whose placement the domain named by position without the feedback
// saying how to read one. A key that is a spelling of one the contract names is
// now read rather than refused (`flow-bootstrap/plan/authoring/`), so what is
// left here is what cannot be derived: a dataset with no columns anywhere to
// save in it, and a result that says nothing at all.

const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
const registry = new AutomationStudioNodeRegistry([...canonicalBuiltinAutomationNodeDefinitions, ...webDomainNodeDefinitionsFixture()]);
const extractList = { item: "li.product", fields: { name: ".name" } };
const NEWLINE = String.fromCharCode(10);

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
  it("reads a record output written with the contract's keys spelled another way", async () => {
    const verdict = await checkAutomationStudioFlowBootstrapCompletion({
      result: { summary: "Scrape the products", plan: planWith({ extractList, recordOutput: { name: "Product Catalogue", columns: ["name"] } }) },
      projectId: "project.1", flowId: "flow.1", registry, resolution
    });

    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.buildPlan.plan.subflows[0]?.nodes[0]?.parameters?.recordOutput).toMatchObject({
      datasetId: "Product-Catalogue",
      writeMode: "append",
      schema: { schemaVersion: "0.1", fields: [{ id: "name", label: "Name", valueType: "string" }] }
    });
  });

  it("gives the record output shape a refused parameter takes", async () => {
    const { verdict, feedback } = await refusal({ summary: "Scrape the products", plan: planWith({ extractList: { item: "li.product" }, recordOutput: { datasetId: "products" } }) });

    expect(verdict.code).toBe("flow_bootstrap.evidence_completion_plan_invalid");
    expect(verdict.check.issueCodes).toEqual(["record_schema.not_derivable"]);
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

    const unwrapped = await refusal({});
    expect(unwrapped.feedback.issues).toEqual([{ code: "bootstrap.completion_wrapper_invalid", path: "result" }]);
  });

  it("builds the same Flow from the line format the completion schema now asks for", async () => {
    const verdict = await checkAutomationStudioFlowBootstrapCompletion({
      result: { flow: ["flow: Scrape the products", "step: read the product list", "  node: web.dom.extract_list", "  extractList.item: li.product", "  extractList.fields.name: .name"].join(NEWLINE) },
      projectId: "project.1", flowId: "flow.1", registry, resolution
    });

    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.summary).toBe("Scrape the products");
    expect(verdict.buildPlan.plan.subflows[0]?.nodes[0]).toMatchObject({
      definitionId: "web.output.dom-extract_list",
      definitionVersion: "1.0.0",
      outputActionId: "web.dom.extract_list",
      parameters: { extractList: { item: "li.product", fields: { name: ".name" } }, timeoutMs: 10_000, recordOutput: null }
    });
  });

  it("accepts a plan that passes every check", async () => {
    const verdict = await checkAutomationStudioFlowBootstrapCompletion({ result: { summary: "Scrape the products", plan: planWith({ extractList }) }, projectId: "project.1", flowId: "flow.1", registry, resolution });

    expect(verdict).toMatchObject({ ok: true, summary: "Scrape the products" });
  });
});

// Plan authoring writes a handle reference and this directory reads one, and
// the key has to be the same word. Reading the constant back out of here would
// close a module cycle, so the two are held together by what a build actually
// produces: a bare name written where an object belongs must arrive as a
// reference the resolver sees.
describe("the handle a built plan carries", () => {
  it("is the reference shape the resolver reads", async () => {
    const asked: JsonObject[] = [];
    const verdict = await checkAutomationStudioFlowBootstrapCompletion({
      result: { flow: ["step: click the row", "  node: web.dom.click", "  target: control.7"].join(NEWLINE) },
      projectId: "project.1", flowId: "flow.1", registry, resolution,
      binding: { resolvePlanNodeParameters: (request) => { asked.push(request.parameters); return { status: "resolved" as const, parameters: { selector: "li" } }; } }
    });

    expect(verdict.ok).toBe(true);
    expect(asked).toHaveLength(1);
    expect(automationStudioPlanNodeHandleSites(asked[0]!)).toMatchObject({ malformed: false, sites: [{ path: ["target"], handle: "control.7" }] });
  });
});
