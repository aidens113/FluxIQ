import { describe, expect, it } from "vitest";
import { runAutomationStudioLlmHarness } from "../../harness.ts";
import {
  AUTOMATION_STUDIO_LOOP_STAGES,
  automationStudioLoopStageIndex,
  automationStudioLoopStageTransition,
  isAutomationStudioLoopStage
} from "../protocol.ts";

const provider = {
  metadata: { provider: "mock" as const, model: "stage-protocol" },
  runTask: async () => ({ response: { kind: "diagnosis" as const, summary: "A bounded diagnosis." } })
};

function staged(stage: unknown, previousStage?: unknown) {
  return runAutomationStudioLlmHarness({
    taskKind: "loop_plan",
    projectId: "project.one",
    flowId: "flow.one",
    instructions: [],
    provider,
    stage: stage as never,
    ...(previousStage === undefined ? {} : { previousStage: previousStage as never })
  });
}

describe("Automation Studio loop stage order", () => {
  it("is the five stages of the protocol, in order, and cannot be rewritten in place", () => {
    expect([...AUTOMATION_STUDIO_LOOP_STAGES]).toEqual(["gather", "plan", "implement", "iterate", "verify"]);
    expect(AUTOMATION_STUDIO_LOOP_STAGES.map(automationStudioLoopStageIndex)).toEqual([0, 1, 2, 3, 4]);
    expect(Object.isFrozen(AUTOMATION_STUDIO_LOOP_STAGES)).toBe(true);
    // A consumer holding the array holds Core's ordering authority. Sorting or
    // splicing it would rewrite the protocol for every caller in the process,
    // so the array refuses rather than silently accepting the write.
    expect(() => (AUTOMATION_STUDIO_LOOP_STAGES as unknown as string[]).reverse()).toThrow(TypeError);
    expect(() => (AUTOMATION_STUDIO_LOOP_STAGES as unknown as string[]).push("deploy")).toThrow(TypeError);
    expect([...AUTOMATION_STUDIO_LOOP_STAGES]).toEqual(["gather", "plan", "implement", "iterate", "verify"]);
    expect(isAutomationStudioLoopStage("review")).toBe(false);
    expect(isAutomationStudioLoopStage("gather")).toBe(true);
  });

  it("starts at the first stage, advances one at a time, and refuses every other move by name", () => {
    expect(automationStudioLoopStageTransition(undefined, "gather")).toEqual({ ok: true, stage: "gather" });
    expect(automationStudioLoopStageTransition(undefined, "implement")).toMatchObject({ ok: false, code: "loop_stage.must_start_at_first_stage" });

    // A stage may take as many calls as it needs.
    expect(automationStudioLoopStageTransition("gather", "gather")).toEqual({ ok: true, stage: "gather" });
    // And it advances exactly one step.
    expect(automationStudioLoopStageTransition("gather", "plan")).toEqual({ ok: true, stage: "plan" });
    expect(automationStudioLoopStageTransition("plan", "implement")).toEqual({ ok: true, stage: "implement" });

    // Skipping is the refusal that matters most: implementing without planning,
    // or verifying without implementing, is how the order erodes.
    expect(automationStudioLoopStageTransition("gather", "implement")).toMatchObject({ ok: false, code: "loop_stage.skipped_stage" });
    expect(automationStudioLoopStageTransition("gather", "verify")).toMatchObject({ ok: false, code: "loop_stage.skipped_stage" });
    expect(automationStudioLoopStageTransition("plan", "verify")).toMatchObject({ ok: false, code: "loop_stage.skipped_stage" });

    // Going back is iteration's job and nobody else's.
    expect(automationStudioLoopStageTransition("iterate", "gather")).toEqual({ ok: true, stage: "gather" });
    expect(automationStudioLoopStageTransition("iterate", "implement")).toEqual({ ok: true, stage: "implement" });
    expect(automationStudioLoopStageTransition("implement", "plan")).toMatchObject({ ok: false, code: "loop_stage.out_of_order" });
    expect(automationStudioLoopStageTransition("verify", "implement")).toMatchObject({ ok: false, code: "loop_stage.out_of_order" });

    expect(automationStudioLoopStageTransition("plan", "deploy")).toMatchObject({ ok: false, code: "loop_stage.unknown_stage" });
    expect(automationStudioLoopStageTransition("plan", undefined)).toMatchObject({ ok: false, code: "loop_stage.unknown_stage" });
  });

  it("refuses an out-of-order request before it reaches a provider, rather than after", async () => {
    // The point of enforcing it in the harness: a call that breaks the order
    // costs nothing and comes back naming the rule it broke. Enforced any later
    // and the order would be advisory, because the request would already have
    // been sent.
    let providerCalls = 0;
    const counted = { ...provider, runTask: async () => { providerCalls += 1; return { response: { kind: "diagnosis" as const, summary: "sent" } }; } };

    const skipped = await runAutomationStudioLlmHarness({
      taskKind: "loop_plan", projectId: "project.one", flowId: "flow.one", instructions: [],
      provider: counted, stage: "verify", previousStage: "gather"
    });
    expect(skipped.ok).toBe(false);
    expect(skipped.diagnostics.map((diagnostic) => diagnostic.code)).toContain("loop_stage.skipped_stage");
    expect(providerCalls).toBe(0);

    const backwards = await staged("plan", "verify");
    expect(backwards.ok).toBe(false);
    expect(backwards.diagnostics.map((diagnostic) => diagnostic.code)).toContain("loop_stage.out_of_order");

    const midProtocolStart = await staged("implement");
    expect(midProtocolStart.ok).toBe(false);
    expect(midProtocolStart.diagnostics.map((diagnostic) => diagnostic.code)).toContain("loop_stage.must_start_at_first_stage");

    // Abandoning the protocol part-way through is refused too: a call that
    // follows a stage has to say which stage it is in.
    const abandoned = await staged(undefined, "plan");
    expect(abandoned.ok).toBe(false);
    expect(abandoned.diagnostics.map((diagnostic) => diagnostic.code)).toContain("loop_stage.unknown_stage");

    // And a legal move goes through, so none of the above passes vacuously.
    const legal = await staged("implement", "plan");
    expect(legal.ok).toBe(true);
    expect(legal.request.context.stage).toBe("implement");
    expect(legal.request.promptVersion).toBe("automation-studio.loop-plan.v1+stage.implement");
  });
});
