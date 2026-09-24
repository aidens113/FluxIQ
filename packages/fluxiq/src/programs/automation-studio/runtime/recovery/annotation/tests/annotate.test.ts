import type { AutomationStudioAdaptiveFailureClass } from "@fluxiq/contracts/automation-studio";
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type {
  AutomationStudioAdaptationPolicy,
  AutomationStudioFlowRunDetail,
  AutomationStudioFlowScope
} from "../../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../../executor.ts";
import type {
  AutomationStudioHarnessOptionBundle,
  AutomationStudioLlmEvidenceRuntimeBinding,
  AutomationStudioLlmProvider,
  AutomationStudioLlmTaskRequest
} from "../../../llm/index.ts";
import type {
  AutomationStudioTrainingModeBehavior,
  AutomationStudioTrainingModeSettings
} from "../../../training-modes.ts";
import { resolveAutomationStudioResultCheckSchedule } from "../../../result-check-schedule/index.ts";
import type { AutomationStudioRuntimeAdaptationContext } from "../../../service.ts";
import {
  AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_REFUSAL_CODES,
  AutomationStudioLlmExecutionGrantRefusal
} from "../../../llm/index.ts";
import { annotateAutomationStudioRunDetailWithRuntimeLlm } from "../annotate.ts";
import type { AutomationStudioRuntimeRecoveryPorts } from "../ports.ts";

