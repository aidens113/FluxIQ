import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowAdaptation, AutomationStudioFlowRunDetail, AutomationStudioRuntimeSession } from "../../../../model/index.ts";
import { AutomationStudioProjectStoreUnavailableError } from "../../../../storage/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../../executor/index.ts";
import type { AutomationStudioRuntimeAdaptationContext } from "../contracts.ts";
import { automationStudioRunInRunRepairAdaptationIds, validateAutomationStudioHeldInRunRepairs } from "../held-fix-validation.ts";
import { settleAutomationStudioRunJudgedPromotions } from "../judged-promotion.ts";

// A held fix has passed its trial, the executor's re-attempt of the unit, and
// is `validated` like a detached patch whose live trial passed, only on
// positive evidence: an expected state a host evaluated, or, with none
// declared, its declared outputs observed. It is still saved only after the
// run's judged end (state-aware recovery plan, C6 step 8).

const RUN_ID = "run.held";
const REPAIR = `repair.${RUN_ID}.incident-1`;
const FRAME = ["invocation-1"];

function adaptation(id: string, overrides: Partial<AutomationStudioFlowAdaptation> = {}): AutomationStudioFlowAdaptation {
  return {
    schemaVersion: "0.1",
    adaptationId: id,
    flowId: "flow.held",
    projectId: "project.held",
    sourceRunId: RUN_ID,
    trigger: "Runtime patch temporary_wait_retry was overlaid in the run at its failing step and waits for the run's judged end.",
    patch: [{ kind: "edit_expectation", targetId: "drift", summary: "Retry twice.", after: { retryCount: 2 } }],
    status: "testing",
    author: "runtime",
    riskLevel: "low",
    createdAt: 1,
    updatedAt: 1,
    metadata: { verification: { status: "unverifiable", reason: "in_run_trial", awaitsJudgedRun: true } },
    ...overrides
  };
}

/** One attempt; `declares` is what the node declared for its comparison to match, and `host` that it ran on a host that evaluates expected state. */
/**
 * `host: true` is a host that evaluated the expected state (its comparison says
 * so); `host: "threw"` is a host that offers evaluation but whose evaluator
 * broke, so the comparison kept is not the host's.
 */
function attempt(nodeId: string, status: "succeeded" | "failed", options: { repair?: JsonObject; declares?: JsonObject; framePath?: string[]; child?: AutomationStudioNodeAttemptTrace[]; host?: true | "threw" } = {}): AutomationStudioNodeAttemptTrace {
  return {
    attemptId: `${nodeId}.${status}.${Math.random()}`,
    nodeId,
    status,
    framePath: options.framePath ?? FRAME,
    ...(options.host ? { hostCapabilities: ["action-dispatch", "expectation-evaluation"] } : {}),
    transitionComparison: {
      status: status === "succeeded" ? "matched" : "action_failed",
      expected: { expectedStatus: "succeeded", ...(options.declares ?? { expectedOutputs: { done: true } }) },
      ...(options.host === true ? { metadata: { hostEvaluated: true } } : {})
    },
    ...(options.repair ? { repair: options.repair } : {}),
    ...(options.child ? { childTrace: { status: "succeeded", attempts: options.child } } : {})
  } as unknown as AutomationStudioNodeAttemptTrace;
}

const held = { repairId: REPAIR, unit: { kind: "node", nodeId: "drift" }, outcome: "held", reason: "Retry twice." };
const detail = { adaptationIds: ["a.1"], metadata: { inRunRepairs: [{ repairId: REPAIR, adaptationId: "a.1", outcome: "overlaid" }] } } as unknown as AutomationStudioFlowRunDetail;

async function validate(options: { repairs?: string[]; attempts: AutomationStudioNodeAttemptTrace[]; stored?: AutomationStudioFlowAdaptation; gone?: "unavailable" | "other" }) {
  const stored = new Map([["a.1", options.stored ?? adaptation("a.1")]]);
  const validated = await validateAutomationStudioHeldInRunRepairs({
    ports: {
      getFlowAdaptation: async (_projectId, _flowId, id) => {
        if (options.gone) throw options.gone === "unavailable" ? new AutomationStudioProjectStoreUnavailableError("Automation Studio project database pool is closing.") : new Error("constraint failed");
        return stored.get(id) ?? null;
      },
      saveFlowAdaptation: async (saved) => {
        stored.set(saved.adaptationId, saved);
        return saved;
      }
    },
    projectId: "project.held",
    flowId: "flow.held",
    session: { runId: RUN_ID, trace: { repairs: options.repairs ?? [REPAIR], attempts: options.attempts } },
    detail
  });
  return { validated, stored: stored.get("a.1") };
}

