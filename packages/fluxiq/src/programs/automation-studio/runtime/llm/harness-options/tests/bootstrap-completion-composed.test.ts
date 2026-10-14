// The completion check's one sequence for a Flow Core composed itself
// (`checkAutomationStudioFlowBootstrapPlanCompletion`, origin `composed`): read
// as the plan it is, never through the reply reader; its elements held to
// having been resolved already; refused with Core's own words.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { refusalTestSubmission } from "../../../flow-bootstrap/candidate/tests/refusal-domain-fixture.ts";
import type { AutomationStudioFlowBootstrapPlan } from "../../../flow-bootstrap/plan/index.ts";
import { checkAutomationStudioFlowBootstrapCompletion, checkAutomationStudioFlowBootstrapPlanCompletion } from "../bootstrap-completion.ts";

const SCRIPT = [
  "flow: Find the titles",
  "step first: run reader",
  "  call: reader",
  "  author: $input.author = Ada Hart",
  "end",
  "end",
  "part reader: read the titles",
  "  input: author",
  "  output: titles = $step.rows.records",
  "  step rows: read the rows",
  "    node: web.dom.extract_list",
  "    extractList: extraction.1",
  "    extractList.minItems: 0",
  "end"
].join("\n");

const context = () => {
  const submission = refusalTestSubmission();
  return { projectId: submission.projectId, flowId: submission.flowId, registry: submission.registry, resolution: submission.resolution, binding: submission.binding, permissionFor: submission.permissionFor };
};

/** The plan a model's script resolves to, every element resolved by the domain. */
async function resolvedPlan(): Promise<AutomationStudioFlowBootstrapPlan> {
  const verdict = await checkAutomationStudioFlowBootstrapCompletion({ ...context(), result: { flow: SCRIPT } });
  if (!verdict.ok) throw new Error(JSON.stringify(verdict.check.feedback));
  return structuredClone(verdict.buildPlan.plan);
}

describe("a composed Flow's completion check", () => {
  it("keeps every part's interface and metadata, which a model's JSON plan through the reply reader loses", async () => {
    const plan = await resolvedPlan();
    const composed = await checkAutomationStudioFlowBootstrapPlanCompletion({ ...context(), origin: "composed", plan, summary: "Find the titles" });
    expect(composed.ok, JSON.stringify(composed)).toBe(true);
    if (!composed.ok) return;
    expect(composed.buildPlan.plan.subflows.find((subflow) => subflow.key === "reader")?.interface?.outputs.map((port) => port.id)).toEqual(["titles"]);
    expect(composed.buildPlan.plan.metadata).toEqual({ requires: ["flow.subflow-calls@1"] });
    const replied = await checkAutomationStudioFlowBootstrapCompletion({ ...context(), result: { plan: plan as unknown as JsonObject, summary: "Find the titles" } });
    expect(replied.ok && replied.buildPlan.plan.subflows.find((subflow) => subflow.key === "reader")?.interface).toBeFalsy();
  });

  it("refuses a handle still named, in Core's words, and runs the same validation a model's Flow meets", async () => {
    const plan = await resolvedPlan();
    const reader = plan.subflows.find((subflow) => subflow.key === "reader")!;
    reader.nodes[0]!.parameters = { ...reader.nodes[0]!.parameters, extractList: { handle: "extraction.1" } };
    const handle = await checkAutomationStudioFlowBootstrapPlanCompletion({ ...context(), origin: "composed", plan, summary: "s" });
    expect(handle.ok).toBe(false);
    if (handle.ok) return;
    expect(handle.code).toBe("flow_bootstrap.evidence_completion_parameters_unresolved");
    expect(handle.check.issueCodes).toEqual(["bootstrap.composed_handle_unresolved"]);
    expect(String(handle.check.feedback.instruction)).toContain("Core composed this Flow");
    const invalid = await resolvedPlan();
    invalid.subflows[0]!.nodes[0]!.parameters = { ...invalid.subflows[0]!.nodes[0]!.parameters, subflowId: "missing_part" };
    const refused = await checkAutomationStudioFlowBootstrapPlanCompletion({ ...context(), origin: "composed", plan: invalid, summary: "s" });
    expect(refused.ok === false && refused.code).toBe("flow_bootstrap.evidence_completion_plan_invalid");
  });
});