// The wiring Phase 2.3 left undone. The runner, the budget, the outcomes and the
// recovery clock all existed and passed their own tests; nothing called any of
// it, so a plan could say `explorationRequested` and the run went straight from
// the diagnosis to the patch with the `exploration` stage permanently `skipped`.
//
// These drive the whole recovery path with eight stub ports. The first one fails
// if the call into `runAutomationStudioRecoveryExploration` is removed, and the
// second fails if the result is not passed into the trace.
describe("annotateAutomationStudioRunDetailWithRuntimeLlm", () => {
  // The silence of live run `run-muesyox4-930bef98` (2026-09-23), one layer
  // deeper than the test below it. The model was shown an 819-byte failure
  // packet with no same-family control on it, said the step could no longer
  // reach its result, and the gate here read that "no patch" and cancelled the
  // exploration too -- so the single claim a page could have settled was the
  // single claim nothing checked. The loop now looks anyway and asks again with
  // what it found. The refusal may still stand; what may not is that it stands
  // unexamined. The mutation this is written against: restoring
  // `plan.patchRequest.request` to the exploration gate, which makes the look
  // and the re-plan disappear together.
  it("explores and re-plans when the model says the goal is gone, so the refusal is checked against the page", async () => {
    const executed: string[] = [];
    const taskKinds: string[] = [];
    const detail = await annotate({ executed, taskKinds, maxCallsPerRun: 6, patchNeeded: false, stillAchievable: "no" });

    expect(taskKinds.at(0)).toBe("runtime_diagnosis");
    expect(taskKinds.at(-1)).toBe("runtime_diagnosis");
    expect(taskKinds).toContain("evidence_tool_decision");
    expect(executed).toEqual(["test.inspect"]);
    // The code is the same code -- the goal is still gone -- and the rung is
    // what changed: `exploration` is the loop saying it looked first.
    expect((detail.metadata?.llmGate as JsonObject | undefined)).toMatchObject({
      patchSkippedCode: "llm.runtime_patch_goal_unachievable",
      patchSkippedRung: "exploration",
      replan: { checked: true, changedDecision: false, before: "llm.runtime_patch_goal_unachievable" }
    });
    expect(explorationStage(detail)).toMatchObject({ status: "completed", detail: { requested: true } });
    expect(planStage(detail)).toMatchObject({ providerCalled: true, detail: { replanned: true, replanChecked: true, replanChangedDecision: false } });
  });

  // The other half of the same rule. A policy that permits no patch kind is a
  // person's setting, and no page can speak to it, so looking would spend a
  // run's calls on an answer that could not change. The mutation: widening the
  // checkable set in `diagnosis-chain.ts` to every refusal, which turns every
  // dead end into a paid exploration and a paid second diagnosis.
  it("leaves a refusal the page cannot overturn unchecked, and spends nothing looking at it", async () => {
    const executed: string[] = [];
    const taskKinds: string[] = [];
    const detail = await annotate({ executed, taskKinds, patchNeeded: false, allowRuntimeRecovery: false });

    expect(taskKinds).toEqual(["runtime_diagnosis"]);
    expect(executed).toEqual([]);
    expect((detail.metadata?.llmGate as JsonObject | undefined)).toMatchObject({
      patchSkippedCode: "llm.runtime_patch_policy_allows_no_kind",
      patchSkippedRung: "plan",
      costAccounting: { calls: 1, explorationCalls: 0 }
    });
    expect(detail.metadata?.llmGate).not.toHaveProperty("replan");
    expect(explorationStage(detail)).toMatchObject({ status: "skipped", detail: { requested: true } });
    expect(planStage(detail)).toMatchObject({ providerCalled: false });
  });

  // What the re-plan is for. The first answer refused; the page said otherwise;
  // the plan is rebuilt and now asks for a patch. Without this the exploration
  // would be a look nothing re-plans from, which is why removing the gate alone
  // was not the fix.
  it("turns the refusal into a patch request when looking changes the model's mind", async () => {
    const taskKinds: string[] = [];
    const detail = await annotate({ executed: [], taskKinds, maxCallsPerRun: 6, patchNeeded: false, stillAchievable: "no", replan: { patchNeeded: true } });

    expect(taskKinds.filter((kind) => kind === "runtime_diagnosis")).toHaveLength(2);
    expect(planStage(detail)).toMatchObject({ detail: { patchRequested: true, replanned: true, replanChangedDecision: true } });
    expect((detail.metadata?.llmGate as JsonObject | undefined)).toMatchObject({ replan: { checked: true, changedDecision: true } });
    // `createAdaptations` is off in this harness, so the patch call cannot
    // follow. The rung says so, and it is no longer `plan`: the plan asked.
    expect((detail.metadata?.llmGate as JsonObject | undefined)?.patchSkippedRung).toBe("resolution");
  });

  // A re-plan shown none of the explored packets is the first diagnosis asked
  // again, at the same price, for the same answer. It is also shown its own
  // earlier answer, because that answer is the subject of the call. The
  // mutation: dropping either slot from `replan.ts`, which leaves a second call
  // that cannot disagree with the first.
  it("makes the re-plan at the plan stage, carrying the explored packets and its own earlier answer", async () => {
    const requests: AutomationStudioLlmTaskRequest[] = [];
    await annotate({ executed: [], requests, maxCallsPerRun: 6, captureFailureEvidence: true, patchNeeded: false, stillAchievable: "no" });
    const replanRequest = requests.find((request) => request.taskKind === "runtime_diagnosis" && request.context.stage === "plan");

    expect(replanRequest).toBeDefined();
    expect(requests.at(0)?.context.stage).toBe("gather");
    expect(replanRequest?.context.explorationEvidence?.packets.length).toBeGreaterThan(0);
    expect(replanRequest?.context.diagnosis).toMatchObject({ stillAchievable: "no" });
  });

  // A second call that comes back with nothing leaves the first plan standing,
  // and says so. Inventing a patch request out of a failed call would be worse
  // than the refusal it replaced; recording it as a checked refusal would be a
  // claim no call backs up.
  it("leaves the original refusal standing, marked unchecked, when the re-plan returns no diagnosis", async () => {
    const detail = await annotate({ executed: [], maxCallsPerRun: 6, patchNeeded: false, stillAchievable: "no", replanFails: true });

    expect((detail.metadata?.llmGate as JsonObject | undefined)).toMatchObject({
      patchSkippedCode: "llm.runtime_patch_goal_unachievable",
      patchSkippedRung: "plan",
      replan: { checked: false, changedDecision: false }
    });
    expect(planStage(detail)).toMatchObject({ status: "failed", providerCalled: true, detail: { replanned: true, replanChecked: false } });
  });

  // The silence of live run `run-muesyox4-930bef98` (2026-09-23), as a run
  // record. Its recovery engaged, its diagnosis of a `target_not_found`
  // validated, and it then produced no patch attempt, no adaptation, no change
  // proposal and no stated reason a reader could act on. A recovery that
  // repairs nothing has to name the rung that declined and the code for why,
  // and those two fields are what tell it apart from a loop that is switched
  // off. The mutation this is written against: dropping either field from the
  // gate record, which restores the silence exactly.
  it("names the rung and the code when a validated diagnosis leads to no patch attempt", async () => {
    const detail = await annotate({ executed: [], patchNeeded: false, explorationNeeded: false });
    const gate = detail.metadata?.llmGate as JsonObject | undefined;

    expect(detail.metadata).not.toHaveProperty("runtimePatchAttempts");
    expect(detail.adaptationIds).toEqual([]);
    expect(detail.changeProposalIds).toEqual([]);
    expect(detail.interventions.at(-1)?.validation?.ok).toBe(true);
    expect(gate?.patchSkippedCode).toBe("llm.runtime_patch_diagnosis_asked_for_none");
    expect(gate?.patchSkippedRung).toBe("plan");
  });

  it("runs a bounded exploration when the plan asks for one, and takes an action to do it", async () => {
    const executed: string[] = [];
    const detail = await annotate({ executed });

    expect(executed).toEqual(["test.inspect"]);
    expect(explorationStage(detail)).toMatchObject({
      stage: "exploration",
      status: "completed",
      providerCalled: true,
      loopStage: "gather",
      detail: { requested: true, outcome: "evidence_gathered", observedActions: 1, providerCalls: 2 }
    });
  });

  // A domain that captures a failure snapshot -- the web domain always does --
  // hands it to the diagnosis and the patch. The exploration's own requests
  // must not carry it: Core refuses failure evidence on any task but those two,
  // and when the gather request carried it, every exploration decision was
  // refused before the provider was ever asked.
  it("still explores when the domain captured failure evidence for the diagnosis", async () => {
    const executed: string[] = [];
    const taskKinds: string[] = [];
    const detail = await annotate({ executed, taskKinds, captureFailureEvidence: true });

    expect(taskKinds).toEqual(["runtime_diagnosis", "evidence_tool_decision", "evidence_tool_decision"]);
    expect(executed).toEqual(["test.inspect"]);
    expect(explorationStage(detail)).toMatchObject({
      status: "completed",
      detail: { requested: true, outcome: "evidence_gathered", observedActions: 1, providerCalls: 2 }
    });
    expect((detail.metadata?.llmGate as JsonObject | undefined)?.failureEvidence).toBeDefined();
  });

  it("says the plan asked for an exploration and none ran when the Flow has no scope", async () => {
    const executed: string[] = [];
    const detail = await annotate({ executed, scope: undefined });

    expect(executed).toEqual([]);
    expect(explorationStage(detail)).toMatchObject({
      stage: "exploration",
      status: "skipped",
      providerCalled: false,
      reason: "The plan asked for exploration and none was run.",
      detail: { requested: true }
    });
  });

  // The recovery's permission gate governs every action, so the policy's
  // side-effect flag no longer withholds the option: the model is offered it
  // either way, and an action with a lasting consequence is permitted or asked
  // about (`recovery-permissions.test.ts`). Offering is not taking: here the
  // model only looks.
  it("offers a mutating option to the exploration whatever the policy's side-effect flag says", async () => {
    for (const allowExternalSideEffects of [false, true]) {
      const executed: string[] = [];
      const offered: string[][] = [];
      await annotate({ executed, offered, allowExternalSideEffects });

      expect(offered[0], String(allowExternalSideEffects)).toEqual(["test.inspect", "test.reveal"]);
      expect(executed, String(allowExternalSideEffects)).toEqual(["test.inspect"]);
    }
  });

  // A resolver that says how many calls it will authorise is taken at its word
  // -- a grant mints exactly that many, so a call past it would fail anyway --
  // and reaching it is a limit being reached, not the loop breaking. Two calls
  // buy the diagnosis and one look, and the exploration then stops on the
  // run's call count, named as such.
  it("ends the exploration in budget exhaustion when the resolver's own call count runs out", async () => {
    const executed: string[] = [];
    const detail = await annotate({ executed, maxCallsPerRun: 2 });

    expect(executed).toEqual(["test.inspect"]);
    expect(explorationStage(detail)).toMatchObject({
      status: "failed",
      detail: { requested: true, outcome: "budget_exhausted", endedBy: "llm_budget.run_call_limit" }
    });
    expect((detail.metadata?.llmGate as JsonObject | undefined)?.costAccounting).toMatchObject({ calls: 2, explorationCalls: 1 });
  });

  // The conflation this removed: an intervention limit counts interventions,
  // and it used to be read as a cap on provider calls, so a policy allowing one
  // intervention allowed one call and the exploration never began. With no
  // count declared anywhere, the run is bounded by money, tokens, the clock and
  // progress, and the exploration runs.
  it("does not read the intervention limit as a provider-call limit", async () => {
    const executed: string[] = [];
    const detail = await annotate({ executed, maxCallsPerRun: "undeclared", maxInterventionsPerRun: 1 });

    expect(executed).toEqual(["test.inspect"]);
    expect(explorationStage(detail)).toMatchObject({
      status: "completed",
      detail: { requested: true, outcome: "evidence_gathered", observedActions: 1, providerCalls: 2 }
    });
    expect((detail.metadata?.llmGate as JsonObject | undefined)?.costAccounting).toMatchObject({ calls: 3, explorationCalls: 2 });
  });

  it("does not explore when the plan did not ask for one", async () => {
    const executed: string[] = [];
    const detail = await annotate({ executed, explorationNeeded: false });

    expect(executed).toEqual([]);
    expect(explorationStage(detail)).toMatchObject({
      status: "skipped",
      reason: "The plan did not call for exploration.",
      detail: { requested: false }
    });
  });
});

