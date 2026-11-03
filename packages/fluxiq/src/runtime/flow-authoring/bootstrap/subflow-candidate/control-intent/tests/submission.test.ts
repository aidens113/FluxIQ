import { describe, expect, it } from "vitest";
import type { AutomationStudioResolvedControlIntent } from "../../../../../llm/harness-options/index.ts";
import { AutomationStudioSubflowScopedSubmissionController } from "../../index.ts";
import { OPEN, SIBLINGS, script, testScope, testSubmission } from "../../tests/subflow-fixture.ts";

function controller(intent?: AutomationStudioResolvedControlIntent) {
  const base = testSubmission();
  return new AutomationStudioSubflowScopedSubmissionController({ scope: testScope(), siblings: [...SIBLINGS], submission: {
    ...base, binding: { resolvePlanNodeParameters: async (input) => {
      const answer = await base.binding.resolvePlanNodeParameters(input);
      return answer.status === "resolved" && input.nodeDefinitionId === "web.output.dom-click" && intent ? { ...answer, controlIntent: intent } : answer;
    } }
  } });
}

const sent = () => script([...OPEN, "step: answer the notice", "  node: web.dom.click", "  selector: .answer", "  element.visibleText: A control", "  consequences: none", "  optional: yes"]);

describe("resolved intent through the actual scoped subflow submission", () => {
  it("refuses acceptance on its source consequence line before rekeying the probe into the scope", async () => {
    const result = await controller({ intent: "accept" }).submit({ ...sent(), controlIntents: { 'main.s2': { intent: "accept", responseOnly: true } } });
    expect(result).toMatchObject({ ok: false, check: { issueCodes: ["flow_script.way_out_accepts"] } });
    expect(JSON.stringify(result)).toContain("flow.line.9");
  });

  it("accepts genuine response-only semantics and preserves the scoped executable proposal and digest", async () => {
    const plain = await controller().submit(sent());
    const response = await controller({ intent: "accept", responseOnly: true }).submit(sent());
    expect(plain.ok, JSON.stringify(plain)).toBe(true);
    expect(response.ok, JSON.stringify(response)).toBe(true);
    if (!plain.ok || !response.ok) return;
    expect(response.proposal.subflows.map((part) => part.key)).toEqual(["find_listing"]);
    expect(JSON.stringify(response.proposal.subflows)).toBe(JSON.stringify(plain.proposal.subflows));
    expect(response.proposal.digest).toBe(plain.proposal.digest);
    expect(JSON.stringify(response.proposal)).not.toContain("controlIntent");
  });
});
