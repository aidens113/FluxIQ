import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioResolvedControlIntent } from "../../../../../agents/llm/harness-options/index.ts";
import { AutomationStudioActionPermissionGate } from "../../../../../action-permissions/automation/index.ts";
import { AutomationStudioFlowCandidateSubmissionController } from "../../index.ts";
import { refusalTestSubmission } from "../../tests/refusal-domain-fixture.ts";

const OPEN = ["flow: Answer the interruption", "step: open the page", "  node: web.browser.navigate", "  url: https://library.test/"];
const press = (extra: string[] = [], consequences = "none") => [...OPEN, "step: answer the notice", "  node: web.dom.click", "  selector: .answer", "  element.visibleText: A control", `  consequences: ${consequences}`, ...extra].join("\n");
function submission(intent?: AutomationStudioResolvedControlIntent) {
  const base = refusalTestSubmission();
  return { ...base, binding: { resolvePlanNodeParameters: async (input: Parameters<typeof base.binding.resolvePlanNodeParameters>[0]) => {
    const answer = await base.binding.resolvePlanNodeParameters(input);
    return answer.status === "resolved" && input.nodeDefinitionId === "web.output.dom-click" && intent ? { ...answer, controlIntent: intent } : answer;
  } } };
}

describe("resolved intent through the actual candidate submission", () => {
  it("refuses host acceptance after completion transport despite a forged model-side response or sidecar", async () => {
    const controller = new AutomationStudioFlowCandidateSubmissionController(submission({ intent: "accept" }));
    const sent = { flow: press(["  optional: yes"]), controlIntent: { intent: "accept", responseOnly: true }, controlIntents: { 'main.s2': { intent: "accept", responseOnly: true } } };
    const result = await controller.submit(sent);
    expect(result).toMatchObject({ ok: false, check: { issueCodes: ["flow_script.way_out_accepts"] } });
    expect(JSON.stringify(result)).toContain("flow.line.9");
    expect(controller.latest()).toBeUndefined();
  });

  it("does not let a model-written consent handler grant the host-known acceptance exception", async () => {
    const flow = [...OPEN, "step rows: read rows", "  node: web.dom.extract_list", "  extractList: {\"item\": \".row\", \"fields\": {\"name\": \".name\"}}",
      "on before for rows: an interruption", '  when: dialog consent "Your choices"', "  step: answer it", "    node: web.dom.click", "    selector: .answer", "    element.accessibleName: A control", "    consequences: none", "  then: carry on", "end"].join("\n");
    const result = await new AutomationStudioFlowCandidateSubmissionController(submission({ intent: "accept" })).submit({ flow });
    expect(result).toMatchObject({ ok: false, check: { issueCodes: ["flow_script.way_out_accepts"] } });
    expect(JSON.stringify(result)).toContain("flow.line.14");
  });

  it("accepts the host's response exception with byte-equivalent executable plans and no persisted annotation", async () => {
    const flow = press(["  optional: yes"]);
    const plain = await new AutomationStudioFlowCandidateSubmissionController(submission()).submit({ flow });
    const response = await new AutomationStudioFlowCandidateSubmissionController(submission({ intent: "accept", responseOnly: true })).submit({ flow });
    expect(plain.ok, JSON.stringify(plain)).toBe(true);
    expect(response.ok, JSON.stringify(response)).toBe(true);
    if (!plain.ok || !response.ok) return;
    expect(JSON.stringify(response.candidate.buildPlan)).toBe(JSON.stringify(plain.candidate.buildPlan));
    expect(response.candidate.digest).toBe(plain.candidate.digest);
    expect(JSON.stringify(response.candidate)).not.toContain("controlIntent");
    expect(Object.hasOwn(response, "controlIntents")).toBe(false);
    expect(response.handleViews).toEqual([]);
  });

  it("does not classify an unannotated accepting label in Core", async () => {
    const result = await new AutomationStudioFlowCandidateSubmissionController(submission()).submit({ flow: press(["  optional: yes"]).replace("A control", "Buy now and subscribe") });
    expect(result.ok, JSON.stringify(result)).toBe(true);
  });

  it("leaves explicit lasting declarations to the actual permission gate regardless of a response-only annotation", async () => {
    for (const granted of [false, true]) {
      const gate = new AutomationStudioActionPermissionGate({ stage: "authoring", permittedConsequences: granted ? ["move_money"] : [], newRequestId: () => "permission-request:intent" });
      const base = submission({ intent: "accept", responseOnly: true });
      const controller = new AutomationStudioFlowCandidateSubmissionController({ ...base,
        permissionFor: ({ definitionId, ref }) => gate.checkFor({ kind: "flow_step", id: definitionId, ref }),
        binding: { resolvePlanNodeParameters: async (input) => {
          if (input.nodeDefinitionId === "web.output.dom-click") await input.permission({ consequences: ["move_money"], control: { name: "A control" }, verb: "press" });
          return base.binding.resolvePlanNodeParameters(input);
        } } });
      const result = await controller.submit({ flow: press([], "move_money") });
      expect(result.ok, JSON.stringify(result)).toBe(granted);
      expect(gate.declarations).toEqual([expect.objectContaining({ consequences: ["move_money"], permitted: granted })]);
      if (!granted) expect(result).toMatchObject({ ok: false, check: { issueCodes: ["bootstrap.step_permission_required"] } });
      else if (result.ok) expect(result.candidate.buildPlan.plan.subflows.flatMap((part) => part.nodes).find((node) => node.definitionId === "web.output.dom-click")?.consequences).toEqual(["move_money"]);
    }
  });
});
