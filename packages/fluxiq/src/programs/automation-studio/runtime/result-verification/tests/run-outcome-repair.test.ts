// The loop closing: a wrong answer is repaired, the corrected Flow runs again,
// and its result is judged.
//
// A repair that edits the Flow and stops has left a corrected Flow nobody has
// run. What was asked for is the corrected Flow *answering the question*, so
// these pin what makes that true and safe: the re-run happens, it happens only
// when the edit actually reached the Flow, a re-run refuted again is repaired
// again with the earlier refutation in hand, and the loop stops when a repair
// stops changing the answer (`recovery/refuted-result/history.ts`).
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowRunDetail } from "../../../model/index.ts";
import { AUTOMATION_STUDIO_RESULT_REPAIR_METADATA_KEY, automationStudioRefutedResultReauthored } from "../../recovery/refuted-result/index.ts";
import { verifyAutomationStudioRuntimeSessionResult, type AutomationStudioResultVerificationPorts } from "../run-outcome.ts";
import { ANSWER, flow, harness, runDetail, session, type ScriptedAnswer } from "./run-outcome-harness.ts";

describe("the re-run a repair earns", () => {
  /** A repair that routed, edited the Flow, and says so on the run. */
  const repaired = (applied: true | undefined) => async (request: { detail: AutomationStudioFlowRunDetail }) =>
    automationStudioRefutedResultReauthored({
      detail: request.detail,
      decision: { route: true, projectId: "project-1", flowId: "flow-1" },
      adaptationId: "adaptation.bootstrap.1",
      ...(applied ? { applied } : {})
    });

  /** A run detail with the step the result came out of, which is what the refuted attempt is attributed to. */
  const producedDetail = (): AutomationStudioFlowRunDetail => ({
    ...runDetail(),
    actionAttempts: [{ attemptId: "attempt.1", nodeId: "n2", definitionId: "builtin.policy.action", order: 1, status: "succeeded", startedAt: 2, finishedAt: 3, metadata: { recordCount: 240 } }]
  });

  /**
   * A harness whose run store behaves like one: what a pass saved is what the
   * next pass reads. Without that the marker a repair writes would not survive
   * into the second verification, which is exactly what bounds the loop.
   */
  function looping(answers: readonly ScriptedAnswer[], options: { applied?: true; rerunStatus?: "succeeded" | "failed"; rerunCheck?: { checked: boolean; epoch: number; code: string; reason: string } } = {}) {
    const context = harness({ answers });
    const reruns: Array<{ detail: AutomationStudioFlowRunDetail; subflowId?: string | undefined }> = [];
    const repairs: AutomationStudioFlowRunDetail[] = [];
    /** The earlier refutations each repair was handed, by attempt number. */
    const histories: number[][] = [];
    const ports: AutomationStudioResultVerificationPorts = {
      ...context.ports,
      getFlowRunDetail: async () => context.saved.at(-1) ?? producedDetail(),
      repairRefutedResult: async (request) => {
        repairs.push(request.detail);
        histories.push(request.history.map((entry) => entry.attempt));
        return await repaired(options.applied)(request);
      },
      rerunRepairedFlow: async (request) => {
        reruns.push(request);
        return { session: session({ status: options.rerunStatus ?? "succeeded", runId: "run-1" }), ...(options.rerunCheck ? { resultCheck: options.rerunCheck } : {}) };
      }
    };
    return { ...context, ports, reruns, repairs, histories };
  }

  const repairMarker = (detail: AutomationStudioFlowRunDetail | undefined) => (detail?.metadata?.[AUTOMATION_STUDIO_RESULT_REPAIR_METADATA_KEY] ?? {}) as JsonObject;

  it("runs the corrected Flow again and judges what it produced", async () => {
    // Refuted, repaired, re-run, and the second answer is right.
    const context = looping([ANSWER.no, ANSWER.no, ANSWER.yes, ANSWER.yes], { applied: true });
    const next = await verifyAutomationStudioRuntimeSessionResult({ ports: context.ports, projectId: "project-1", session: session(), flow, subflowId: "sub-1" });

    expect(context.repairs).toHaveLength(1);
    expect(context.reruns).toHaveLength(1);
    expect(context.reruns[0]).toMatchObject({ subflowId: "sub-1" });
    // The run the caller is handed is the re-run's, and it passed: the corrected
    // Flow answered the question, which is the whole point of the loop.
    expect(next.status).toBe("succeeded");
    expect((next.metadata?.resultVerification as JsonObject).status).toBe("confirmed");
  });

  // The re-run is judged as a repair, so the check that judges it is the one
  // the re-run port re-decided, not the run's routine decision (t273).
  it("records the check the re-run port re-decided, not the one the run started with", async () => {
    const started = { checked: true, epoch: 1, code: "core.result_check.initial_window", reason: "Started." };
    const repairedCheck = { checked: true, epoch: 1, code: "core.result_check.after_repair", reason: "Repaired." };
    const context = looping([ANSWER.no, ANSWER.no, ANSWER.yes, ANSWER.yes], { applied: true, rerunCheck: repairedCheck });
    const next = await verifyAutomationStudioRuntimeSessionResult({ ports: context.ports, projectId: "project-1", session: session(), flow, resultCheck: started });

    expect(context.reruns).toHaveLength(1);
    expect(next.metadata?.resultCheck).toMatchObject({ code: "core.result_check.after_repair", status: "confirmed" });
    expect(context.saved.at(-1)?.summary.metadata?.resultCheck).toMatchObject({ code: "core.result_check.after_repair" });
  });

  it("does not re-run when the repair changed nothing", async () => {
    // An edit that was built and could not be applied has left the same Flow in
    // place; running it again would buy a second verdict on the first one.
    const context = looping([ANSWER.no, ANSWER.no], {});
    const next = await verifyAutomationStudioRuntimeSessionResult({ ports: context.ports, projectId: "project-1", session: session(), flow });
    expect(context.repairs).toHaveLength(1);
    expect(context.reruns).toHaveLength(0);
    expect(next.status).toBe("failed");
  });

  it("repairs again when a re-run answers wrongly again, shown the earlier refutation, and stops when the answer stops changing", async () => {
    // Every pass stores the same rows and is refuted: the second repair is
    // still made, and the third is not, because two repairs in a row left the
    // answer exactly as it was (`run-mulwm2dc-0bd95f22`'s shape).
    const context = looping(Array.from({ length: 6 }, () => ANSWER.no), { applied: true });
    const next = await verifyAutomationStudioRuntimeSessionResult({ ports: context.ports, projectId: "project-1", session: session(), flow });

    expect(context.repairs).toHaveLength(2);
    expect(context.reruns).toHaveLength(2);
    expect(context.reruns[0]).not.toHaveProperty("subflowId");
    // The second repair was handed the first refutation.
    expect(context.histories).toEqual([[], [1]]);
    expect(next.status).toBe("failed");
    expect(repairMarker(context.saved.at(-1))).toMatchObject({ phase: "settled", outcome: "stopped", stopped: "result_repair.not_converging" });
  });

  it("says on the run that a repair is in progress, and that it settled once the repaired answer was judged", async () => {
    const context = looping([ANSWER.no, ANSWER.no, ANSWER.yes, ANSWER.yes], { applied: true });
    await verifyAutomationStudioRuntimeSessionResult({ ports: context.ports, projectId: "project-1", session: session(), flow });
    // What a reader saw while the repair was being built.
    expect(repairMarker(context.repairs[0])).toMatchObject({ attempted: true, attempts: 1, phase: "reauthoring" });
    expect(repairMarker(context.saved.at(-1))).toMatchObject({ phase: "settled", outcome: "answered" });
  });

  it("judges a re-run that failed a step as the failed run it is", async () => {
    const context = looping([ANSWER.no, ANSWER.no], { applied: true, rerunStatus: "failed" });
    const next = await verifyAutomationStudioRuntimeSessionResult({ ports: context.ports, projectId: "project-1", session: session(), flow });
    expect(context.reruns).toHaveLength(1);
    // Nothing is verified about a run that did not finish, and nothing loops.
    expect(next.status).toBe("failed");
    expect(context.repairs).toHaveLength(1);
  });
});
