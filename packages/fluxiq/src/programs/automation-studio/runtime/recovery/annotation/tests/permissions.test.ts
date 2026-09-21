// The recovery's one permission gate: its authority is the grant plus the
// instruction's stored, still-current set, and nothing else -- not a policy
// flag, and not a model reading the instruction again mid-recovery.

import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowInstruction } from "../../../../model/index.ts";
import { automationStudioInstructionDigest } from "../../../action-permissions/index.ts";
import { automationStudioRecoveryPermissionGate } from "../permissions.ts";

const PRESS = { consequences: ["modify_existing"] as const, control: { name: "Pick and pack", kind: "button" }, verb: "press" };

describe("automationStudioRecoveryPermissionGate", () => {
  it("permits nothing with no grant and no stored set, and asks for exactly what was missing", async () => {
    const built = automationStudioRecoveryPermissionGate({ granted: undefined, storedInstructed: undefined, instructions: [instruction()], newRequestId: () => "permission-request:one" });

    expect(built.summary()).toEqual({ granted: [], instructed: [], lapsed: [] });
    const verdict = await built.gate.checkFor({ kind: "exploration_step", id: "web.press", ref: "call.1" })({ ...PRESS, consequences: [...PRESS.consequences] });
    expect(verdict).toEqual({ permitted: false, missing: ["modify_existing"], requestId: "permission-request:one" });
    expect(built.gate.request).toMatchObject({
      missing: ["modify_existing"],
      reason: { stage: "recovery", instructionIds: ["instruction.dispatch"] },
      authority: { granted: [], instructed: [] }
    });
  });

  it("holds the grant's recognised classes in Core's order, and drops a word Core does not know", async () => {
    const built = automationStudioRecoveryPermissionGate({ granted: ["modify_existing", "purchase", "send_or_publish"], storedInstructed: undefined, instructions: [] });

    expect(built.summary().granted).toEqual(["send_or_publish", "modify_existing"]);
    expect(await built.gate.checkFor({ kind: "exploration_step", id: "web.press", ref: "call.1" })({ ...PRESS, consequences: ["modify_existing"] })).toEqual({ permitted: true });
    expect(built.gate.request).toBeUndefined();
  });

  it("takes the instruction's authority from the set stored with the Flow while the instruction still reads the same", async () => {
    const current = instruction();
    const built = automationStudioRecoveryPermissionGate({ granted: [], storedInstructed: [stored(current)], instructions: [current] });

    expect(built.summary()).toEqual({ granted: [], instructed: ["modify_existing"], lapsed: [] });
    expect(await built.gate.checkFor({ kind: "exploration_step", id: "web.press", ref: "call.1" })({ ...PRESS, consequences: ["modify_existing"] })).toEqual({ permitted: true });
  });

  it("lets that authority lapse once the instruction is edited or no longer active, and asks", async () => {
    const original = instruction();
    for (const now of [{ ...original, body: `${original.body} Only the first batch.` }, { ...original, status: "disabled" as const }]) {
      const built = automationStudioRecoveryPermissionGate({ granted: [], storedInstructed: [stored(original)], instructions: [now] });

      expect(built.summary()).toEqual({ granted: [], instructed: [], lapsed: ["modify_existing"] });
      const verdict = await built.gate.checkFor({ kind: "exploration_step", id: "web.press", ref: "call.1" })({ ...PRESS, consequences: ["modify_existing"] });
      expect(verdict.permitted).toBe(false);
    }
  });

  it("reads nothing it cannot parse as authority", () => {
    const built = automationStudioRecoveryPermissionGate({ granted: [], storedInstructed: [{ consequence: "modify_existing", quote: "Pick and pack" }, "modify_existing", null], instructions: [instruction()] });

    expect(built.summary()).toEqual({ granted: [], instructed: [], lapsed: [] });
  });

  // The failure packet was shown to the diagnosis, so a control named there may
  // be named to the person; a name nothing showed is withheld.
  it("carries a control's name only when the failure evidence it was given showed it", async () => {
    const shown = automationStudioRecoveryPermissionGate({ granted: [], storedInstructed: undefined, instructions: [], failureEvidence: { schemaVersion: "test.page.v1", controls: ["Pick and pack"] } });
    await shown.gate.checkFor({ kind: "exploration_step", id: "web.press", ref: "call.1" })({ ...PRESS, consequences: ["modify_existing"] });
    expect(shown.gate.request?.control.name).toBe("Pick and pack");

    const unseen = automationStudioRecoveryPermissionGate({ granted: [], storedInstructed: undefined, instructions: [] });
    await unseen.gate.checkFor({ kind: "exploration_step", id: "web.press", ref: "call.1" })({ ...PRESS, consequences: ["modify_existing"] });
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
    body: "Pick and pack the dispatch batch.",
    scope: { kind: "flow", projectId: "project.recovery", flowId: "flow.recovery" },
    priority: 1,
    status: "active",
    requirement: "required",
    createdAt: 1,
    updatedAt: 1
  };
}

function stored(source: AutomationStudioFlowInstruction) {
  return { consequence: "modify_existing", instructionId: source.instructionId, instructionDigest: automationStudioInstructionDigest(source), quote: "Pick and pack the dispatch batch" };
}
