import { describe, expect, it } from "vitest";
import type { AutomationStudioLlmProvider } from "../../../llm/index.ts";
import { AUTOMATION_STUDIO_RESULT_CHECK_AUTHORIZATION_CODES, type AutomationStudioResultCheckAuthorization } from "../../../result-check-authorization/index.ts";
import { AUTOMATION_STUDIO_RESULT_CHECK_CODES, AUTOMATION_STUDIO_RESULT_CHECK_DEFAULTS, resolveAutomationStudioResultCheckSchedule, type AutomationStudioResultCheckSettings } from "../../../result-check-schedule/index.ts";
import type { AutomationStudioRuntimeAdaptationContext } from "../contracts.ts";
import { automationStudioRepairedRunResultCheck, automationStudioResultCheckEpoch, automationStudioResultCheckStateFromRows, automationStudioRunResultCheck, resolveAutomationStudioResultCheckProvider } from "../result-check.ts";

const NOW = 1_700_000_000_000;

const model: AutomationStudioLlmProvider = { metadata: { provider: "mock", model: "judge" }, runTask: async () => ({ response: { kind: "diagnosis", summary: "Judged." } }) };

const authorization = (overrides: Partial<AutomationStudioResultCheckAuthorization> = {}): AutomationStudioResultCheckAuthorization => ({
  taskKind: "loop_verification",
  authorizedByUserId: "user.aiden",
  unlockSessionId: "session.unlock.1",
  keyId: "key.deepseek",
  maxTotalCostUsd: 1,
  maxCostUsdPerCall: 0.05,
  grantedAtMs: NOW - 1000,
  expiresAtMs: NOW + 90 * 24 * 60 * 60 * 1000,
  ...overrides
});

function context(options: {
  ordinal: number;
  lastCheckedOrdinal?: number | null;
  lastStatus?: AutomationStudioRuntimeAdaptationContext["resultCheckState"]["lastStatus"];
  schedule?: Partial<AutomationStudioResultCheckSettings>;
  authorization?: AutomationStudioResultCheckAuthorization | undefined;
  spentUsd?: number;
  epoch?: number;
}): AutomationStudioRuntimeAdaptationContext {
  const schedule = { ...AUTOMATION_STUDIO_RESULT_CHECK_DEFAULTS, ...options.schedule };
  return {
    projectId: "project.checks",
    flowId: "flow.catalogue",
    settings: {
      mode: "normal",
      allowLlmIntervention: false,
      allowRuntimeRecovery: true,
      allowAdaptationCreation: false,
      proposalApprovalMode: "manual",
      allowPromotion: false,
      resultCheck: { schedule, ...(options.authorization ? { authorization: options.authorization } : {}) }
    },
    policy: { preset: "adaptive" } as AutomationStudioRuntimeAdaptationContext["policy"],
    behavior: { invokeLlm: false, runRecovery: true, createAdaptations: false, proposalApprovalMode: "manual", promoteAdaptations: false },
    metrics: { deterministicSuccessRuns: 0, llmInterventionsPerRun: 0, unresolvedFailures: 0, repeatedTriggers: [], acceptedAdaptations: 0, rejectedAdaptations: 0, stabilityScore: 1 },
    budgetState: { interventionsThisRun: 0, tokensThisRun: 0, costUsdThisTrainingWindow: options.spentUsd ?? 0 },
    budgetDecision: { ok: true, exhausted: [], behavior: "continue" },
    runsCompleted: options.ordinal - 1,
    recentRunCount: options.ordinal - 1,
    recentAdaptationCount: 0,
    recentAdaptations: [],
    resultCheckSchedule: resolveAutomationStudioResultCheckSchedule(schedule.shape),
    resultCheckState: {
      ordinal: options.ordinal,
      lastCheckedOrdinal: options.lastCheckedOrdinal ?? null,
      checksPassed: 0,
      lastStatus: options.lastStatus ?? null
    },
    resultCheckEpoch: options.epoch ?? 1,
    diagnostics: []
  };
}

/** What `resultPorts.resolveProvider` answers for this run, with no grant anywhere. */
async function unattendedProvider(instance: AutomationStudioRuntimeAdaptationContext, asked: Array<{ keyId: string; maxEstimatedCostUsd: number }>) {
  const check = automationStudioRunResultCheck({ context: instance, nowMs: NOW });
  const resolution = await resolveAutomationStudioResultCheckProvider({
    scope: { projectId: instance.projectId, flowId: instance.flowId },
    check,
    resolveStandingProvider: async (request) => { asked.push({ keyId: request.keyId, maxEstimatedCostUsd: request.maxEstimatedCostUsd }); return { provider: model }; }
  });
  return { check, resolution };
}