// D-3, through the whole recovery path: the exploration looks, finds a control
// the failure packet did not show, and the patch that follows can name it.
// The domain stub numbers handles per packet, as the web domain does, so the
// handle has to say which packet it came from.
describe("annotateAutomationStudioRunDetailWithRuntimeLlm, from exploration to repair", () => {
  it("shows the patch the pages the exploration returned, and accepts a repair naming a control only they show", async () => {
    const run = await annotateRepair({ handles: { control: "explored.1:candidate.7" } });

    expect(run.patchRequest?.context.explorationEvidence).toEqual({
      schemaVersion: "automation-studio.exploration-evidence.v1",
      packets: [{ evidenceId: "explored.1", toolId: "test.inspect", packet: REVEALED_PAGE }],
      withheldPackets: 0
    });
    expect(run.patchRequest?.context.failureEvidence).toEqual(FAILURE_PAGE);
    expect(run.asked).toEqual([{ page: "page.revealed", handles: { control: "candidate.7" } }]);
    expect(run.detail.metadata?.runtimePatchAttempts).toEqual([expect.objectContaining({
      kind: "temporary_target_override",
      proposalOnly: true,
      preflightOk: true,
      targetResolution: "resolved",
      targetEvidence: "exploration_evidence"
    })]);
    expect(run.detail.changeProposalIds).toHaveLength(1);
    expect((run.detail.metadata?.llmGate as JsonObject | undefined)?.explorationEvidence).toEqual({ carriedPackets: 1, withheldPackets: 0 });
  });

  it("still refuses a handle no packet issued, with the refusal it always had", async () => {
    for (const control of ["candidate.9", "explored.1:candidate.9", "explored.2:candidate.7"]) {
      const run = await annotateRepair({ handles: { control } });

      expect(run.detail.metadata?.runtimePatchAttempts, control).toEqual([expect.objectContaining({
        preflightOk: false,
        targetOverrideRefusal: { status: "absent", reason: "handle_not_issued" }
      })]);
      expect(run.detail.changeProposalIds, control).toEqual([]);
    }
  });

  it("sends the patch request it always did when there was no exploration", async () => {
    const run = await annotateRepair({ handles: { control: "candidate.2" }, explorationNeeded: false });

    expect(run.executed).toEqual([]);
    expect(run.patchRequest?.context).not.toHaveProperty("explorationEvidence");
    expect(run.asked).toEqual([{ page: "page.failed", handles: { control: "candidate.2" } }]);
    expect(run.detail.metadata?.runtimePatchAttempts).toEqual([expect.objectContaining({ preflightOk: true, targetEvidence: "failure_evidence" })]);
    expect(run.detail.metadata?.llmGate).not.toHaveProperty("explorationEvidence");
  });

  // A `diagnose_and_adapt` grant buys one target override and nothing else, so
  // for a failure whose plan allows no target override the patch call can only
  // produce a substitute: the live repair campaign's guarded link and retired
  // page (2026-09-17) each proposed one against the page the run landed on.
  it.each([
    ["navigation_unexpected", "The diagnose_and_adapt grant buys only a target override, and the recovery plan allows none for a navigation unexpected failure, so no patch was requested."],
    ["page_changed", "The diagnose_and_adapt grant buys only a target override, and the recovery plan allows none for a page changed failure, so no patch was requested."],
    // Refused before the plan: Core's own diagnosis already says a person must act.
    ["blocked_by_capability_or_policy", undefined]
  ] as const)("under a proposal grant, makes no patch call for a %s failure, and says why", async (category, reason) => {
    const run = await annotateRepair({ handles: { control: "candidate.2" }, explorationNeeded: false, failure: category });

    expect(run.patchRequest).toBeUndefined();
    expect(run.asked).toEqual([]);
    expect(run.detail.metadata).not.toHaveProperty("runtimePatchAttempts");
    expect(run.detail.changeProposalIds).toEqual([]);
    expect(run.detail.adaptationIds).toEqual([]);
    expect((run.detail.metadata?.llmGate as JsonObject | undefined)?.patchSkipped).toBe(reason);
  });

  // The answer the patch call had no way to give. A decline proposes nothing,
  // changes nothing, and is recorded where a reader looking for what the
  // recovery did will find it.
  it("records a model's decline as a refusal that proposes nothing", async () => {
    const run = await annotateRepair({ handles: { control: "candidate.2" }, explorationNeeded: false, decline: "control_gone" });

    expect(run.asked).toEqual([]);
    expect(run.detail.metadata?.runtimePatchAttempts).toEqual([expect.objectContaining({
      kind: "no_repair",
      executed: false,
      preflightOk: false,
      declinedReason: "control_gone",
      issues: ["The model was asked for a repair and declined: what the step acted on is gone, and nothing takes its place (control_gone)."],
      traceStatus: "not-run"
    })]);
    expect(run.detail.changeProposalIds).toEqual([]);
    expect(run.detail.adaptationIds).toEqual([]);
    expect((run.detail.metadata?.llmGate as JsonObject | undefined)?.patchDeclined).toBe("control_gone");
  });

  // A tie between equal candidates is the one target failure a model cannot
  // resolve from the page the matcher already read, and under this grant the
  // only answer it could give is one of the two (`ambiguous-targets-refuse-unnamed-continue`).
  it("under a proposal grant, makes no patch call for a tie between equal candidates", async () => {
    const run = await annotateRepair({ handles: { control: "candidate.2" }, explorationNeeded: false, failure: "target_ambiguous" });

    expect(run.patchRequest).toBeUndefined();
    expect(run.detail.metadata).not.toHaveProperty("runtimePatchAttempts");
    expect(run.detail.changeProposalIds).toEqual([]);
    expect((run.detail.metadata?.llmGate as JsonObject | undefined)?.patchSkipped).toBe("The diagnose_and_adapt grant buys only a target override, and several things answer to the step's own description and nothing tells them apart, so no patch was requested.");
  });

  it("under a proposal grant, explores nothing for a failure it will make no patch call for", async () => {
    const run = await annotateRepair({ handles: { control: "candidate.2" }, failure: "navigation_unexpected" });

    expect(run.executed).toEqual([]);
    expect(run.patchRequest).toBeUndefined();
  });

  it("under a proposal grant, still makes the patch call for a target that was not found", async () => {
    const run = await annotateRepair({ handles: { control: "candidate.2" }, explorationNeeded: false, failure: "target_not_found" });

    expect(run.patchRequest).toBeDefined();
    expect(run.detail.changeProposalIds).toHaveLength(1);
  });
});

