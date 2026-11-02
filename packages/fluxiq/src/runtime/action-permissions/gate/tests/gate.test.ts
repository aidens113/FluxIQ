import { expect, it } from "vitest";
import { ActionPermissionGate, type AutomationStudioActionPermissionGateInput, type ActionPermissionPresenter } from "../index.ts";
import type { AutomationStudioActionDeclaration } from "../../../../flows/executable/permissions/index.ts";

const presentation: ActionPermissionPresenter = input => `Request ${input.missing.join(",")} for ${input.controlName ?? "withheld"}.`;
const declaration = (name: string, consequence: "move_money" | "delete" = "move_money"): AutomationStudioActionDeclaration => ({ consequences: [consequence], control: { name, kind: "operation" }, verb: "perform" });

it("retains original input receivers and raises the trusted client floor over an observing declaration", async () => {
  let derivations = 0;
  const input: AutomationStudioActionPermissionGateInput = {
    stage: "authoring", endsOnRequest: false,
    now() { expect(this).toBe(input);
    return 17.9; },
    newRequestId() { expect(this).toBe(input);
    return "request.actual"; },
    async deriveInstructed() { expect(this).toBe(input);
    derivations++;
    return [{ consequence: "move_money", instructionId: "instruction.actual", instructionDigest: `sha256:${"a".repeat(64)}`, quote: "perform the transfer" }]; }
  };
  const gate = new ActionPermissionGate(input, presentation);
  gate.observe({ kind: "llm_evidence_tool_execution", evidence: { label: "Transfer operation" }, metadata: { privateLabel: "MUST-NOT-BE-CARRIED" } });
  const verdict = await gate.checkFor({ kind: "flow_step", id: "action.actual", ref: "step.actual" })({ consequences: [], effect: "observe", control: { name: "Transfer operation" }, verb: "perform", actionEffect: { effectClass: "commit", permissionConsequences: ["move_money"] } });
  expect(verdict).toEqual({ permitted: false, missing: ["move_money"], requestId: "request.actual" });
  expect(derivations).toBe(1);
  expect(gate.request).toMatchObject({ requestedAtMs: 17, control: { name: "Transfer operation", kind: null }, missing: ["move_money"], authority: { granted: [], instructed: [{ consequence: "move_money" }] } });
  expect(gate.declarations).toMatchObject([{ action: { effect: "mutate" }, consequences: ["move_money"], permitted: false }]);
  expect(JSON.stringify(gate.request)).not.toContain("MUST-NOT-BE-CARRIED");
  gate.settle("granted");
  expect(await gate.checkFor({ kind: "flow_step", id: "action.actual", ref: "step.next" })(declaration("Transfer operation"))).toEqual({ permitted: true });
});

it("remembers the declined question while a different question may be granted without clearing that decline", async () => {
  let ordinal = 0;
  const gate = new ActionPermissionGate({ stage: "recovery", endsOnRequest: false, newRequestId: () => `request.${++ordinal}` }, presentation);
  gate.observe(["Operation Alpha", "Operation Beta"]);
  const check = gate.checkFor({ kind: "exploration_step", id: "action.actual", ref: "call.actual" });
  expect(await check(declaration("Operation Alpha"))).toMatchObject({ permitted: false, requestId: "request.1" });
  gate.settle("declined");
  expect(gate.request).toBeUndefined();
  expect(gate.standingDecline?.requestId).toBe("request.1");
  expect(await check(declaration("Operation Alpha"))).toEqual({ permitted: false, missing: ["move_money"], requestId: "request.1", declined: true });
  expect(await check(declaration("Operation Beta"))).toMatchObject({ permitted: false, requestId: "request.2" });
  gate.settle("granted");
  expect(await check(declaration("Operation Beta"))).toEqual({ permitted: true });
  expect(await check(declaration("Operation Alpha"))).toMatchObject({ permitted: false, declined: true, requestId: "request.1" });
});

it("keeps undo allowances action-local and never carries an unobserved name", async () => {
  const gate = new ActionPermissionGate({ stage: "authoring", endsOnRequest: false, newRequestId: () => "request.actual" }, presentation);
  expect(await gate.checkFor({ kind: "exploration_step", id: "action.actual", ref: "undo.actual", undoes: { act: "original.act", allowed: ["delete"] } })(declaration("Unobserved operation", "delete"))).toEqual({ permitted: true });
  expect(gate.declarations[0]).toMatchObject({ permitted: true, undoes: "original.act", control: { name: null } });
  expect(await gate.checkFor({ kind: "flow_step", id: "action.actual", ref: "step.actual" })(declaration("Unobserved operation", "delete"))).toMatchObject({ permitted: false, missing: ["delete"] });
  expect(gate.request?.control.name).toBeNull();
  gate.settle("unanswered");
  expect(gate.request?.requestId).toBe("request.actual");
});
