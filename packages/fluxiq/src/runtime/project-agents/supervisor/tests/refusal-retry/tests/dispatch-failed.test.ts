// `project.dispatch_failed` says what is known of the target. The real dispatcher throws for a record it cannot hold or write, and
// a failed return write comes after its builder ran (`../../../../dispatch/dispatcher.ts`), so answering that nothing was applied
// could let a later step repeat a lasting act whose earlier attempt may have landed. Driven through the real dispatch tool, the real
// dispatcher, the real loop and its real repeat guard; only the builder and the record's failing write are stand-ins. A lending library.
import { projectAutomationStudioFailureControlRecord } from "@fluxiq/contracts/automation";
import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioBuildCancellation } from "../../../../../../framework/automation-service/service/flow-bootstrap-commands/index.ts";
import type { AutomationStudioLlmEvidenceLoopInput, AutomationStudioLlmEvidenceToolExecutionResult } from "../../../../../llm/evidence-loop.ts";
import { AutomationStudioLlmBuildPurse } from "../../../../../llm/build-purse/index.ts";
import { automationStudioLlmEvidenceRetriesLater } from "../../../../../llm/repeat-guard/index.ts";
import { createAutomationStudioProjectDispatcher, type AutomationStudioProjectBuilderPorts, type AutomationStudioProjectDispatchPort } from "../../../../dispatch/index.ts";
import { doneOutcome } from "../../../../dispatch/tests/dispatch-fixture.ts";
import { StubHost } from "../../../../host-resources/tests/stub-host.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_GUIDANCE as GUIDANCE, AUTOMATION_STUDIO_PROJECT_SUPERVISOR_TOOL_IDS as IDS } from "../../../index.ts";
import { BUILD, planInput, project, subflow, taskSpecInput } from "../../supervisor-fixture.ts";
import { FIND, NOTE, brief, call, dispatch, end, supervise } from "../../supervisor-script.ts";

const REPEAT_REFUSED = "llm_evidence_loop.repeat_refused";
/** Two subflows neither of which starts from the other. */
const PLAN = planInput([subflow("find_titles", ["p1"]), subflow("note_shelf", ["p2"])], taskSpecInput([["p1", FIND, []], ["p2", NOTE, []]]));
const TOLD = "The dispatch failed and the build record could not hold it.";
const FAILING = dispatch([brief("find_titles", ["p1"])]);
const look = (n: number) => call("web.page.read", { look: n });
const onThePage: AutomationStudioLlmEvidenceLoopInput["executeTool"] = async () => ({ kind: "llm_evidence_tool_execution", evidence: { ok: true, shown: "the catalogue" }, effectApplied: false, targetsUnchanged: true, stateDigests: { before: "page.one", after: "page.one" } });
const answersOf = (shown: ReadonlyArray<{ toolId: string; value: unknown }>, toolId: string) => shown.filter((entry) => entry.toolId === toolId).map((entry) => entry.value as JsonObject);
const repeats = (shown: ReadonlyArray<{ value: unknown }>) => shown.filter((entry) => (entry.value as JsonObject | null)?.code === REPEAT_REFUSED);