describe("a fix the run held in place", () => {
  it("is validated when its re-attempt matched what the step declares, with that re-attempt recorded as its trial", async () => {
    const { validated, stored } = await validate({ attempts: [attempt("start", "succeeded"), attempt("drift", "failed", { repair: held }), attempt("drift", "succeeded"), attempt("end", "succeeded")] });

    expect(validated).toEqual(["a.1"]);
    expect(stored).toMatchObject({
      status: "validated",
      validationResults: [{ runId: RUN_ID, status: "succeeded", kind: "trial", basis: ["in_run_trial"] }],
      // Its approval decision is untouched: it is saved only by the judged end's settle.
      metadata: { verification: { reason: "in_run_trial", awaitsJudgedRun: true } }
    });
  });

  it("stays testing when its trial failed and the executor dropped it", async () => {
    const dropped = { ...held, outcome: "dropped" };
    const { validated, stored } = await validate({ repairs: [], attempts: [attempt("drift", "failed", { repair: held }), attempt("drift", "failed", { repair: dropped })] });

    expect(validated).toEqual([]);
    expect(stored).toMatchObject({ status: "testing" });
    expect(stored?.validationResults).toBeUndefined();
  });

  it("stays testing when its step declares nothing the re-attempt could match, leaving the judged run as its evidence", async () => {
    const { validated, stored } = await validate({ attempts: [attempt("press", "failed", { repair: held, declares: {} }), attempt("press", "succeeded", { declares: {} })] });

    expect(validated).toEqual([]);
    expect(stored?.status).toBe("testing");
  });

  // C6 step 8: the fix holds when the node's expected state is true. Only a
  // host that evaluates it can say so; without one the executor reads it from
  // the attempt's own route, which is no evidence (C9: unknown never satisfies).
  it("is validated when a host evaluated the step's expected state on the re-attempt and it held", async () => {
    const declares = { expectedState: { settled: true } };
    const { validated, stored } = await validate({ attempts: [attempt("drift", "failed", { repair: held, declares }), attempt("drift", "succeeded", { declares, host: true })] });

    expect(validated).toEqual(["a.1"]);
    expect(stored?.status).toBe("validated");
  });

  it("stays testing when the host offers evaluation but its evaluator broke on the re-attempt", async () => {
    const declares = { expectedState: { settled: true } };
    const { validated, stored } = await validate({ attempts: [attempt("drift", "failed", { repair: held, declares }), attempt("drift", "succeeded", { declares, host: "threw" })] });

    expect(validated).toEqual([]);
    expect(stored?.status).toBe("testing");
  });

  it("stays testing when no host evaluated the step's expected state, though its declared outputs were observed", async () => {
    const declares = { expectedOutputs: { done: true }, expectedState: { settled: true } };
    const { validated, stored } = await validate({ attempts: [attempt("drift", "failed", { repair: held, declares }), attempt("drift", "succeeded", { declares })] });

    expect(validated).toEqual([]);
    expect(stored).toMatchObject({ status: "testing", metadata: { verification: { status: "unverifiable", reason: "in_run_trial" } } });
    expect(stored?.validationResults).toBeUndefined();
  });

  it("stays testing on a match the route alone, or the effects alone, gave", async () => {
    for (const declares of [{ expectedRoute: "success" }, { expectedEffects: [{ type: "policy.output.dispatch" }] }]) {
      const { validated, stored } = await validate({ attempts: [attempt("drift", "failed", { repair: held, declares }), attempt("drift", "succeeded", { declares, host: true })] });

      expect(validated).toEqual([]);
      expect(stored?.status).toBe("testing");
    }
  });

  it("stays testing when the run stopped before the re-attempt succeeded", async () => {
    const { validated } = await validate({ attempts: [attempt("drift", "failed", { repair: held })] });

    expect(validated).toEqual([]);
  });

  it("does not read another frame's success of a same-named node as the trial", async () => {
    const { validated } = await validate({ attempts: [attempt("drift", "failed", { repair: held }), attempt("drift", "succeeded", { framePath: ["invocation-1", "invocation-2"] })] });

    expect(validated).toEqual([]);
  });

  it("reads a child frame's re-attempt through its Call Subflow attempt", async () => {
    const child = [attempt("drift", "failed", { repair: held, framePath: ["invocation-1", "invocation-2"] }), attempt("drift", "succeeded", { framePath: ["invocation-1", "invocation-2"] })];
    const { validated } = await validate({ attempts: [attempt("call", "succeeded", { child })] });

    expect(validated).toEqual(["a.1"]);
  });

  it("leaves a change that is no longer testing as it is", async () => {
    const applied = adaptation("a.1", { status: "applied" });
    const { validated, stored } = await validate({ stored: applied, attempts: [attempt("drift", "failed", { repair: held }), attempt("drift", "succeeded")] });

    expect(validated).toEqual([]);
    expect(stored).toBe(applied);
  });

  it("validates nothing when the store went away, and still throws a store that answered with an error", async () => {
    const attempts = [attempt("drift", "failed", { repair: held }), attempt("drift", "succeeded")];

    await expect(validate({ attempts, gone: "unavailable" })).resolves.toMatchObject({ validated: [] });
    await expect(validate({ attempts, gone: "other" })).rejects.toThrow("constraint failed");
  });

  it("names only the receipts of repairs the run kept", () => {
    expect(automationStudioRunInRunRepairAdaptationIds(detail, [REPAIR])).toEqual(["a.1"]);
    expect(automationStudioRunInRunRepairAdaptationIds(detail, ["repair.other"])).toEqual([]);
    expect(automationStudioRunInRunRepairAdaptationIds(detail, undefined)).toEqual([]);
  });
});

