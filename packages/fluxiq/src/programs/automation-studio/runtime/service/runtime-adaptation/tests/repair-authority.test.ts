// The model a standing authorization actually buys an unattended repair, and
// the two things it deliberately does not buy: permission to act, and any task
// kind outside the repair.
import { describe, expect, it } from "vitest";
import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import { AUTOMATION_STUDIO_RESULT_CHECK_TASK_KIND, AUTOMATION_STUDIO_UNATTENDED_REPAIR_CODES } from "../../../result-check-authorization/index.ts";
import type { AutomationStudioRuntimeAdaptationContext } from "../contracts.ts";
import { resolveAutomationStudioUnattendedRepairAuthority } from "../repair-authority.ts";

const NOW = 1_800_000_000_000;

function provider(calls: string[]): AutomationStudioLlmProvider {
  return {
    metadata: { provider: "mock", model: "standing" },
    runTask: async (request) => {
      calls.push(request.taskKind);
      return { response: { kind: "diagnosis", summary: "ran" } };
    }
  };
}

function request(taskKind: string): AutomationStudioLlmTaskRequest {
  return { taskKind } as unknown as AutomationStudioLlmTaskRequest;
}

/** Only the fields this path reads. The rest of a context is irrelevant to it. */
function context(options: { authorization?: unknown; spentUsd?: number } = {}): AutomationStudioRuntimeAdaptationContext {
  return {
    projectId: "project.1",
    flowId: "flow.1",
    settings: {
      resultCheck: {
        schedule: {},
        ...("authorization" in options ? { authorization: options.authorization } : {
          authorization: {
            taskKind: AUTOMATION_STUDIO_RESULT_CHECK_TASK_KIND,
            authorizedByUserId: "user.aiden",
            unlockSessionId: "session.unlock.1",
            keyId: "key.deepseek",
            maxTotalCostUsd: 1,
            maxCostUsdPerCall: 0.05,
            grantedAtMs: NOW - 1000,
            expiresAtMs: NOW + 1000,
            repair: { enabled: true, maxCostUsdPerRun: 0.25 }
          }
        })
      }
    },
    budgetState: { costUsdThisTrainingWindow: options.spentUsd ?? 0 }
  } as unknown as AutomationStudioRuntimeAdaptationContext;
}

describe("resolving an unattended repair's model", () => {
  it("hands the host the key and the ceiling, and nothing that could name a purpose", async () => {
    const seen: Array<Record<string, unknown>> = [];
    const authority = await resolveAutomationStudioUnattendedRepairAuthority({
      context: context(),
      nowMs: NOW,
      resolveStandingProvider: (scope) => {
        seen.push({ ...scope });
        return { provider: provider([]), maxEstimatedCostUsd: scope.maxEstimatedCostUsd };
      }
    });

    expect(seen).toEqual([{ projectId: "project.1", flowId: "flow.1", keyId: "key.deepseek", unlockSessionId: "session.unlock.1", authorizedByUserId: "user.aiden", maxEstimatedCostUsd: 0.25 }]);
    expect(authority.redemption).toMatchObject({ redeemed: true });
    expect(authority.resolution?.maxTotalEstimatedCostUsd).toBe(0.25);
  });

  it("grants no permission to act, because paying for a model is not permission", async () => {
    const authority = await resolveAutomationStudioUnattendedRepairAuthority({
      context: context(),
      nowMs: NOW,
      resolveStandingProvider: () => ({ provider: provider([]), maxEstimatedCostUsd: 0.25 })
    });

    // Absent permits nothing (`resolver-contract.ts`), which is what makes the
    // recovery gate raise a request for a lasting consequence instead of acting.
    expect(authority.resolution && "permittedConsequences" in authority.resolution).toBe(false);
    expect(authority.resolution?.permittedConsequences).toBeUndefined();
  });

  it("refuses the model any task kind the redemption did not cover", async () => {
    const calls: string[] = [];
    const authority = await resolveAutomationStudioUnattendedRepairAuthority({
      context: context(),
      nowMs: NOW,
      resolveStandingProvider: () => ({ provider: provider(calls), maxEstimatedCostUsd: 0.25 })
    });
    const resolved = authority.resolution!.provider;

    await expect(resolved.runTask(request("runtime_patch"))).resolves.toBeTruthy();
    await expect(resolved.runTask(request("loop_verification"))).rejects.toThrow("A standing repair authorization does not pay for loop_verification.");
    await expect(resolved.runTask(request("flow_bootstrap"))).rejects.toThrow("does not pay for flow_bootstrap");
    // The refused ones never reached the host's model at all.
    expect(calls).toEqual(["runtime_patch"]);
  });

  it("never lets a host that answered with a wider ceiling spend more than was redeemed", async () => {
    const authority = await resolveAutomationStudioUnattendedRepairAuthority({
      context: context(),
      nowMs: NOW,
      resolveStandingProvider: () => ({ provider: provider([]), maxEstimatedCostUsd: 99 })
    });

    expect(authority.resolution?.maxTotalEstimatedCostUsd).toBe(0.25);
  });

  it("asks the host for nothing when the redemption refused, and says which refusal it was", async () => {
    let asked = 0;
    const authority = await resolveAutomationStudioUnattendedRepairAuthority({
      context: context({ spentUsd: 0.9 }),
      nowMs: NOW,
      resolveStandingProvider: () => { asked += 1; return { provider: provider([]), maxEstimatedCostUsd: 0.25 }; }
    });

    expect(asked).toBe(0);
    expect(authority.resolution).toBeUndefined();
    expect(authority.redemption).toMatchObject({ redeemed: false, code: AUTOMATION_STUDIO_UNATTENDED_REPAIR_CODES.exhausted });
  });

  it("answers with a refusal rather than throwing when a host resolves nothing", async () => {
    const authority = await resolveAutomationStudioUnattendedRepairAuthority({ context: context(), nowMs: NOW, resolveStandingProvider: () => undefined });

    // A host that could not open the key -- a lapsed unlock, a disabled key --
    // leaves the redemption standing and the run unrepaired, rather than failing.
    expect(authority.redemption).toMatchObject({ redeemed: true });
    expect(authority.resolution).toBeUndefined();
  });

  it("refuses a run with no adaptation context as though nothing were authorized", async () => {
    const authority = await resolveAutomationStudioUnattendedRepairAuthority({ context: null, nowMs: NOW, resolveStandingProvider: () => ({ provider: provider([]), maxEstimatedCostUsd: 0.25 }) });

    expect(authority.redemption).toMatchObject({ redeemed: false, code: AUTOMATION_STUDIO_UNATTENDED_REPAIR_CODES.absent });
    expect(authority.resolution).toBeUndefined();
  });

  it("refuses when the deployment resolves no standing models at all", async () => {
    const authority = await resolveAutomationStudioUnattendedRepairAuthority({ context: context(), nowMs: NOW });

    expect(authority.redemption).toMatchObject({ redeemed: true });
    expect(authority.resolution).toBeUndefined();
  });
});
