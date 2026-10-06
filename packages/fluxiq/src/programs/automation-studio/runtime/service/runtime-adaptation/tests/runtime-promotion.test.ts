import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowAdaptation } from "../../../../model/index.ts";
import type { AutomationStudioRuntimeAdaptationContext } from "../contracts.ts";
import { promoteAutomationStudioRuntimeAdaptation } from "../runtime-promotion.ts";

// The promotion decision a runtime patch's adaptation gets mid-run. It never
// applies; an allowed adaptation is held for the run's judged end.

const RUN_ID = "run.promotion";

function adaptation(overrides: Partial<AutomationStudioFlowAdaptation> = {}): AutomationStudioFlowAdaptation {
  return {
    schemaVersion: "0.1",
    adaptationId: "adaptation.promotion",
    flowId: "flow.promotion",
    projectId: "project.promotion",
    sourceRunId: RUN_ID,
    trigger: "Runtime patch temporary_target_override ran without evidence that proves or contradicts it.",
    patch: [{ kind: "edit_action_target", targetId: "press", summary: "Use the renamed control.", after: { handles: { control: "replacement" } } }],
    status: "testing",
    author: "runtime",
    riskLevel: "high",
    createdAt: 1,
    updatedAt: 1,
    metadata: { verification: { status: "unverifiable", reason: "no_expectation_declared", awaitsJudgedRun: true } },
    ...overrides
  };
}

function context(proposalMode: "auto" | "manual" | "mixed" = "auto"): AutomationStudioRuntimeAdaptationContext {
  return {
    settings: {},
    policy: { preset: "adaptive", proposalMode },
    behavior: { promoteAdaptations: true }
  } as unknown as AutomationStudioRuntimeAdaptationContext;
}

async function promote(candidate: AutomationStudioFlowAdaptation, proposalMode: "auto" | "manual" | "mixed" = "auto") {
  const saved: AutomationStudioFlowAdaptation[] = [];
  const promoted = await promoteAutomationStudioRuntimeAdaptation({
    ports: {
      listFlowAdaptationSummaries: async () => ({ adaptations: [], total: 0 }),
      getFlowAdaptation: async () => null,
      saveFlowAdaptation: async (adaptationSaved: AutomationStudioFlowAdaptation) => { saved.push(adaptationSaved); return adaptationSaved; }
    } as unknown as Parameters<typeof promoteAutomationStudioRuntimeAdaptation>[0]["ports"],
    adaptation: candidate,
    context: context(proposalMode)
  });
  return { promoted, saved, decision: promoted.metadata?.approvalDecision as Record<string, unknown> };
}

describe("the promotion decision for a runtime adaptation", () => {
  // t267: a target override on a Flow that declares no evidence proved nothing
  // in its trial. The judged whole run is its evidence, and the decision says so.
  it("holds a change that awaits its judged whole run for that run, and names the run as its evidence", async () => {
    const { decision, saved } = await promote(adaptation());

    expect(saved).toHaveLength(1);
    expect(decision).toMatchObject({
      autoApply: true,
      requiresManualApproval: false,
      applyAt: "judged_whole_run",
      applied: false,
      runId: RUN_ID,
      evidence: "judged_whole_run",
      confidence: "unverified",
      validationStatus: "unvalidated"
    });
  });

  it("refuses the same change without the marker, and records no judged-run evidence", async () => {
    const { decision } = await promote(adaptation({ metadata: { verification: { status: "unverifiable", reason: "no_expectation_declared" } } }));

    expect(decision).toMatchObject({ autoApply: false, requiresManualApproval: true, reason: "Adaptation must pass validation before promotion." });
    expect(decision).not.toHaveProperty("evidence");
    expect(decision).not.toHaveProperty("applyAt");
  });

  it("refuses a change that awaits its judged run once a failure is on record", async () => {
    const { decision } = await promote(adaptation({ validationResults: [{ runId: "run.earlier", status: "failed", checkedAt: 5, kind: "trial" }] }));

    expect(decision).toMatchObject({ autoApply: false, requiresManualApproval: true, reason: "Its latest trial failed, so the change is not promoted until a new trial succeeds." });
    expect(decision).not.toHaveProperty("evidence");
  });

  it("leaves a person's manual approval mode in charge", async () => {
    const { decision } = await promote(adaptation(), "manual");

    expect(decision).toMatchObject({ autoApply: false, requiresManualApproval: true, reason: "Manual adaptation approval mode requires explicit review." });
    expect(decision).not.toHaveProperty("evidence");
  });
});
