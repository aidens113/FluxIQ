// The recovery's one permission gate: its authority is the run's permitted consequences plus the
// instruction's stored, still-current set, and nothing else -- not a policy
// flag, and not a model reading the instruction again mid-recovery.

import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowInstruction } from "../../../../model/index.ts";
import { automationStudioInstructionDigest } from "../../../action-permissions/index.ts";
import { automationStudioRecoveryPermissionGate } from "../permissions.ts";

// A class the gate still asks about, so what each row proves is the authority
// and not the narrowing of 2026-09-26: a press declaring `modify_existing` is
// now permitted whatever the permitted consequences or the instruction said, which would leave
// every "permits it" row below passing without testing anything.
const PRESS = { consequences: ["delete"] as const, control: { name: "Remove unfillable line", kind: "button" }, verb: "press" };

describe("automationStudioRecoveryPermissionGate", () => {
  it("permits nothing with nothing permitted and no stored set, and asks for exactly what was missing", async () => {
    const built = automationStudioRecoveryPermissionGate({ granted: undefined, storedInstructed: undefined, instructions: [instruction()], newRequestId: () => "permission-request:one" });

    expect(built.summary()).toEqual({ granted: [], instructed: [], lapsed: [] });
    const verdict = await built.gate.checkFor({ kind: "exploration_step", id: "web.press", ref: "call.1" })({ ...PRESS, consequences: [...PRESS.consequences] });
    expect(verdict).toEqual({ permitted: false, missing: ["delete"], requestId: "permission-request:one" });
    expect(built.gate.request).toMatchObject({
      missing: ["delete"],
      reason: { stage: "recovery", instructionIds: ["instruction.dispatch"] },
      authority: { granted: [], instructed: [] }
    });
  });

  it("holds the permitted recognised classes in Core's order, and drops a word Core does not know", async () => {
    const built = automationStudioRecoveryPermissionGate({ granted: ["delete", "purchase", "send_or_publish"], storedInstructed: undefined, instructions: [] });

    expect(built.summary().granted).toEqual(["delete", "send_or_publish"]);
    expect(await built.gate.checkFor({ kind: "exploration_step", id: "web.press", ref: "call.1" })({ ...PRESS, consequences: ["delete"] })).toEqual({ permitted: true });
    expect(built.gate.request).toBeUndefined();
  });

  it("takes the instruction's authority from the set stored with the Flow while the instruction still reads the same", async () => {
    const current = instruction();
    const built = automationStudioRecoveryPermissionGate({ granted: [], storedInstructed: [stored(current)], instructions: [current] });

    expect(built.summary()).toEqual({ granted: [], instructed: ["delete"], lapsed: [] });
    expect(await built.gate.checkFor({ kind: "exploration_step", id: "web.press", ref: "call.1" })({ ...PRESS, consequences: ["delete"] })).toEqual({ permitted: true });
  });

  it("lets that authority lapse once the instruction is edited or no longer active, and asks", async () => {
    const original = instruction();
    for (const now of [{ ...original, body: `${original.body} Only the first batch.` }, { ...original, status: "disabled" as const }]) {
      const built = automationStudioRecoveryPermissionGate({ granted: [], storedInstructed: [stored(original)], instructions: [now] });

      expect(built.summary()).toEqual({ granted: [], instructed: [], lapsed: ["delete"] });
      const verdict = await built.gate.checkFor({ kind: "exploration_step", id: "web.press", ref: "call.1" })({ ...PRESS, consequences: ["delete"] });
      expect(verdict.permitted).toBe(false);
    }
  });

  it("reads nothing it cannot parse as authority", () => {
    const built = automationStudioRecoveryPermissionGate({ granted: [], storedInstructed: [{ consequence: "delete", quote: "Remove unfillable line" }, "delete", null], instructions: [instruction()] });

    expect(built.summary()).toEqual({ granted: [], instructed: [], lapsed: [] });
  });

  // The failure packet was shown to the diagnosis, so a control named there may
  // be named to the person; a name nothing showed is withheld.
  it("carries a control's name only when the failure evidence it was given showed it", async () => {
    const shown = automationStudioRecoveryPermissionGate({ granted: [], storedInstructed: undefined, instructions: [], failureEvidence: { schemaVersion: "test.page.v1", controls: ["Remove unfillable line"] } });
    await shown.gate.checkFor({ kind: "exploration_step", id: "web.press", ref: "call.1" })({ ...PRESS, consequences: ["delete"] });
    expect(shown.gate.request?.control.name).toBe("Remove unfillable line");

    const unseen = automationStudioRecoveryPermissionGate({ granted: [], storedInstructed: undefined, instructions: [] });
    await unseen.gate.checkFor({ kind: "exploration_step", id: "web.press", ref: "call.1" })({ ...PRESS, consequences: ["delete"] });
    expect(unseen.gate.request?.control.name).toBeNull();
  });

  it("hands out a summary a reader cannot change the gate's record through", () => {
    const built = automationStudioRecoveryPermissionGate({ granted: ["create_new"], storedInstructed: undefined, instructions: [] });
    built.summary().granted.push("delete");

    expect(built.summary().granted).toEqual(["create_new"]);
  });
});

function instruction(): AutomationStudioFlowInstruction {
  return {
    schemaVersion: "0.1",
    instructionId: "instruction.dispatch",
    title: "Dispatch the batch",
    body: "Pick and pack the dispatch batch, and remove any line the warehouse cannot fill.",
    scope: { kind: "flow", projectId: "project.recovery", flowId: "flow.recovery" },
    priority: 1,
    status: "active",
    requirement: "required",
    createdAt: 1,
    updatedAt: 1
  };
}

function stored(source: AutomationStudioFlowInstruction) {
  return { consequence: "delete", instructionId: source.instructionId, instructionDigest: automationStudioInstructionDigest(source), quote: "remove any line the warehouse cannot fill" };
}
