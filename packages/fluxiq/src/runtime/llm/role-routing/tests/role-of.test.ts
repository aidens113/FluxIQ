// Which role's model serves a request: its kind's, the judge's always, an in-run repair's slot, and the frame an
// attempt sets around a round that repairs with the calls it explores with.
import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_LLM_PROMPT_VERSIONS, type AutomationStudioLlmTaskKind, type AutomationStudioLlmTaskRequest } from "../../harness/index.ts";
import { AUTOMATION_STUDIO_LLM_TASK_KIND_ROLES, automationStudioLlmModelRoleFrame, automationStudioLlmModelRoleOf, runWithAutomationStudioLlmModelRole } from "../index.ts";

const asked = (taskKind: AutomationStudioLlmTaskKind, context: object = {}) => ({ taskKind, context }) as unknown as Pick<AutomationStudioLlmTaskRequest, "taskKind" | "context">;

describe("the role of a request", () => {
  it("gives every task kind a role", () => {
    expect(Object.keys(AUTOMATION_STUDIO_LLM_TASK_KIND_ROLES).sort()).toEqual(Object.keys(AUTOMATION_STUDIO_LLM_PROMPT_VERSIONS).sort());
    expect(AUTOMATION_STUDIO_LLM_TASK_KIND_ROLES).toEqual({
      flow_bootstrap: "explore", evidence_tool_decision: "explore", instruction_suggestion: "explore", change_proposal_generation: "explore", loop_plan: "explore",
      loop_verification: "judge",
      runtime_diagnosis: "repair", runtime_patch: "repair", router_patch: "repair", subflow_patch: "repair", expectation_action_target_patch: "repair", diagnosis_only_report: "repair"
    });
  });

  it("is its kind's outside every frame", () => {
    expect(automationStudioLlmModelRoleOf(asked("evidence_tool_decision"))).toBe("explore");
    expect(automationStudioLlmModelRoleOf(asked("loop_verification"))).toBe("judge");
    expect(automationStudioLlmModelRoleOf(asked("runtime_patch"))).toBe("repair");
    expect(automationStudioLlmModelRoleFrame()).toBeUndefined();
  });

  it("is a repair for any call carrying an in-run repair's slot, but a judge's call stays the judge's", () => {
    const slot = { inRunRepair: { unit: { kind: "node", id: "n1" } } };
    expect(automationStudioLlmModelRoleOf(asked("evidence_tool_decision", slot))).toBe("repair");
    expect(automationStudioLlmModelRoleOf(asked("loop_verification", slot))).toBe("judge");
  });

  it("is the frame's for a call that explores, and nowhere else", async () => {
    await runWithAutomationStudioLlmModelRole("repair", async () => {
      await Promise.resolve();
      expect(automationStudioLlmModelRoleOf(asked("evidence_tool_decision"))).toBe("repair");
      expect(automationStudioLlmModelRoleOf(asked("loop_verification"))).toBe("judge");
    });
    expect(automationStudioLlmModelRoleOf(asked("evidence_tool_decision"))).toBe("explore");
  });

  it("keeps two frames at once apart", async () => {
    const seen: string[] = [];
    const pause = () => new Promise((resolve) => setTimeout(resolve, 5));
    await Promise.all([
      runWithAutomationStudioLlmModelRole("repair", async () => {
        await pause();
        seen.push(`a:${automationStudioLlmModelRoleOf(asked("flow_bootstrap"))}`);
      }),
      (async () => {
        await pause();
        seen.push(`b:${automationStudioLlmModelRoleOf(asked("flow_bootstrap"))}`);
      })()
    ]);
    expect(seen.sort()).toEqual(["a:repair", "b:explore"]);
  });
});