// The early return that used to leave no trace. A Flow built from an instruction
// is created with LLM intervention off and its playback carries no execution
// grant, so its first failure -- in the live corpus, a retryable
// `web.target.not_found` -- stops here. It wrote an `llmGate` and nothing else,
// which read exactly like a recovery that ran and found nothing to change. Each
// test fails if the trace is dropped from this return again.
// A repair that cannot start has to say why it could not, and for most of this
// module's life it could not: the resolution's `catch` took no argument, so the
// reason was discarded at the moment it was needed. Live run
// `run-muexhp0k-73172f73` (2026-09-24) reached the repair with most of its calls
// and nearly all of its purse unspent, and the record said only that provider
// resolution had failed.
describe("a repair whose provider will not resolve", () => {
  it("names Core's own grant refusal as the cause, beside the step that failed", async () => {
    const detail = await annotateUnresolvable(new AutomationStudioLlmExecutionGrantRefusal(
      AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_REFUSAL_CODES.no_longer_valid,
      "LLM execution grant is no longer valid."
    ));

    expect(detail.metadata?.llmGate).toMatchObject({ invoked: false, code: "llm.provider_resolution_failed", cause: "llm.execution_grant_no_longer_valid" });
    expect(detail.interventions.at(-1)?.validation?.issues).toEqual([
      "llm.provider_resolution_failed: LLM provider resolution failed.",
      "llm.execution_grant_no_longer_valid: the execution grant would not be claimed."
    ]);
  });

  // A thrown value from further down may carry anything, so its message never
  // travels. The absence of a cause is itself the finding: the refusal came from
  // somewhere Core does not yet name.
  it("carries no cause, and no provider text, for a refusal Core does not own", async () => {
    const detail = await annotateUnresolvable(new Error("deepseek says: key sk-PRIVATE rejected"));

    expect(detail.metadata?.llmGate).toMatchObject({ invoked: false, code: "llm.provider_resolution_failed" });
    expect(detail.metadata?.llmGate).not.toHaveProperty("cause");
    expect(JSON.stringify(detail)).not.toContain("sk-PRIVATE");
  });
});

