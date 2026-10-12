// A refused candidate names the steps the model wrote (t378), on the scripts
// two live builds actually sent (`./live-submissions-fixture.ts`).
//
// Lane B (`run-mv0fu9pb-57454dc4`, 0058) was refused at "nodes 10 and 17" --
// the steps at lines 32 and 58 -- guessed two other steps, resent its script
// unchanged and the repeat guard ended the build. Lane C (`run-mv0fuotv-805294d7`,
// 0036) wrote its loop's bound under the span's last step and was refused for a
// repeat inside a repeat.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { acceptAutomationStudioFlowBootstrapResult } from "../../authoring/index.ts";
import { AutomationStudioFlowCandidateSubmissionController, automationStudioCandidateSubmissionRefusal } from "../index.ts";
import { LANE_B_SUBMITTED_FLOW, LANE_B_SUBMITTED_SUMMARY, LANE_C_SUBMITTED_FLOW } from "./live-submissions-fixture.ts";
import { REFUSAL_TEST_RESOLUTION, refusalTestRegistry, refusalTestSubmission } from "./refusal-domain-fixture.ts";

async function refusedEvidence(result: JsonObject) {
  const controller = new AutomationStudioFlowCandidateSubmissionController(refusalTestSubmission());
  const submitted = await controller.submit(result);
  if (submitted.ok) throw new Error("the submission was accepted");
  return automationStudioCandidateSubmissionRefusal(submitted);
}

describe("lane B's refused submission", () => {
  it("names the two steps that send a search, by line and as written, with what to write instead", async () => {
    const refusal = await refusedEvidence({ summary: LANE_B_SUBMITTED_SUMMARY, flow: LANE_B_SUBMITTED_FLOW });
    const issues = (refusal.evidence.diagnostics as JsonObject).issues as JsonObject[];
    // The plan paths are still there, and still the node indices they were.
    expect(issues.map((issue) => [issue.code, issue.path, issue.line, issue.step])).toEqual([
      ["web.step.consequences_undeclared", "plan.subflows.0.nodes.10.parameters", 32, "search for the paper towels"],
      ["web.step.expected.consequences_classes_or_none", "plan.subflows.0.nodes.10.parameters", 32, "search for the paper towels"],
      ["web.step.consequences_undeclared", "plan.subflows.0.nodes.17.parameters", 58, "search for the dinner napkins"],
      ["web.step.expected.consequences_classes_or_none", "plan.subflows.0.nodes.17.parameters", 58, "search for the dinner napkins"]
    ]);
    // One sentence per step, on its first issue: it sends its form, so it presses, and says what to write.
    const instead = issues.filter((issue) => issue.instead !== undefined);
    expect(instead.map((issue) => issue.line)).toEqual([32, 58]);
    expect(String(instead[0]!.instead)).toContain("sends its form (submit: true), which is a press");
    expect(String(instead[0]!.instead)).toContain("`consequences: none`");
    expect(String(instead[0]!.instead)).toContain("move_money, delete, send_or_publish, modify_existing, create_new");
    // next names each refused step, before what to do.
    expect(String(refusal.evidence.next)).toMatch(/^The refused steps are line 32, "search for the paper towels"; line 58, "search for the dinner napkins": /u);
  });

  it("is the same refusal when sent again unchanged, and a different one once a step is corrected", async () => {
    const first = await refusedEvidence({ summary: LANE_B_SUBMITTED_SUMMARY, flow: LANE_B_SUBMITTED_FLOW });
    const again = await refusedEvidence({ summary: LANE_B_SUBMITTED_SUMMARY, flow: LANE_B_SUBMITTED_FLOW });
    const lines = LANE_B_SUBMITTED_FLOW.split("\n");
    // The step at line 32 gains its `consequences: none`; the one at line 58 is still refused.
    const corrected = [...lines.slice(0, 36), "  consequences: none", ...lines.slice(36)].join("\n");
    const fixedOne = await refusedEvidence({ summary: LANE_B_SUBMITTED_SUMMARY, flow: corrected });
    expect(again.resultCode).toBe(first.resultCode);
    expect(first.resultCode).toMatch(/^flow_bootstrap\.evidence_completion_parameters_unresolved:[0-9a-f]{8}$/u);
    expect(fixedOne.resultCode).not.toBe(first.resultCode);
    const issues = (fixedOne.evidence.diagnostics as JsonObject).issues as JsonObject[];
    expect([...new Set(issues.map((issue) => issue.line))]).toEqual([59]);
  });
});

describe("lane C's submission", () => {
  it("passes assembly and routing: its repeat most bounds the span it is written in", () => {
    const accepted = acceptAutomationStudioFlowBootstrapResult({ result: { flow: LANE_C_SUBMITTED_FLOW }, registry: refusalTestRegistry(), resolution: REFUSAL_TEST_RESOLUTION });
    if (!accepted.ok) throw new Error(JSON.stringify(accepted.issues));
    expect(accepted.issues.filter((issue) => issue.severity === "error")).toEqual([]);
    const nodes = accepted.plan.subflows[0]!.nodes;
    const pass = nodes.find((node) => node.definitionId === "builtin.control.repeat");
    expect(pass?.parameters?.most).toBe(10);
    // The loop's derived nodes are placed at the step that says repeat (line 10).
    expect(accepted.locator?.nodes[`0.${nodes.indexOf(pass!)}`]).toEqual({ step: "read this page of results", label: "page", line: 10 });
  });
});

describe("a refused JSON plan submission", () => {
  it("names the node by the name and key the model gave it, with no line, since a JSON plan has none", async () => {
    const node = { key: "buy", name: "press buy now", definitionId: "web.output.dom-click", definitionVersion: "1.0.0", parameters: { selector: ".buy" } };
    const refusal = await refusedEvidence({
      summary: "Buy it",
      plan: { schemaVersion: "0.1", router: { name: "Buy", rules: [], fallback: { kind: "subflow", targetSubflowKey: "main" } }, subflows: [{ key: "main", name: "Main", role: "primary", nodes: [node], edges: [] }] }
    });
    const issues = (refusal.evidence.diagnostics as JsonObject).issues as JsonObject[];
    expect(issues.map((issue) => [issue.code, issue.step, issue.label, issue.line])).toEqual([
      ["web.step.consequences_undeclared", "press buy now", "buy", undefined],
      ["web.step.expected.consequences_classes_or_none", "press buy now", "buy", undefined]
    ]);
    expect(String(refusal.evidence.next)).toMatch(/^The refused step is "press buy now" \(buy\): /u);
  });
});
