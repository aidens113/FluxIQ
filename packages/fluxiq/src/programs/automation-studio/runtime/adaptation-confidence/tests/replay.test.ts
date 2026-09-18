import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowAdaptation, AutomationStudioFlowAdaptationValidationResult } from "../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../executor/index.ts";
import {
  recordAutomationStudioAdaptationReplays,
  withAutomationStudioAdaptationReplay,
  type AutomationStudioAdaptationReplayInput,
  type AutomationStudioAdaptationReplayOutcome,
  type AutomationStudioAdaptationReplaySubject
} from "../index.ts";

const ADAPTATION_ID = "adaptation.repair";
const NODE_ID = "node.repaired";

type AttemptOverrides = Partial<AutomationStudioNodeAttemptTrace> & { expectedOutputs?: Record<string, string>; expectedRoute?: string; expectedState?: Record<string, string> };

/**
 * One executed attempt as a finished run records it. The transition comparison
 * is built from the declarations an override names, because that is where the
 * replay reads a node's declared route, outputs and expected state from.
 */
function attempt(nodeId: string, overrides: AttemptOverrides = {}): AutomationStudioNodeAttemptTrace {
  const { expectedOutputs, expectedRoute, expectedState, ...rest } = overrides;
  const status = rest.status ?? "succeeded";
  const base: AutomationStudioNodeAttemptTrace = {
    attemptId: `${nodeId}.attempt.1`,
    nodeId,
    definitionId: "definition.action",
    startedAt: 1,
    finishedAt: 2,
    status,
    route: status === "failed" ? "failed" : "success",
    inputs: {},
    outputs: {},
    effects: [],
    ...rest
  };
  const declares = expectedOutputs !== undefined || expectedRoute !== undefined || expectedState !== undefined;
  if (!declares) return base;
  return {
    ...base,
    transitionComparison: {
      comparisonId: `${base.attemptId}.comparison`,
      nodeId,
      attemptId: base.attemptId,
      status: "matched",
      expected: {
        transitionId: `${base.attemptId}.expected`,
        nodeId,
        definitionId: base.definitionId,
        ...(expectedRoute !== undefined ? { expectedRoute } : {}),
        ...(expectedOutputs !== undefined ? { expectedOutputs } : {}),
        ...(expectedState !== undefined ? { expectedState } : {})
      },
      actual: {
        transitionId: `${base.attemptId}.actual`,
        nodeId,
        definitionId: base.definitionId,
        status: base.status,
        ...(base.route !== undefined ? { route: base.route } : {}),
        outputs: base.outputs,
        effects: base.effects,
        startedAt: base.startedAt
      },
      diffSummary: { missingOutputIds: [], unexpectedOutputIds: [], missingEffectTypes: [], unexpectedEffectTypes: [], routeMatched: true, statusMatched: true, stateCheckCount: Object.keys(expectedState ?? {}).length }
    }
  };
}

/** A node the change wrote: the stamp is what makes the run a replay of it. */
function stamped(overrides: AttemptOverrides = {}): AutomationStudioNodeAttemptTrace {
  return { ...attempt(NODE_ID, overrides), adaptationIds: [ADAPTATION_ID] };
}

/** An attempt that produced the output it declares, which is evidence a replay can read off a trace. */
const provingAttempt = () => stamped({ outputs: { total: 7 }, expectedOutputs: { total: "7" } });

function subject(overrides: Partial<AutomationStudioAdaptationReplaySubject> = {}): AutomationStudioAdaptationReplaySubject {
  return { adaptationId: ADAPTATION_ID, riskLevel: "low", status: "applied", ...overrides };
}

function replay(
  attempts: AutomationStudioNodeAttemptTrace[],
  adaptation: AutomationStudioAdaptationReplaySubject = subject(),
  overrides: Partial<AutomationStudioAdaptationReplayInput> = {}
): AutomationStudioAdaptationReplayOutcome {
  const [outcome] = recordAutomationStudioAdaptationReplays({
    runId: "run.later",
    checkedAt: 100,
    trace: { attempts, status: "succeeded" },
    adaptations: [adaptation],
    ...overrides
  });
  return outcome!;
}

const succeededTrial: AutomationStudioFlowAdaptationValidationResult = { runId: "run.trial", status: "succeeded", checkedAt: 10, kind: "trial", basis: ["expected_outputs"] };
const succeededReplay = (runId: string, checkedAt: number): AutomationStudioFlowAdaptationValidationResult =>
  ({ runId, status: "succeeded", checkedAt, kind: "replay", basis: ["expected_outputs"] });

describe("recording a later run as a replay", () => {
  it("records a succeeded replay when the run proves the change", () => {
    const outcome = replay([provingAttempt()]);
    expect(outcome.verdict?.outcome).toBe("verified");
    expect(outcome.result).toMatchObject({ runId: "run.later", status: "succeeded", checkedAt: 100, kind: "replay", basis: ["expected_outputs"] });
    expect(outcome.skippedCode).toBeUndefined();
  });

  it("reads only the nodes the change stamped", () => {
    const outcome = replay([attempt("node.unrelated", { outputs: { total: 7 }, expectedOutputs: { total: "7" } })]);
    expect(outcome.result).toBeUndefined();
    expect(outcome.skippedCode).toBe("not_exercised");
    expect(outcome.after).toEqual(outcome.before);
  });

  it("records a failed replay when the changed node failed again", () => {
    const outcome = replay([stamped({ status: "failed" })], subject({ validationResults: [succeededTrial] }));
    expect(outcome.verdict?.outcome).toBe("contradicted");
    expect(outcome.result).toMatchObject({ status: "failed", kind: "replay" });
    expect(outcome.before.tier).toBe("provisional");
    expect(outcome.after).toMatchObject({ tier: "unverified", lastFailure: "replay" });
    expect(outcome.demoted).toBe(true);
  });
});