/** A recovery whose provider resolution throws `thrown`, and nothing else unusual. */
async function annotateUnresolvable(thrown: unknown): Promise<AutomationStudioFlowRunDetail> {
  const base: Options = { executed: [] };
  return await annotateAutomationStudioRunDetailWithRuntimeLlm({
    ports: { ...ports(base), resolveLlmProvider: () => { throw thrown; } },
    detail: runDetail(),
    context: context(base, adaptationPolicy(false)),
    failedTraceAttempt: failedAttempt()
  });
}

describe("a recovery the Flow's settings refuse", () => {
  const TRAINING_REFUSAL = "Current training mode or settings do not allow LLM intervention.";

  it("states the refusal in all four stages and asks no provider, for a retryable target failure", async () => {
    const taskKinds: string[] = [];
    const detail = await annotateRefused({ taskKinds, invokeLlm: false });

    expect(taskKinds).toEqual([]);
    expect(detail.interventions).toEqual([]);
    expect(detail.metadata?.llmGate).toEqual({ invoked: false, code: "llm.gate.training_mode", reason: TRAINING_REFUSAL });
    expect(detail.metadata?.recoveryTrace).toEqual({
      schemaVersion: "automation-studio.recovery-trace.v1",
      stages: ["diagnosis", "recovery_plan", "exploration", "resolution"].map((stage) => ({ stage, status: "refused", providerCalled: false, reason: TRAINING_REFUSAL })),
      refused: []
    });
  });

  it("names the spent budget when that is what refused, and still traces every stage", async () => {
    const detail = await annotateRefused({ taskKinds: [], invokeLlm: true, exhausted: ["max cost per training window"] });
    const reason = "Training budget exhausted: max cost per training window.";
    const stages = (detail.metadata?.recoveryTrace as { stages?: JsonObject[] } | undefined)?.stages ?? [];

    expect(detail.metadata?.llmGate).toEqual({ invoked: false, code: "llm.gate.training_budget_exhausted", reason });
    expect(stages.map((stage) => [stage.stage, stage.status, stage.reason])).toEqual([
      ["diagnosis", "refused", reason],
      ["recovery_plan", "refused", reason],
      ["exploration", "refused", reason],
      ["resolution", "refused", reason]
    ]);
  });
});

/** A failed run the gate refuses: settings with LLM intervention off, or a spent training budget, and no grant. */
async function annotateRefused(options: { taskKinds: string[]; invokeLlm: boolean; exhausted?: string[] }): Promise<AutomationStudioFlowRunDetail> {
  const base: Options = { executed: [], taskKinds: options.taskKinds };
  const policy = adaptationPolicy(false);
  const exhausted = options.exhausted ?? [];
  return await annotateAutomationStudioRunDetailWithRuntimeLlm({
    ports: ports(base),
    detail: runDetail(),
    context: {
      ...context(base, policy),
      behavior: { ...behavior(), invokeLlm: options.invokeLlm },
      budgetDecision: { ok: exhausted.length === 0, exhausted, behavior: exhausted.length ? "ask" : "continue" }
    },
    failedTraceAttempt: {
      ...failedAttempt(),
      failure: { category: "target_not_found", code: "web.target.not_found", retryable: true, stage: "target_resolution" }
    }
  });
}

const FAILURE_PAGE: JsonObject = { schemaVersion: "test.page.v1", page: "page.failed", controls: ["candidate.2"] };
const REVEALED_PAGE: JsonObject = { schemaVersion: "test.page.v1", page: "page.revealed", controls: ["candidate.7"] };

