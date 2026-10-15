// A brief's own permission or person-needed ending (t551): the dispatcher
// joins it to the loop's signal, so the builder's loop stops at its next turn
// rather than asking the model again, and the brief comes back blocked with
// the ending's reason. A build stop is still a stop.
import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioSiteResetNamedAct } from "../../../flow-bootstrap/site-reset/index.ts";
import { AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID, runAutomationStudioSubflowBuilderLoop, type AutomationStudioSubflowBuilderOutcome } from "../../../flow-bootstrap/subflow-candidate/index.ts";
import { OPEN, callPart, part, script, testSubmission } from "../../../flow-bootstrap/subflow-candidate/tests/subflow-fixture.ts";
import type { AutomationStudioProjectBriefEnding, AutomationStudioProjectBuilderPorts, AutomationStudioProjectResetPorts } from "../index.ts";
import { gardenBrief, gardenBuild, proposalFor, untilAborted } from "./dispatch-fixture.ts";

const DECLINED = "A step of this subflow needs the person's permission to delete on \"Remove packet\", and the person did not give it (request permission-request:1), so the brief stopped.";

/** A brief ending a test fires by hand, as a brief's gate fires its own. */
function ending(reason = DECLINED): AutomationStudioProjectBriefEnding & { fire(): void } {
  const controller = new AbortController();
  return { signal: controller.signal, reason: () => (controller.signal.aborted ? reason : undefined), fire: () => controller.abort() };
}

const builderPorts = (ended: AutomationStudioProjectBriefEnding, decide: AutomationStudioProjectBuilderPorts["loop"]["decide"]): AutomationStudioProjectBuilderPorts => ({
  loop: {
    tools: [], maxToolCalls: 6,
    unusableDecisions: { maxConsecutive: 3, maxInARow: 3, stalled: () => new Error("stalled") },
    executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: false, targetsUnchanged: true }),
    decide
  },
  submission: testSubmission(),
  ended,
  deniedEvidenceKeys: []
});

const resetBrief = () => gardenBrief("b-reset", "list_seeds", [], (value) => Object.assign(value, { kind: "reset", parts: [], maxIterations: 3 }));

/** A reset whose one decision fires its ending and then completes, with `left` still to undo. */
const resetPorts = (ended: AutomationStudioProjectBriefEnding & { fire(): void }, left: AutomationStudioSiteResetNamedAct[]): AutomationStudioProjectResetPorts => ({
  loop: {
    tools: [{ toolId: "site.undo", description: "Undo one act", effect: "mutate", inputSchema: { type: "object" } }],
    unusableDecisions: { maxConsecutive: 2, maxInARow: 2, stalled: () => new Error("the reset stalled") },
    executeTool: async () => ({ ok: true }),
    decide: async () => {
      ended.fire();
      return { kind: "complete", result: { summary: "done" } };
    }
  },
  remainingActs: async () => left,
  ended
});

describe("a brief's own ending", () => {
  it("stops the real builder loop at its next turn and comes back blocked with the reason, naming the proposal it had", async () => {
    const ended = ending();
    let decisions = 0;
    const decide: AutomationStudioProjectBuilderPorts["loop"]["decide"] = async () => {
      decisions += 1;
      if (decisions === 1) return { kind: "tool_call", toolId: AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID, callId: "submit", input: script([...OPEN, ...callPart(), ...part()]) as JsonObject };
      // The person declines a step of the Flow, as the gate learns inside the submission's check: the loop cannot see it.
      ended.fire();
      return { kind: "tool_call", toolId: AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID, callId: "submit.again", input: script([...OPEN, ...callPart(), ...part()]) as JsonObject };
    };
    const build = await gardenBuild({ capacity: 1, briefs: [gardenBrief("b-read", "list_seeds")], ports: { builder: () => builderPorts(ended, decide) } });
    build.dispatcherInput.runBuilder = runAutomationStudioSubflowBuilderLoop;
    const { returns } = await build.run();
    expect(returns[0]).toMatchObject({ briefId: "b-read", outcome: "blocked", reason: DECLINED, proposal: { subflowKey: "list_seeds", revision: 1 } });
    // Asked twice, never a third time: the loop stopped on the ending, not on a stall or its iteration bound.
    expect(decisions).toBe(2);
    expect((await build.store.read(build.dispatcherInput.record.ref))!.returns[0]!.builderReturn).toEqual(returns[0]);
  });

  it("hands the builder a loop and a submission signal that abort with the ending, and blocks a loop that then returns", async () => {
    const ended = ending("The site showed a check only a person can pass, and it was not passed (person_needed.stopped), so the brief stopped.");
    const signals: AbortSignal[] = [];
    const build = await gardenBuild({
      capacity: 1, briefs: [gardenBrief("b-read", "list_seeds")],
      ports: { builder: () => builderPorts(ended, async () => ({ kind: "complete", result: {} })) },
      scripts: { "b-read": async (input) => {
        signals.push(input.loop.signal!, input.submission.signal!);
        ended.fire();
        const outcome: AutomationStudioSubflowBuilderOutcome = { loop: { ok: false, code: "llm_evidence_loop.aborted", trace: [], steps: [], accounting: {} } as unknown as AutomationStudioSubflowBuilderOutcome["loop"], proposal: undefined, trial: undefined, promotionAllowed: false };
        return outcome;
      } }
    });
    const { returns } = await build.run();
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    expect(returns[0]).toMatchObject({ outcome: "blocked", reason: "The site showed a check only a person can pass, and it was not passed (person_needed.stopped), so the brief stopped." });
    expect(returns[0]).not.toHaveProperty("proposal");
  });

  it("blocks a reset whose own ending fired while acts of the build are still in place, and names its reason", async () => {
    const ended = ending();
    const build = await gardenBuild({ capacity: 1, briefs: [resetBrief()], ports: { reset: () => resetPorts(ended, [{ act: "act-1", did: "press \"Add to planting list\" button" }]) } });
    const { returns } = await build.run();
    expect(returns[0]).toMatchObject({ briefId: "b-reset", outcome: "blocked", reason: DECLINED });
  });

  it("ends a reset done when its ending fired but nothing of the build is left in place", async () => {
    const ended = ending();
    const build = await gardenBuild({ capacity: 1, briefs: [resetBrief()], ports: { reset: () => resetPorts(ended, []) } });
    const { returns } = await build.run();
    expect(returns[0]).toMatchObject({ briefId: "b-reset", outcome: "done", reason: "Every lasting act this build made is undone; the site is as the build found it." });
    expect(returns[0]).not.toHaveProperty("proposal");
  });

  it("leaves a build stop a stop: the ending that never fired is not the reason", async () => {
    const ended = ending();
    const build = await gardenBuild({
      capacity: 1, briefs: [gardenBrief("b-read", "list_seeds")],
      ports: { builder: () => builderPorts(ended, async () => ({ kind: "complete", result: {} })) },
      scripts: { "b-read": async (input) => {
        input.accepted?.(proposalFor(input));
        return await untilAborted(input.loop.signal!);
      } }
    });
    const dispatched = build.run();
    await vi.waitFor(() => expect(build.events).toEqual(["start b-read"]));
    build.cancellation.cancel(build.dispatcherInput.record.ref.projectId, build.dispatcherInput.record.ref.flowId);
    const { returns } = await dispatched;
    expect(returns[0]).toMatchObject({ outcome: "partial", reason: "The build was stopped before this brief finished." });
  });
});