describe("the judged end of a run that held a fix", () => {
  async function settleRun(options: { promote: boolean; reason?: "run_errored" }) {
    const stored = new Map([["a.1", adaptation("a.1")]]);
    const reads: string[] = [];
    const applied: string[] = [];
    const ended = {
      runId: RUN_ID, status: "succeeded", projectId: "project.held", flowId: "flow.held",
      trace: { status: "succeeded", repairs: [REPAIR], attempts: [attempt("drift", "failed", { repair: held }), attempt("drift", "succeeded")] }
    } as unknown as AutomationStudioRuntimeSession;
    const result = await settleAutomationStudioRunJudgedPromotions({
      ports: {
        getFlowRunDetail: async (_projectId, runId) => {
          reads.push(runId);
          return detail;
        },
        saveFlowRunDetail: async (saved) => saved,
        writeRuntimeSession: async () => undefined,
        getFlowAdaptation: async (_projectId, _flowId, id) => stored.get(id) ?? null,
        saveFlowAdaptation: async (saved) => {
          stored.set(saved.adaptationId, saved);
          return saved;
        },
        applyFlowAdaptation: async (request) => {
          applied.push(request.adaptationId);
          return { ...stored.get(request.adaptationId)!, status: "applied" };
        }
      },
      projectId: "project.held",
      flowId: "flow.held",
      context: { behavior: { promoteAdaptations: options.promote } } as Pick<AutomationStudioRuntimeAdaptationContext, "behavior">,
      session: ended,
      ...(options.reason ? { reason: options.reason } : {})
    });
    return { result, ended, reads, applied, stored: stored.get("a.1") };
  }

  it("validates the held fix even when the run may not promote, and saves nothing", async () => {
    const { result, ended, reads, applied, stored } = await settleRun({ promote: false });

    expect(result).toBe(ended);
    expect(reads).toEqual([RUN_ID]);
    expect(stored?.status).toBe("validated");
    expect(applied).toEqual([]);
  });

  it("reads no trial off a run that threw", async () => {
    const { reads, stored } = await settleRun({ promote: false, reason: "run_errored" });

    expect(reads).toEqual([]);
    expect(stored?.status).toBe("testing");
  });
});