// The promotion contract: two succeeded replays, and only two. One success is
// indistinguishable from luck on a flaky page, so the first replay must leave
// the change exactly where the trial left it.
describe("promotion to established", () => {
  it("stays provisional after the first succeeded replay", () => {
    const outcome = replay([provingAttempt()], subject({ validationResults: [succeededTrial] }));
    expect(outcome.result?.status).toBe("succeeded");
    expect(outcome.before.tier).toBe("provisional");
    expect(outcome.after).toMatchObject({ tier: "provisional", replays: 1, replaysRequired: 2 });
    expect(outcome.promoted).toBe(false);
  });

  it("promotes on the second succeeded replay and not before", () => {
    const outcome = replay([provingAttempt()], subject({ validationResults: [succeededTrial, succeededReplay("run.replay.1", 20)] }));
    expect(outcome.before).toMatchObject({ tier: "provisional", replays: 1 });
    expect(outcome.after).toMatchObject({ tier: "established", replays: 2 });
    expect(outcome.promoted).toBe(true);
  });

  it("makes a high-risk change earn one replay more", () => {
    const results = [succeededTrial, succeededReplay("run.replay.1", 20)];
    expect(replay([provingAttempt()], subject({ riskLevel: "high", validationResults: results })).after).toMatchObject({ tier: "provisional", replays: 2, replaysRequired: 3 });
    expect(replay([provingAttempt()], subject({ riskLevel: "high", validationResults: [...results, succeededReplay("run.replay.2", 30)] })).after).toMatchObject({ tier: "established", replays: 3 });
  });
});

// Absence of evidence is never confidence. Each case below is a run that did
// not contradict the change and still must not move it.
describe("failing closed", () => {
  it("records nothing when the changed node succeeded but proved nothing", () => {
    const outcome = replay([stamped()], subject({ validationResults: [succeededTrial, succeededReplay("run.replay.1", 20)] }));
    expect(outcome.verdict?.outcome).toBe("unverifiable");
    expect(outcome.result).toBeUndefined();
    expect(outcome.skippedCode).toBe("proved_nothing");
    expect(outcome.after).toEqual(outcome.before);
    expect(outcome.after.tier).toBe("provisional");
    expect(outcome.promoted).toBe(false);
  });

  it("never reads a declared expected state as judged, since a finished trace holds no answer to it", () => {
    const outcome = replay([stamped({ expectedState: { cart: "empty" } })], subject({ validationResults: [succeededTrial, succeededReplay("run.replay.1", 20)] }));
    expect(outcome.verdict?.checks.find((check) => check.kind === "expected_state")).toMatchObject({ status: "unknown", code: "expected_state_unevaluated" });
    expect(outcome.result).toBeUndefined();
    expect(outcome.after.tier).toBe("provisional");
  });

  it("leaves a change with no replays at provisional however good its trial was", () => {
    const outcome = replay([attempt("node.other")], subject({ validationResults: [succeededTrial] }));
    expect(outcome.before).toMatchObject({ tier: "provisional", trials: 1, replays: 0 });
    expect(outcome.after.tier).toBe("provisional");
  });

  it("refuses a stamp naming a change that is not applied", () => {
    for (const status of ["proposed", "testing", "validated", "rejected", "reverted"] as const) {
      const outcome = replay([provingAttempt()], subject({ status, validationResults: [succeededTrial, succeededReplay("run.replay.1", 20)] }));
      expect(outcome.skippedCode).toBe("not_applied");
      expect(outcome.result).toBeUndefined();
      expect(outcome.after.tier).toBe("provisional");
    }
  });

  it("lets one run count once, so a run cannot both trial and replay a change", () => {
    const trialedHere: AutomationStudioFlowAdaptationValidationResult = { ...succeededTrial, runId: "run.later" };
    const outcome = replay([provingAttempt()], subject({ validationResults: [trialedHere] }));
    expect(outcome.skippedCode).toBe("run_already_counted");
    expect(outcome.result).toBeUndefined();
    expect(outcome.after).toMatchObject({ tier: "provisional", replays: 0 });
  });
});

describe("appending a replay result", () => {
  const adaptation = (validationResults?: AutomationStudioFlowAdaptationValidationResult[]): AutomationStudioFlowAdaptation => ({
    schemaVersion: "0.1",
    adaptationId: ADAPTATION_ID,
    flowId: "flow.1",
    projectId: "project.1",
    trigger: "Repair",
    patch: [{ kind: "edit_action_target", targetId: NODE_ID, summary: "Repoint" }],
    status: "applied",
    author: "runtime",
    riskLevel: "low",
    createdAt: 1,
    updatedAt: 1,
    ...(validationResults ? { validationResults } : {})
  });

  it("appends a result for a run that has not spoken yet", () => {
    const result = succeededReplay("run.later", 100);
    expect(withAutomationStudioAdaptationReplay(adaptation([succeededTrial]), result).validationResults).toEqual([succeededTrial, result]);
  });

  it("drops a result whose run already recorded one", () => {
    const saved = adaptation([succeededTrial]);
    expect(withAutomationStudioAdaptationReplay(saved, succeededReplay(succeededTrial.runId, 100))).toBe(saved);
  });
});