describe("an unattended run obtaining a model", () => {
  it("obtains one on the runs the schedule picks, and on no other", async () => {
    const asked: Array<{ keyId: string; maxEstimatedCostUsd: number }> = [];
    const reached: number[] = [];
    let lastCheckedOrdinal: number | null = null;
    for (let ordinal = 1; ordinal <= 12; ordinal += 1) {
      const { check, resolution } = await unattendedProvider(context({ ordinal, lastCheckedOrdinal, lastStatus: lastCheckedOrdinal === null ? null : "confirmed", authorization: authorization() }), asked);
      if (!resolution) continue;
      reached.push(ordinal);
      expect(check.checked).toBe(true);
      lastCheckedOrdinal = ordinal;
    }
    expect(reached).toEqual([1, 2, 3, 8]);
    expect(asked).toHaveLength(4);
    expect(asked[0]).toEqual({ keyId: "key.deepseek", maxEstimatedCostUsd: 0.05 });
  });

  it("records why an unchecked run was not judged, rather than being silent about it", async () => {
    const check = automationStudioRunResultCheck({ context: context({ ordinal: 4, lastCheckedOrdinal: 3, lastStatus: "confirmed", authorization: authorization() }), nowMs: NOW });
    expect(check).toMatchObject({ checked: false, code: AUTOMATION_STUDIO_RESULT_CHECK_CODES.intervalNotReached, epoch: 1 });
    expect(check.reason).toContain("run 8");
  });

  it("obtains no model when the authorization has expired, and says so", async () => {
    const asked: Array<{ keyId: string; maxEstimatedCostUsd: number }> = [];
    const { check, resolution } = await unattendedProvider(context({ ordinal: 1, authorization: authorization({ expiresAtMs: NOW - 1 }) }), asked);
    expect(resolution).toBeUndefined();
    expect(asked).toEqual([]);
    expect(check).toMatchObject({ checked: false, code: AUTOMATION_STUDIO_RESULT_CHECK_AUTHORIZATION_CODES.expired });
  });

  it("obtains no model when the authorization's ceiling has been spent, and says so", async () => {
    const asked: Array<{ keyId: string; maxEstimatedCostUsd: number }> = [];
    const { check, resolution } = await unattendedProvider(context({ ordinal: 1, authorization: authorization(), spentUsd: 0.99 }), asked);
    expect(resolution).toBeUndefined();
    expect(asked).toEqual([]);
    expect(check).toMatchObject({ checked: false, code: AUTOMATION_STUDIO_RESULT_CHECK_AUTHORIZATION_CODES.exhausted });
  });

  it("obtains no model when nobody authorized checking, however willing the schedule is", async () => {
    const asked: Array<{ keyId: string; maxEstimatedCostUsd: number }> = [];
    const { check, resolution } = await unattendedProvider(context({ ordinal: 1, authorization: undefined }), asked);
    expect(resolution).toBeUndefined();
    expect(check).toMatchObject({ checked: false, code: AUTOMATION_STUDIO_RESULT_CHECK_AUTHORIZATION_CODES.absent });
  });

  it("never reaches the authorization at all on a run the schedule passed over", async () => {
    const asked: Array<{ keyId: string; maxEstimatedCostUsd: number }> = [];
    const { check } = await unattendedProvider(context({ ordinal: 5, lastCheckedOrdinal: 3, lastStatus: "confirmed", authorization: authorization() }), asked);
    expect(check.code.startsWith("core.check.authorization")).toBe(false);
    expect(asked).toEqual([]);
  });

  it("holds the host's provider to the authorization's ceiling even when the host names a wider one", async () => {
    const resolution = await resolveAutomationStudioResultCheckProvider({
      scope: { projectId: "project.checks", flowId: "flow.catalogue" },
      check: automationStudioRunResultCheck({ context: context({ ordinal: 1, authorization: authorization() }), nowMs: NOW }),
      resolveStandingProvider: async () => ({ provider: model, maxEstimatedCostUsd: 5 })
    });
    expect(resolution?.maxEstimatedCostUsd).toBe(0.05);
  });

  it("prefers a person's grant, which behaves exactly as it did before any of this existed", async () => {
    const granted = { provider: model, maxEstimatedCostUsd: 0.25 };
    const resolution = await resolveAutomationStudioResultCheckProvider({
      scope: { projectId: "project.checks", flowId: "flow.catalogue" },
      // The schedule says no and there is no authorization, and the grant still wins.
      check: automationStudioRunResultCheck({ context: context({ ordinal: 5, lastCheckedOrdinal: 3, lastStatus: "confirmed" }), nowMs: NOW }),
      resolveGrantedProvider: async () => granted,
      resolveStandingProvider: async () => { throw new Error("the standing path must not be reached when a grant resolved"); }
    });
    expect(resolution).toBe(granted);
  });
});

