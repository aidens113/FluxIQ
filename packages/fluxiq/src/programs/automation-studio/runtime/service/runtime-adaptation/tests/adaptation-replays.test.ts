// The recorder that turns later provider-free runs into confidence a saved
// change has earned. Until t176 nothing in production called the replay rule,
// so no change ever rose past `provisional` (found by lane t179).

import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowAdaptation, AutomationStudioFlowAdaptationValidationResult } from "../../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../../executor/index.ts";
import type { AutomationStudioBootstrapAdaptation } from "../../../flow-bootstrap/index.ts";
import { automationStudioAdaptationReplayRecorder } from "../adaptation-replays.ts";

const ADAPTATION_ID = "adaptation.repair";
const NODE_ID = "node.repaired";
const TRIAL: AutomationStudioFlowAdaptationValidationResult = { runId: "run.trial", status: "succeeded", checkedAt: 10, kind: "trial", basis: ["expected_outputs"] };

/** The stamped node produced the output it declares: evidence a replay can read off a finished trace. */
function provingAttempt(): AutomationStudioNodeAttemptTrace {
  const attemptId = `${NODE_ID}.attempt.1`;
  return {
    attemptId, nodeId: NODE_ID, definitionId: "definition.action", startedAt: 1, finishedAt: 2, status: "succeeded", route: "success",
    inputs: {}, outputs: { total: 7 }, effects: [], adaptationIds: [ADAPTATION_ID],
    transitionComparison: {
      comparisonId: `${attemptId}.comparison`, nodeId: NODE_ID, attemptId, status: "matched",
      expected: { transitionId: `${attemptId}.expected`, nodeId: NODE_ID, definitionId: "definition.action", expectedOutputs: { total: "7" } },
      actual: { transitionId: `${attemptId}.actual`, nodeId: NODE_ID, definitionId: "definition.action", status: "succeeded", route: "success", outputs: { total: 7 }, effects: [], startedAt: 1 },
      diffSummary: { missingOutputIds: [], unexpectedOutputIds: [], missingEffectTypes: [], unexpectedEffectTypes: [], routeMatched: true, statusMatched: true, stateCheckCount: 0 }
    }
  };
}

function storeWith(adaptation: Partial<AutomationStudioFlowAdaptation>) {
  let stored = { adaptationId: ADAPTATION_ID, projectId: "project", flowId: "flow", status: "applied", riskLevel: "low", validationResults: [TRIAL], ...adaptation } as AutomationStudioFlowAdaptation;
  const saves: AutomationStudioFlowAdaptation[] = [];
  const reads: Array<[string, string, string]> = [];
  return {
    saves,
    reads,
    current: () => stored,
    store: {
      getFlowBootstrapAdaptation: async () => null,
      saveFlowBootstrapAdaptation: async () => { throw new Error("not a bootstrap adaptation"); },
      getFlowAdaptation: async (projectId: string, flowId: string, adaptationId: string) => { reads.push([projectId, flowId, adaptationId]); return adaptationId === ADAPTATION_ID ? stored : null; },
      saveFlowAdaptation: async (saved: AutomationStudioFlowAdaptation) => { saves.push(saved); stored = saved; return saved; }
    }
  };
}

const run = (runId: string, checkedAt: number) => ({ projectId: "project", flowId: "flow", runId, checkedAt, trace: { attempts: [provingAttempt()], status: "succeeded" as const } });

describe("recording a finished run as a replay of the changes it ran", () => {
  it("saves each proved replay, and a change that keeps working rises to established", async () => {
    const fixture = storeWith({});
    const record = automationStudioAdaptationReplayRecorder(fixture.store);

    const [first] = await record(run("run.1", 100));
    expect(first).toMatchObject({ adaptationId: ADAPTATION_ID, result: { runId: "run.1", kind: "replay", status: "succeeded" }, after: { tier: "provisional" } });
    const [second] = await record(run("run.2", 200));
    expect(second).toMatchObject({ after: { tier: "established" }, promoted: true });

    expect(fixture.reads).toEqual([["project", "flow", ADAPTATION_ID], ["project", "flow", ADAPTATION_ID]]);
    expect(fixture.current().validationResults?.map((result) => [result.runId, result.kind])).toEqual([["run.trial", "trial"], ["run.1", "replay"], ["run.2", "replay"]]);
  });

  it("writes nothing for a run it has already counted, a change that is not applied, or a run that ran no stamped node", async () => {
    const counted = storeWith({});
    const record = automationStudioAdaptationReplayRecorder(counted.store);
    await record(run("run.1", 100));
    await record(run("run.1", 150));
    expect(counted.saves).toHaveLength(1);

    const proposed = storeWith({ status: "proposed" });
    expect(await automationStudioAdaptationReplayRecorder(proposed.store)(run("run.1", 100))).toEqual([expect.objectContaining({ skippedCode: "not_applied" })]);
    expect(proposed.saves).toEqual([]);

    const untouched = storeWith({});
    expect(await automationStudioAdaptationReplayRecorder(untouched.store)({ ...run("run.1", 100), trace: { attempts: [{ ...provingAttempt(), adaptationIds: [] }], status: "succeeded" } })).toEqual([]);
    expect(untouched.reads).toEqual([]);
  });

  // The stamp a created or repaired Flow carries is a Flow Bootstrap
  // adaptation's, whose record keeps its own results. The service's generic read
  // answers it as a projection with none, saved nowhere it is read back from.
  it("reads and writes a Flow Bootstrap adaptation as itself, never through the runtime store", async () => {
    let bootstrap = { adaptationId: ADAPTATION_ID, projectId: "project", flowId: "flow", status: "applied", riskLevel: "low" } as unknown as AutomationStudioBootstrapAdaptation;
    const runtimeSaves: unknown[] = [];
    const record = automationStudioAdaptationReplayRecorder({
      getFlowBootstrapAdaptation: async () => bootstrap,
      saveFlowBootstrapAdaptation: async (saved) => { bootstrap = saved; return saved; },
      getFlowAdaptation: async () => { throw new Error("the runtime store is never asked for a bootstrap adaptation"); },
      saveFlowAdaptation: async (saved) => { runtimeSaves.push(saved); return saved; }
    });
    await record(run("run.1", 100));
    const [second] = await record(run("run.2", 200));
    expect(bootstrap.validationResults?.map((result) => [result.runId, result.kind, result.status])).toEqual([["run.1", "replay", "succeeded"], ["run.2", "replay", "succeeded"]]);
    expect(second?.after.tier).toBe("established");
    expect(runtimeSaves).toEqual([]);
  });
});