type RepairRun = {
  detail: AutomationStudioFlowRunDetail;
  patchRequest?: AutomationStudioLlmTaskRequest;
  asked: Array<{ page: unknown; handles: unknown }>;
  executed: string[];
};

/**
 * One recovery under a `diagnose_and_adapt` grant, whose patch names `handles`,
 * of an action whose target was not found unless `failure` says otherwise.
 */
async function annotateRepair(options: { handles: Record<string, string>; explorationNeeded?: boolean; failure?: AutomationStudioAdaptiveFailureClass; decline?: string }): Promise<RepairRun> {
  const run: RepairRun = { detail: runDetail(), asked: [], executed: [] };
  const base: Options = { executed: run.executed, captureFailureEvidence: true, ...(options.explorationNeeded === false ? { explorationNeeded: false } : {}) };
  const policy = adaptationPolicy(false);
  const patchingProvider: AutomationStudioLlmProvider = {
    metadata: { provider: "mock", model: "debug-model" },
    runTask: async (request) => {
      if (request.expectedOutput !== "runtime_patch") {
        const answered = await provider(base).runTask(request);
        const response = (answered as { response: { kind: string; diagnosis?: JsonObject } }).response;
        return response.kind === "diagnosis" ? { response: { ...response, diagnosis: { ...response.diagnosis, patchNeeded: true } } } : answered;
      }
      run.patchRequest = request;
      if (options.decline) return { response: { kind: "no_repair", summary: "Nothing here replaces it.", reason: options.decline } };
      return {
        response: {
          kind: "runtime_patch",
          summary: "Point the action at the control the exploration found.",
          riskLevel: "medium",
          patches: [{ kind: "temporary_target_override", targetNodeId: "node.action", target: { handles: options.handles }, reason: "The control is behind a disclosure." }]
        }
      };
    }
  };
  const pages: AutomationStudioLlmEvidenceRuntimeBinding = {
    ...binding(base),
    harnessOptions: {
      ...harnessOptions(base),
      implementations: {
        ...harnessOptions(base).implementations,
        "test.inspect": async () => {
          run.executed.push("test.inspect");
          return { kind: "llm_evidence_tool_execution", evidence: REVEALED_PAGE, effectApplied: false };
        }
      }
    },
    captureSanitizedFailureEvidence: async () => FAILURE_PAGE,
    validateTargetOverrideEvidence: (evidence, target) => {
      run.asked.push({ page: evidence.page, handles: target.handles });
      const issued = Array.isArray(evidence.controls) ? evidence.controls : [];
      return Object.values(target.handles).every((handle) => issued.includes(handle))
        ? { status: "resolved", target: { handles: target.handles, page: evidence.page ?? null } }
        : { status: "absent", reason: "handle_not_issued" };
    }
  };
  run.detail = await annotateAutomationStudioRunDetailWithRuntimeLlm({
    ports: {
      ...ports(base),
      resolveLlmProvider: () => ({ provider: patchingProvider, maxCallsPerRun: 6, maxTotalTokensPerRun: 100_000, maxEstimatedCostUsd: 0.25, maxTotalEstimatedCostUsd: 2, tokenLimits: { maxInputTokens: 8_000, maxOutputTokens: 2_000, maxTotalTokens: 10_000 } }),
      llmEvidenceRuntime: pages
    },
    detail: runDetail(),
    context: { ...context(base, policy), behavior: { ...behavior(), createAdaptations: true } },
    runtimeFlow: { schemaVersion: "0.1", flowId: "flow.recovery", ownerKind: "policy", ownerId: "project.recovery", name: "Recovery flow", nodes: [{ id: "node.action", definitionId: "builtin.policy.action" }], edges: [], createdAt: 1, updatedAt: 1 },
    failedTraceAttempt: { ...failedAttempt(), failure: { category: options.failure ?? "target_not_found", code: `test.${options.failure ?? "target_not_found"}`, retryable: false } },
    executionGrant: { grantId: "llm-grant:test", actorUserId: "user.test", actorSessionId: "session.test", purpose: "diagnose_and_adapt" }
  });
  return run;
}

type Options = {
  executed: string[];
  /** The call count the resolver declares; `undeclared` leaves it to Core's backstop. */
  maxCallsPerRun?: number | "undeclared";
  /** The policy's and the settings' intervention limit, when one is set. */
  maxInterventionsPerRun?: number;
  /** The tool ids the model was offered, one entry per exploration decision. */
  offered?: string[][];
  scope?: AutomationStudioFlowScope | undefined;
  explorationNeeded?: boolean;
  allowExternalSideEffects?: boolean;
  /** The domain captures a failure snapshot, as the web domain always does. */
  captureFailureEvidence?: boolean;
  /** Every task kind the provider was actually asked for, in order. */
  taskKinds?: string[];
  /** Whether diagnosis requests a patch after exploration. */
  patchNeeded?: boolean;
  /** The policy's runtime-recovery flag, when the test needs it off. */
  allowRuntimeRecovery?: boolean;
  /**
   * What the second, re-planning diagnosis answers, when it differs from the
   * first. The stub tells the two apart by the stage the context names, which
   * also pins that the re-plan is made at `plan` rather than at `gather` again.
   */
  replan?: { patchNeeded?: boolean; stillAchievable?: "yes" | "no" | "unknown" };
  /** Every request the provider was given, in order, for tests about what a call carried. */
  requests?: AutomationStudioLlmTaskRequest[];
  /** The re-planning call answers with something that is not a diagnosis. */
  replanFails?: boolean;
  /** A terminal diagnosis verdict that prevents any patch request. */
  stillAchievable?: "no";
};