describe("a run that repaired itself and ran again", () => {
  it("is checked on a run the sequence would have passed over", () => {
    const skipping = { shape: "fixed_interval" as const, initialRunCount: 0, interval: 5 };
    const instance = context({ ordinal: 1, schedule: skipping, authorization: authorization() });
    expect(automationStudioRunResultCheck({ context: instance, nowMs: NOW }))
      .toMatchObject({ checked: false, code: AUTOMATION_STUDIO_RESULT_CHECK_CODES.intervalNotReached });
    expect(automationStudioRepairedRunResultCheck({ context: instance, check: null, nowMs: NOW }))
      .toMatchObject({ checked: true, code: AUTOMATION_STUDIO_RESULT_CHECK_CODES.afterRepair, keyId: "key.deepseek", maxEstimatedCostUsd: 0.05, epoch: 1 });
  });

  it("redeems the same authorization on the same terms: expiry and ceiling still bind", () => {
    const skipping = { shape: "fixed_interval" as const, initialRunCount: 0, interval: 5 };
    expect(automationStudioRepairedRunResultCheck({ context: context({ ordinal: 1, schedule: skipping, authorization: authorization({ expiresAtMs: NOW - 1 }) }), check: null, nowMs: NOW }))
      .toMatchObject({ checked: false, code: AUTOMATION_STUDIO_RESULT_CHECK_AUTHORIZATION_CODES.expired });
    expect(automationStudioRepairedRunResultCheck({ context: context({ ordinal: 1, schedule: skipping, authorization: authorization(), spentUsd: 0.99 }), check: null, nowMs: NOW }))
      .toMatchObject({ checked: false, code: AUTOMATION_STUDIO_RESULT_CHECK_AUTHORIZATION_CODES.exhausted });
    expect(automationStudioRepairedRunResultCheck({ context: context({ ordinal: 1, schedule: skipping, authorization: undefined }), check: null, nowMs: NOW }))
      .toMatchObject({ checked: false, code: AUTOMATION_STUDIO_RESULT_CHECK_AUTHORIZATION_CODES.absent });
  });

  it("leaves a run with no adaptation context exactly as it was, because it cannot have repaired itself", () => {
    expect(automationStudioRepairedRunResultCheck({ context: null, check: null, nowMs: NOW })).toBeNull();
    const already = automationStudioRunResultCheck({ context: context({ ordinal: 1, authorization: authorization() }), nowMs: NOW });
    expect(automationStudioRepairedRunResultCheck({ context: null, check: already, nowMs: NOW })).toBe(already);
  });
});

describe("the epoch and the state a run is counted at", () => {
  it("takes the Flow's own graph revision, and 1 where it has none", () => {
    expect(automationStudioResultCheckEpoch(7)).toBe(7);
    expect(automationStudioResultCheckEpoch(undefined)).toBe(1);
    expect(automationStudioResultCheckEpoch("3")).toBe(3);
    expect(automationStudioResultCheckEpoch(0)).toBe(1);
    expect(automationStudioResultCheckEpoch(-2)).toBe(1);
  });

  it("counts the run that is starting, because the rows hold only finished runs", () => {
    expect(automationStudioResultCheckStateFromRows({ ordinal: 7, lastCheckedOrdinal: 3, checksPassed: 3, lastStatus: "confirmed" }))
      .toEqual({ ordinal: 8, lastCheckedOrdinal: 3, checksPassed: 3, lastStatus: "confirmed" });
  });

  it("reads an unreadable store as a Flow with no history, so its first runs are checked", () => {
    expect(automationStudioResultCheckStateFromRows(null)).toEqual({ ordinal: 1, lastCheckedOrdinal: null, checksPassed: 0, lastStatus: null });
  });

  it("refuses a status word the column could not have held", () => {
    expect(automationStudioResultCheckStateFromRows({ ordinal: 1, lastCheckedOrdinal: 1, checksPassed: 0, lastStatus: "passed" }).lastStatus).toBeNull();
  });
});