/** The fixture's build with the real dispatcher as its port, over the same record, whose writes fail where `fails` says. */
function realDispatcher(fails: { allowanceOf?: string; returnOf?: string }) {
  const built = project();
  const cancellation = new AutomationStudioBuildCancellation();
  const builders: string[] = [];
  const dispatcher = createAutomationStudioProjectDispatcher({
    record: {
      ref: BUILD,
      store: {
        read: (ref) => built.record.read(ref),
        recordAllowance: async (ref, entry) => {
          if (entry.briefId === fails.allowanceOf) throw new Error("The build record could not be written.");
          await built.record.recordAllowance(ref, entry);
        },
        recordReturn: async (ref, returned) => {
          if ((returned as { briefId?: unknown }).briefId === fails.returnOf) throw new Error("The build record could not be written.");
          return await built.record.recordReturn(ref, returned);
        }
      }
    },
    purse: new AutomationStudioLlmBuildPurse({ ceilingUsd: 1 }),
    cancellation,
    host: new StubHost({ capacity: 1 }),
    ledger: built.ledger,
    ports: {
      builder: () => ({ loop: { tools: [], decide: async () => ({ kind: "complete", result: {} }), executeTool: async () => ({ ok: true }) }, submission: {} as unknown as AutomationStudioProjectBuilderPorts["submission"], deniedEvidenceKeys: [] }),
      reset: () => { throw new Error("no reset ports in this test"); }
    },
    runBuilder: async (input) => {
      builders.push(input.scope.briefId);
      return doneOutcome(input);
    }
  });
  const port: AutomationStudioProjectDispatchPort = async (request) => {
    let result: Awaited<ReturnType<AutomationStudioProjectDispatchPort>> | undefined;
    await cancellation.run(BUILD.projectId, BUILD.flowId, async () => {
      result = await dispatcher(request);
    }).catch((error: unknown) => {
      if (!result) throw error;
    });
    return result!;
  };
  return { ...built, ports: { ...built.ports, dispatch: port }, builders };
}

/** Keeps each `project.dispatch` execution result as the loop is handed it. */
function dispatchResults() {
  const results: AutomationStudioLlmEvidenceToolExecutionResult[] = [];
  const observe = (loop: AutomationStudioLlmEvidenceLoopInput): AutomationStudioLlmEvidenceLoopInput => ({
    ...loop,
    executeTool: async (call) => {
      const result = await loop.executeTool(call);
      if (call.toolId === IDS.dispatch) results.push(result as AutomationStudioLlmEvidenceToolExecutionResult);
      return result;
    }
  });
  return { results, observe };
}