async function annotate(options: Options): Promise<AutomationStudioFlowRunDetail> {
  const policy = {
    ...adaptationPolicy(options.allowExternalSideEffects === true),
    ...(options.maxInterventionsPerRun === undefined ? {} : { maxInterventionsPerRun: options.maxInterventionsPerRun }),
    ...(options.allowRuntimeRecovery === false ? { allowRuntimeRecovery: false } : {})
  };
  return await annotateAutomationStudioRunDetailWithRuntimeLlm({
    ports: ports(options),
    detail: runDetail(),
    context: context(options, policy),
    failedTraceAttempt: failedAttempt()
  });
}

function explorationStage(detail: AutomationStudioFlowRunDetail): JsonObject | undefined {
  return traceStage(detail, "exploration");
}

function planStage(detail: AutomationStudioFlowRunDetail): JsonObject | undefined {
  return traceStage(detail, "recovery_plan");
}

function traceStage(detail: AutomationStudioFlowRunDetail, stage: string): JsonObject | undefined {
  const trace = detail.metadata?.recoveryTrace as { stages?: JsonObject[] } | undefined;
  return trace?.stages?.find((event) => event.stage === stage);
}

function ports(options: Options): AutomationStudioRuntimeRecoveryPorts {
  const scope: AutomationStudioFlowScope | undefined = "scope" in options ? options.scope : { kind: "domain", domainId: "test.domain" };
  return {
    resolveLlmProvider: () => options.maxCallsPerRun === "undeclared"
      ? { provider: provider(options) }
      : { provider: provider(options), maxCallsPerRun: options.maxCallsPerRun ?? 4 },
    llmEvidenceRuntime: binding(options),
    reusableLlmContextEnabled: false,
    flowInstructionSet: async () => [],
    reusableLlmContextForFreshEvidence: async () => undefined,
    flowForRecovery: async () => scope ? { scope } : undefined,
    saveFlowChangeProposal: async (proposal) => proposal,
    saveFlowAdaptation: async (adaptation) => adaptation,
    promoteRuntimeAdaptation: async (input) => input.adaptation
  };
}

/** Answers the diagnosis, then the one exploration decision, and nothing else. */
function provider(options: Options): AutomationStudioLlmProvider {
  return {
    metadata: { provider: "mock", model: "debug-model" },
    runTask: async (request: AutomationStudioLlmTaskRequest) => {
      options.taskKinds?.push(request.taskKind);
      options.requests?.push(request);
      if (request.expectedOutput === "diagnosis") {
        // The re-plan is the diagnosis made at the `plan` stage. Where the test
        // gave it its own answer, that is what looking at the page changed.
        const replanning = request.context.stage === "plan";
        if (replanning && options.replanFails) return { response: { kind: "no_repair", summary: "The second call answered with something else.", reason: "several_alike" } };
        const answer = replanning && options.replan ? options.replan : { patchNeeded: options.patchNeeded !== false, ...(options.stillAchievable ? { stillAchievable: options.stillAchievable } : {}) };
        return {
          response: {
            kind: "diagnosis",
            summary: replanning ? "Looking at the page settles it." : "The action could not find its control.",
            diagnosis: { explorationNeeded: options.explorationNeeded !== false, patchNeeded: answer.patchNeeded !== false, ...(answer.stillAchievable ? { stillAchievable: answer.stillAchievable } : {}) }
          }
        };
      }
      if (request.expectedOutput === "evidence_tool_decision") {
        const offered = (request.context.evidenceLoop?.tools ?? []).map((tool) => tool.toolId);
        options.offered?.push(offered);
        // Look once, then answer. The second decision is the one that completes.
        const decision = request.context.evidenceLoop?.iteration === 1 && offered.includes("test.inspect")
          ? { kind: "tool_call" as const, callId: "call.1", toolId: "test.inspect", input: {} }
          : { kind: "complete" as const, result: { findings: "The control moved." } };
        return { response: { kind: "evidence_tool_decision", summary: "Looking at the control.", decision } };
      }
      throw new Error(`The stub provider was asked for ${request.expectedOutput}.`);
    }
  };
}

function binding(options: Options): AutomationStudioLlmEvidenceRuntimeBinding {
  return {
    domainId: "test.domain",
    deniedEvidenceKeys: [],
    tools: [],
    harnessOptions: harnessOptions(options),
    executeTool: async () => { throw new Error("The bare tool slot is not used by this binding."); },
    ...(options.captureFailureEvidence
      ? { captureSanitizedFailureEvidence: async () => ({ schemaVersion: "test.failure-evidence.v1", failedControl: "submit", visible: false }) }
      : {})
  };
}

