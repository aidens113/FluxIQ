import { expect, it } from "vitest";
import { runWithAutomationStudioActionAssessments, beginAutomationStudioActionAssessment } from "../index.ts";
import type { AutomationStudioActionAssessmentEvent } from "../../../../flows/executable/permissions/index.ts";
import { automationStudioActionPermissionDenied } from "../../gate/index.ts";

it("preserves original assessment identity across every active ancestor and allows veto only to deny", async () => {
  const parent: AutomationStudioActionAssessmentEvent[] = [], child: AutomationStudioActionAssessmentEvent[] = [];
  await runWithAutomationStudioActionAssessments({ observe: event => parent.push(event), veto: () => true }, () => runWithAutomationStudioActionAssessments({ observe: event => child.push(event), veto: () => false }, async () => {
    const ticket = beginAutomationStudioActionAssessment({ kind: "exploration_step", id: "actual.action", ref: "actual.call" });
    expect(ticket.veto({ effectClass: "observe", permissionConsequences: [] })).toBe(true);
    ticket.settle({ effect: { effectClass: "state", permissionConsequences: [], repeatSafe: true }, permitted: false });
  }));
  expect(parent.map(event => event.kind)).toEqual(["started", "settled"]);
  expect(parent[0]!.identity).toBe(child[0]!.identity);
  expect(parent[1]!.identity).toBe(parent[0]!.identity);
  const settled = parent[1]!;
  if (settled.kind !== "settled") throw new Error("actual settlement missing");
  expect(Object.isFrozen(settled.value.effect)).toBe(true);
  expect(Object.isFrozen(settled.value.effect.permissionConsequences)).toBe(true);
});

it("keeps unreadable assessments started and treats a failing private veto as refusal", async () => {
  const events: AutomationStudioActionAssessmentEvent[] = [];
  await runWithAutomationStudioActionAssessments({ observe: event => events.push(event), veto: () => { throw new Error("actual veto unavailable"); } }, async () => {
    await expect(automationStudioActionPermissionDenied({ consequences: [], control: { name: "Actual operation" }, verb: "inspect", effect: "observe" })).resolves.toEqual({ permitted: false, missing: [], requestId: null });
    await expect(automationStudioActionPermissionDenied({ consequences: [], control: { name: "Actual operation" }, verb: "NOT VALID" })).rejects.toThrow("verb_invalid");
  });
  expect(events.map(event => event.kind)).toEqual(["started", "settled", "started"]);
  expect(events[2]!.identity).not.toBe(events[0]!.identity);
});