describe("project.dispatch_failed", () => {
  it("with no builder started says nothing was applied and the target is unchanged, and the build may end on it", async () => {
    const built = realDispatcher({ allowanceOf: "brief-1" });
    const { results, observe } = dispatchResults();
    const run = await supervise([look(1), call(IDS.writePlan, PLAN), FAILING, end("blocked", TOLD)], built, { executeTool: onThePage, observe, spareTurns: 2 });
    expect(built.builders).toEqual([]);
    expect(results[0]).toMatchObject({ effectApplied: false, targetsUnchanged: true, resultCode: "project.dispatch_failed" });
    expect(results[0]).not.toHaveProperty("failure");
    expect(answersOf(run.shown, IDS.dispatch)[0]).toEqual({ ok: false, code: "project.dispatch_failed", instruction: GUIDANCE.refusals.dispatchFailed, briefIds: ["brief-1"] });
    expect(GUIDANCE.refusals.dispatchFailed).toMatch(/no builder was started/iu);
    // Told to end honestly, it can: a refused ending would ask the script for a decision it does not have.
    expect(run.outcome.ending?.reason).toContain(TOLD);
  });

  describe("with a builder started", () => {
    it("claims neither an unchanged target nor nothing applied, and carries the uncertain effect as a typed fact", async () => {
      const built = realDispatcher({ returnOf: "brief-1" });
      const { results, observe } = dispatchResults();
      const run = await supervise([look(1), call(IDS.writePlan, PLAN), FAILING, end("blocked", TOLD)], built, { executeTool: onThePage, observe, spareTurns: 2 });
      expect(built.builders).toEqual(["brief-1"]);
      const result = results[0]!;
      expect(result).toMatchObject({
        effectApplied: true, targetsUnchanged: false, resultCode: "project.dispatch_failed",
        failure: { stage: "execution", category: "ambiguous_or_unknown", effect: "ambiguous", code: "project.dispatch_failed", retryable: false }
      });
      expect(result).not.toHaveProperty("ownRetestBound");
      expect(result).not.toHaveProperty("resultReason");
      // As the loop reads it: the failure is a valid record, and no temporary failure to run again.
      expect(projectAutomationStudioFailureControlRecord(result.failure)).toMatchObject({ effect: "ambiguous", retryable: false });
      expect(automationStudioLlmEvidenceRetriesLater(result)).toBe(false);
      expect(answersOf(run.shown, IDS.dispatch)[0]).toMatchObject({ ok: false, code: "project.dispatch_failed", instruction: GUIDANCE.refusals.dispatchFailedBuildersRan, briefIds: ["brief-1"], started: ["brief-1"], leftOnTarget: [] });
      expect(GUIDANCE.refusals.dispatchFailedBuildersRan).toMatch(/uncertain/iu);
      expect(GUIDANCE.refusals.dispatchFailedBuildersRan).not.toMatch(/try again/iu);
      expect(run.outcome.ending?.reason).toContain(TOLD);
    });

    it("names only the builders that started", async () => {
      const built = realDispatcher({ allowanceOf: "brief-2", returnOf: "brief-1" });
      const { results, observe } = dispatchResults();
      const run = await supervise([look(1), call(IDS.writePlan, PLAN), dispatch([brief("find_titles", ["p1"]), brief("note_shelf", ["p2"])]), end("blocked")], built, { executeTool: onThePage, observe });
      expect(built.builders).toEqual(["brief-1"]);
      expect(results[0]).toMatchObject({ effectApplied: true, targetsUnchanged: false });
      expect(answersOf(run.shown, IDS.dispatch)[0]).toMatchObject({ briefIds: ["brief-1", "brief-2"], started: ["brief-1"] });
    });

    it("is not exempt from the guard: the identical call is refused unrun on the same build, and stalls the round", async () => {
      const built = realDispatcher({ returnOf: "brief-1" });
      const run = await supervise([look(1), call(IDS.writePlan, PLAN), FAILING, FAILING, look(2), FAILING, end("blocked")], built, { executeTool: onThePage });
      expect(built.builders).toEqual(["brief-1"]);
      expect(repeats(run.shown)).toHaveLength(2);
      const stalling = realDispatcher({ returnOf: "brief-1" });
      await expect(supervise([look(1), call(IDS.writePlan, PLAN), FAILING, FAILING, FAILING, FAILING, FAILING, FAILING, FAILING], stalling, { executeTool: onThePage, propagateDecisionErrors: true })).rejects.toThrow("stalled");
      expect(stalling.builders).toEqual(["brief-1"]);
    });

    it("is not retried blindly: once other returns moved the build past the guard, Core still does not send the same brief again", async () => {
      const built = realDispatcher({ returnOf: "brief-1" });
      const run = await supervise([look(1), call(IDS.writePlan, PLAN), FAILING, dispatch([brief("note_shelf", ["p2"])]), FAILING, end("blocked")], built, { executeTool: onThePage });
      expect(repeats(run.shown)).toEqual([]);
      expect(built.builders).toEqual(["brief-1", "brief-2"]);
      const answers = answersOf(run.shown, IDS.dispatch);
      expect(answers[2]).toMatchObject({ ok: false, code: "project.brief_repeated", repeated: [{ subflowKey: "find_titles", lastBrief: { briefId: "brief-1", outcome: "blocked", reason: GUIDANCE.refusals.dispatchFailedBuilderReturn } }] });
    });

    it("counts every brief as started when the record cannot say", async () => {
      const built = project();
      const read = vi.spyOn(built.record, "read");
      const port: AutomationStudioProjectDispatchPort = async () => {
        read.mockRejectedValueOnce(new Error("The build record could not be read."));
        throw new Error("The build record could not be read.");
      };
      const { results, observe } = dispatchResults();
      const run = await supervise([look(1), call(IDS.writePlan, PLAN), FAILING, end("blocked")], { ...built, ports: { ...built.ports, dispatch: port } }, { executeTool: onThePage, observe });
      expect(results[0]).toMatchObject({ effectApplied: true, targetsUnchanged: false, failure: { effect: "ambiguous" } });
      expect(answersOf(run.shown, IDS.dispatch)[0]).toMatchObject({ started: ["brief-1"] });
    });
  });
});