/** One observing option and one mutating one, so the policy gate has something to decide. */
function harnessOptions(options: Options): AutomationStudioHarnessOptionBundle {
  return {
    schemaVersion: "0.1",
    domainId: "test.domain",
    options: [
      {
        toolId: "test.inspect",
        description: "Look at what is actually there.",
        inputSchema: { type: "object", additionalProperties: false, properties: {} },
        effect: "observe",
        availability: { kind: "domain", domainId: "test.domain" },
        safety: { sideEffect: "observe" },
        stages: ["gather", "iterate"]
      },
      {
        toolId: "test.reveal",
        description: "Change what is shown so the rest can be seen.",
        inputSchema: { type: "object", additionalProperties: false, properties: {} },
        effect: "mutate",
        availability: { kind: "domain", domainId: "test.domain" },
        safety: { sideEffect: "mutate" },
        stages: ["gather", "iterate"]
      }
    ],
    implementations: {
      // Schema-versioned, because that is what makes the exploration record it
      // as a packet the next call can be shown. Without one the loop looks,
      // learns something, and has nothing to put in front of a re-plan.
      "test.inspect": async () => {
        options.executed.push("test.inspect");
        return { kind: "llm_evidence_tool_execution", evidence: { schemaVersion: "test.page.v1", page: "page.explored", control: "absent" }, effectApplied: false };
      },
      "test.reveal": async () => {
        options.executed.push("test.reveal");
        return { kind: "llm_evidence_tool_execution", evidence: { revealed: true }, effectApplied: true };
      }
    }
  };
}

function context(options: Options, policy: AutomationStudioAdaptationPolicy): AutomationStudioRuntimeAdaptationContext {
  return {
    projectId: "project.recovery",
    flowId: "flow.recovery",
    settings: settings(options),
    policy,
    behavior: behavior(),
    metrics: {
      deterministicSuccessRuns: 0,
      llmInterventionsPerRun: 0,
      unresolvedFailures: 1,
      repeatedTriggers: [],
      acceptedAdaptations: 0,
      rejectedAdaptations: 0,
      stabilityScore: 0.5
    },
    budgetState: { interventionsThisRun: 0, tokensThisRun: 0, costUsdThisTrainingWindow: 0 },
    budgetDecision: { ok: true, exhausted: [], behavior: "continue" },
    runsCompleted: 3,
    recentRunCount: 3,
    recentAdaptationCount: 0,
    recentAdaptations: [],
    resultCheckSchedule: resolveAutomationStudioResultCheckSchedule("initial_then_exponential"),
    resultCheckState: { ordinal: 1, lastCheckedOrdinal: null, checksPassed: 0, lastStatus: null },
    resultCheckEpoch: 1,
    diagnostics: []
  };
}

/** `createAdaptations` is off so the patch call never fires: these are about stage C. */
function behavior(): AutomationStudioTrainingModeBehavior {
  return { invokeLlm: true, runRecovery: true, createAdaptations: false, proposalApprovalMode: "auto", promoteAdaptations: false };
}

function settings(options: Options): AutomationStudioTrainingModeSettings {
  return {
    mode: "continuous_adaptive",
    allowLlmIntervention: true,
    allowRuntimeRecovery: true,
    allowAdaptationCreation: true,
    proposalApprovalMode: "auto",
    allowPromotion: true,
    budgets: {
      maxTokensPerRun: 200_000,
      exhaustedBehavior: "stop",
      ...(options.maxInterventionsPerRun === undefined ? {} : { maxInterventionsPerRun: options.maxInterventionsPerRun })
    }
  };
}

function adaptationPolicy(allowExternalSideEffects: boolean): AutomationStudioAdaptationPolicy {
  return {
    schemaVersion: "0.1",
    policyId: "policy.recovery",
    scope: { kind: "flow", flowId: "flow.recovery" },
    preset: "adaptive",
    proposalMode: "auto",
    allowRuntimeRecovery: true,
    allowCreateRecoveryPaths: true,
    allowModifySubflows: true,
    allowCreateSubflows: true,
    allowModifyRouter: true,
    allowModifyExpectations: true,
    allowModifyActionTargets: true,
    allowDeleteOrDisableBehavior: false,
    allowExternalSideEffects,
    requireApprovalForDestructiveChanges: true,
    requireApprovalForExternalSideEffects: false,
    createdAt: 1,
    updatedAt: 1
  };
}

function failedAttempt(): AutomationStudioNodeAttemptTrace {
  return {
    attemptId: "node.action.attempt.1",
    nodeId: "node.action",
    definitionId: "builtin.policy.action",
    startedAt: 1,
    finishedAt: 2,
    status: "failed",
    route: "failed",
    inputs: {},
    outputs: {},
    effects: [],
    message: "The action failed."
  };
}

function runDetail(): AutomationStudioFlowRunDetail {
  return {
    schemaVersion: "0.1",
    summary: {
      schemaVersion: "0.1",
      runId: "run.failed",
      flowId: "flow.recovery",
      projectId: "project.recovery",
      status: "failed",
      updatedAt: 1_000,
      routeDecisionCount: 0,
      subflowEntryCount: 0,
      actionAttemptCount: 1,
      interventionCount: 0,
      adaptationCount: 0
    },
    routeDecisions: [],
    subflows: [],
    actionAttempts: [{
      attemptId: "node.action.attempt.1",
      nodeId: "node.action",
      definitionId: "builtin.policy.action",
      order: 1,
      status: "failed",
      startedAt: 1,
      finishedAt: 2
    }],
    interventions: [],
    adaptationIds: [],
    changeProposalIds: []
  };
}
