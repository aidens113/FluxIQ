// What a model is told about side effects. Where a run's permission gate
// governs its actions, the policy's side-effect flags no longer decide them,
// so telling the model "no external side effects" would steer it away from a
// press the person allowed. It is told what the gate permits instead.

import { describe, expect, it } from "vitest";
import type { AutomationStudioAdaptationPolicy } from "../../../../model/index.ts";
import { packAutomationStudioLlmContext, type AutomationStudioLlmHarnessInput } from "../index.ts";

describe("the policy as a request describes it", () => {
  it("describes what the permission gate permits in place of the side-effect flags, and what becomes of anything else", () => {
    const context = packAutomationStudioLlmContext({ ...diagnosis(), actionPermissions: { granted: ["modify_existing", "send_or_publish"], instructed: ["create_new", "modify_existing"] } });

    expect(context.policyGates).not.toHaveProperty("allowExternalSideEffects");
    expect(context.policyGates).not.toHaveProperty("requireApprovalForExternalSideEffects");
    expect(context.policyGates).toMatchObject({
      allowRuntimeRecovery: true,
      allowModifyActionTargets: true,
      requireApprovalForDestructiveChanges: true,
      actionPermissions: {
        permitted: ["send_or_publish", "modify_existing", "create_new"],
        granted: ["send_or_publish", "modify_existing"],
        instructed: ["modify_existing", "create_new"],
        otherwise: "An action with any other lasting consequence is still within reach: when the recovery needs one, the run asks the person for permission at that step instead of taking it. Needing permission never makes a step's result unachievable."
      }
    });
  });

  it("says a run with no grant and no instructed set is permitted nothing lasting, and still asks rather than refuses", () => {
    const context = packAutomationStudioLlmContext({ ...diagnosis(), actionPermissions: { granted: [], instructed: [] } });

    expect(context.policyGates).toMatchObject({ actionPermissions: { permitted: [], granted: [], instructed: [] } });
    expect(context.policyGates).not.toHaveProperty("allowExternalSideEffects");
  });

  it("keeps the policy's own flags on a call no gate governs", () => {
    const context = packAutomationStudioLlmContext(diagnosis());

    expect(context.policyGates).toMatchObject({ allowExternalSideEffects: false, requireApprovalForExternalSideEffects: true });
    expect(context.policyGates).not.toHaveProperty("actionPermissions");
  });
});

function diagnosis(): AutomationStudioLlmHarnessInput {
  return { taskKind: "runtime_diagnosis", projectId: "project.llm", flowId: "flow.dispatch", runId: "run.failed", instructions: [], policy: policy() };
}

function policy(): AutomationStudioAdaptationPolicy {
  return {
    schemaVersion: "0.1",
    policyId: "policy.dispatch",
    scope: { kind: "flow", flowId: "flow.dispatch" },
    preset: "repair",
    proposalMode: "manual",
    allowRuntimeRecovery: true,
    allowCreateRecoveryPaths: true,
    allowModifySubflows: false,
    allowCreateSubflows: false,
    allowModifyRouter: false,
    allowModifyExpectations: true,
    allowModifyActionTargets: true,
    allowDeleteOrDisableBehavior: false,
    allowExternalSideEffects: false,
    requireApprovalForDestructiveChanges: true,
    requireApprovalForExternalSideEffects: true,
    createdAt: 1,
    updatedAt: 1
  };
}
