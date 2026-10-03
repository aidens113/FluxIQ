// What a continued build's first decision is told about the build it
// continues: codes, counts and Core's own words, never page content.

import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { runAutomationStudioLlmEvidenceLoop, type AutomationStudioLlmEvidenceTool, type AutomationStudioLlmEvidenceToolExecutionResult } from "../../evidence-loop.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_RESUMED_TOOL_ID, automationStudioLlmEvidenceResumeEntry } from "../resume.ts";

function step(position: number, overrides: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep {
  return { position, iteration: position, callId: `call.${position}`, actionId: "press", input: { target: `t.${position}` }, effect: "mutate", effectApplied: true, disposition: "kept", ...overrides };
}

describe("the entry a continued build starts from", () => {
  it("names the revision, why the last build stopped, what it still owes, and the draft it proved", () => {
    const entry = automationStudioLlmEvidenceResumeEntry(
      { revision: 2, stopped: "budget", outstandingIssueCodes: ["bootstrap.cannot_answer_instruction", "dry_run.step_failed"] },
      [step(1), step(2), step(3, { effectApplied: false }), step(4, { effect: "observe" }), step(5, { disposition: "dropped" })]
    );

    expect(entry).toEqual({
      callId: `${AUTOMATION_STUDIO_LLM_EVIDENCE_RESUMED_TOOL_ID}.0`,
      toolId: "core.resumed",
      value: {
        code: "llm_evidence_loop.resumed",
        revision: 2,
        stopped: "budget",
        draftSteps: 5,
        // Kept, of the kind a result is made of, and not a failed attempt.
        proposableSteps: 2,
        outstanding: ["bootstrap.cannot_answer_instruction", "dry_run.step_failed"],
        instruction: expect.stringContaining("continues one that ran out of decisions")
      }
    });
  });

  it("opens a repair with the judgement of the Flow as it stood, and says it is a repair", () => {
    const judgement = { stopped: "iterations", test: "replay_failed", stepsThatDidNotWork: [2], stepsInFlow: 3, actsDone: 1, actsTodo: ["a1.quantity", "a2"] };
    const entry = automationStudioLlmEvidenceResumeEntry({ revision: 1, stopped: "repeat_without_progress", outstandingIssueCodes: ["llm_evidence_loop.dry_run_refused"], judgement }, [step(1)]);
    expect(entry.value).toMatchObject({
      code: "llm_evidence_loop.repair",
      stopped: "repeat_without_progress",
      judgement,
      instruction: expect.stringContaining("This is the repair of a Flow that was not finished")
    });
    // The Flow is judged on what it does, not on the checklist (t195).
    expect(entry.value.instruction).toContain("complete when the Flow does what the instruction asks");
    expect(entry.value.instruction).not.toContain("complete only when every act and choice on the checklist is done");
  });

  it("opens a repair of a Flow the judge sent back with the judge's account, the checklist as information", () => {
    const judge = { verdict: "no", expected: "two packs of napkins in the cart", observed: "the test added one pack of towels", advice: "add the napkins, twice", findings: ["step 3 pressed Add on the towels"] };
    const judgement = { stopped: "judged_wrong", test: "replayed_clean", stepsInFlow: 4, actsDone: 2, actsTodo: [], judge };
    const entry = automationStudioLlmEvidenceResumeEntry({ revision: 1, stopped: "judged_wrong", outstandingIssueCodes: [], judgement }, [step(1)]);
    expect(entry.value).toMatchObject({ code: "llm_evidence_loop.repair", stopped: "judged_wrong", judgement: { judge } });
    const instruction = entry.value.instruction as string;
    expect(instruction).toMatch(/^The Flow you said was ready was tested from its start and judged against the instruction: judgement\.judge says what it did not do \(observed\), what was asked \(expected\) and what to change \(advice\)/u);
    expect(instruction).toContain("The page is where the test left it: look first.");
    expect(instruction).toContain("The acts checklist is the build's own reading and is information, not the bar: the Flow is judged on what its test does.");
    expect(instruction).toContain("complete when the Flow does what the instruction asks");
    expect(instruction).not.toContain("every act and choice on the checklist is done");
    expect(instruction).not.toContain("carried from the earlier Flow");
  });

  it("tells a repair of a re-authored Flow to rerun live the carried steps its test never ran", () => {
    const judge = { verdict: "unknown", findings: ["steps 5 to 9 were carried and not run"], untestedCarried: [5, 6, 7, 8, 9] };
    const judgement = { stopped: "judged_wrong", test: "not_tested", stepsInFlow: 9, actsDone: 3, actsTodo: [], judge };
    const instruction = automationStudioLlmEvidenceResumeEntry({ revision: 1, stopped: "judged_wrong", outstandingIssueCodes: [], judgement }, [step(1)]).value.instruction as string;
    expect(instruction).toContain("was not judged to do what the instruction asks");
    expect(instruction).toContain("Steps 5, 6, 7, 8, 9 were carried from the earlier Flow and not run in this build: rerun them live (amend_draft rerun)");
  });

  it("tells a round after one that added nothing that nothing is in the Flow yet, and to keep exploring", () => {
    const judgement = { stopped: "unusable_decisions", test: "not_tested", stepsInFlow: 0, actsDone: 0, actsTodo: ["a1", "a2"], lastRefusedFor: ["bootstrap.instructed_act_missing"] };
    const entry = automationStudioLlmEvidenceResumeEntry({ revision: 1, stopped: "unusable_decisions", outstandingIssueCodes: ["bootstrap.instructed_act_missing"], judgement }, []);
    expect(entry.value).toMatchObject({ code: "llm_evidence_loop.explore_again", draftSteps: 0, judgement, instruction: expect.stringContaining("Nothing is in the Flow yet") });
    expect(entry.value.instruction).toContain("Keep exploring live from the page as it stands");
    expect(entry.value.instruction).not.toContain("judgement.judge");
  });

  // t195-w29: a judged Flow can leave nothing in the Flow (its plan came with the
  // reply); the round that explores again is told what the judge found.
  it("tells a round that explores again after a judge's no what the judge found", () => {
    const judge = { verdict: "no", observed: "the Flow reads no records", advice: "read the results as a table", findings: [] };
    const judgement = { stopped: "judged_wrong", test: "replayed_clean", stepsInFlow: 0, actsDone: 0, actsTodo: [], judge };
    const entry = automationStudioLlmEvidenceResumeEntry({ revision: 1, stopped: "judged_wrong", outstandingIssueCodes: [], judgement }, []);
    expect(entry.value).toMatchObject({ code: "llm_evidence_loop.explore_again", judgement: { judge } });
    expect(entry.value.instruction).toContain("Nothing is in the Flow yet");
    expect(entry.value.instruction).toContain("judgement.judge says what it did not do (observed), what was asked (expected) and what to change (advice)");
  });

  it("carries a stop for unusable decisions as it was given", () => {
    expect(automationStudioLlmEvidenceResumeEntry({ revision: 1, stopped: "unusable_decisions", outstandingIssueCodes: [] }, []).value)
      .toMatchObject({ stopped: "unusable_decisions", draftSteps: 0, proposableSteps: 0, outstanding: [] });
  });

  it("counts a revision that is not a positive whole number as the first", () => {
    for (const revision of [0, -3, 1.5, Number.NaN]) {
      expect(automationStudioLlmEvidenceResumeEntry({ revision, stopped: "iterations", outstandingIssueCodes: [] }, []).value.revision).toBe(1);
    }
  });

  it("keeps only issue codes that are codes, and every one of them", () => {
    const codes = ["ok.code", "has spaces", "<script>", "x".repeat(101), ...Array.from({ length: 20 }, (_, index) => `code.${index}`)];
    const outstanding = automationStudioLlmEvidenceResumeEntry({ revision: 1, stopped: "tool_calls", outstandingIssueCodes: codes }, []).value.outstanding as string[];

    // No count limit: all twenty-one codes, and none of the three that are not codes.
    expect(outstanding).toHaveLength(21);
    expect(outstanding[0]).toBe("ok.code");
    expect(outstanding).not.toContain("has spaces");
    expect(outstanding).not.toContain("<script>");
    expect(outstanding.every((code) => code.length <= 100)).toBe(true);
  });
});

// A continuation is still the build's live phase (user, 2026-09-30): its
// draft is not replayed from the first step before the model decides. It used
// to be, to put the page where the draft left it.
describe("a continued build", () => {
  it("replays nothing before its first decision, and is told the page is where it stands", async () => {
    const replayable = (position: number): AutomationStudioFlowDraftStep => step(position, { id: `s${position}`, toolId: "press", ranWith: { target: `t.${position}` }, proposes: true, replay: { from: { location: "https://store.test/start" } } });
    const executeTool = vi.fn(async (): Promise<AutomationStudioLlmEvidenceToolExecutionResult> => ({ kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true, resultCode: "core.replay.replayed" }));
    const decide = vi.fn().mockResolvedValue({ kind: "recorded_run_ended" });
    await runAutomationStudioLlmEvidenceLoop({
      tools: [{ toolId: "press", description: "Press.", inputSchema: { type: "object" }, effect: "mutate" }],
      decide, executeTool, maxIterations: 1, maxToolCalls: 1,
      unusableDecisions: { maxConsecutive: 1, stalled: () => new Error("stalled") },
      draft: { seed: [replayable(1), replayable(2)], resume: { revision: 1, stopped: "iterations", outstandingIssueCodes: [] } }
    });
    expect(executeTool).not.toHaveBeenCalled();
    const shown = (decide.mock.calls[0]![0] as { evidence: { toolId: string; value: { instruction?: string } }[] }).evidence;
    const resumed = shown.find((entry) => entry.toolId === AUTOMATION_STUDIO_LLM_EVIDENCE_RESUMED_TOOL_ID)!;
    expect(resumed.value.instruction).toContain("They were not run again");
  });
});

// Live run 38 (`run-muqilf9s-c3211328`, cause C3): repair round 1 resumed a
// five-step draft, opened with the free navigation to the start, and appended it
// as step 6 because the opening was always sent with `add: true`. The Flow then
// ended on the feed, off the requests page its last step left, and the refuted
// result was filed under that navigate. t195 made that opening taken, not added,
// but it still ran, so the re-author began on the feed without the requests
// link, against its own "The page is where the test left it: look first". A
// round whose draft holds the Flow (a repair's, a re-author's, seeded with no
// resume) now opens with the look on the page as it stands, carrying the Flow's
// calls under `held` so the domain keeps where the build arrived and what it was
// shown (C8). A round with nothing in the Flow has no start yet, and its opening
// is still the navigation, the Flow's first step.
describe("the opening of a round whose draft already holds the Flow", () => {
  const look: JsonObject = { node: "web.output.dom-capture", parameters: {}, consequences: [] };
  const arrival: JsonObject = { node: "web.output.browser-navigate", parameters: { url: "https://social.example/" }, consequences: [] };
  const runNode: AutomationStudioLlmEvidenceTool = {
    toolId: "core.run_node", description: "Run a node.", inputSchema: { type: "object" }, effect: "mutate", perCallEffect: true, initialObservation: { input: look, arrival }
  };
  const arrived = {
    kind: "llm_evidence_tool_execution", evidence: { ok: true, page: { url: "https://social.example/", title: "Feed" } }, effectApplied: true,
    draft: { actionId: "web.output.browser-navigate", input: arrival, effect: "mutate", proposes: true }
  };
  const kept = (position: number): AutomationStudioFlowDraftStep => step(position, { id: `d${position}`, toolId: "core.run_node", ranWith: { target: `t.${position}` }, proposes: true });
  const round = async (draft: Parameters<typeof runAutomationStudioLlmEvidenceLoop>[0]["draft"]) => {
    const executeTool = vi.fn(async (_call: { callId: string; toolId: string; value: JsonObject }) => arrived);
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools: [runNode], decide: vi.fn().mockResolvedValue({ kind: "recorded_run_ended" }), executeTool, maxIterations: 1, maxToolCalls: 2, dryRun: false,
      unusableDecisions: { maxConsecutive: 1, stalled: () => new Error("stalled") },
      ...(draft === undefined ? {} : { draft })
    });
    return { result, executeTool };
  };

  const looked = { kind: "llm_evidence_tool_execution", evidence: { ok: true, page: { url: "https://social.example/friends/requests/", title: "Requests" } }, effectApplied: false };
  const heldRound = async (draft: NonNullable<Parameters<typeof runAutomationStudioLlmEvidenceLoop>[0]["draft"]>) => {
    const executeTool = vi.fn(async (_call: { callId: string; toolId: string; value: JsonObject }) => looked);
    const decide = vi.fn().mockResolvedValue({ kind: "recorded_run_ended" });
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools: [runNode], decide, executeTool, maxIterations: 1, maxToolCalls: 2, dryRun: false,
      unusableDecisions: { maxConsecutive: 1, stalled: () => new Error("stalled") }, draft
    });
    return { result, executeTool, decide };
  };
  const flowStep = (position: number, url: string): AutomationStudioFlowDraftStep =>
    step(position, { id: `s${position}`, toolId: "core.run_node", actionId: "web.output.browser-navigate", input: { node: "web.output.browser-navigate", parameters: { url } }, proposes: true });

  it("looks at the page where the test left it, and never navigates, on a resumed five-step draft", async () => {
    const { result, executeTool, decide } = await heldRound({
      seed: [kept(1), kept(2), kept(3), kept(4), kept(5)],
      resume: { revision: 1, stopped: "judged_wrong", outstandingIssueCodes: [] }
    });

    expect(executeTool).toHaveBeenCalledTimes(1);
    const opened = executeTool.mock.calls[0]![0];
    expect(opened.callId).toBe("initial.core.run_node");
    expect(opened.value).toMatchObject(look);
    expect(opened.value.node).not.toBe(arrival.node);
    // The Flow's calls go with the look, as the steps were written; the draft is unchanged.
    expect(opened.value.held).toEqual([1, 2, 3, 4, 5].map((position) => ({ target: `t.${position}` })));
    expect(result.steps.filter((entry) => entry.disposition === "kept").map((entry) => entry.callId)).toEqual(["call.1", "call.2", "call.3", "call.4", "call.5"]);
    expect(result.steps.find((entry) => entry.callId === "initial.core.run_node")?.disposition).not.toBe("kept");
    // The model's first decision is asked with that look in front of it.
    const shown = (decide.mock.calls[0]![0] as { evidence: { callId?: string; value: unknown }[] }).evidence;
    expect(shown.find((entry) => entry.callId === "initial.core.run_node")?.value).toEqual(looked.evidence);
  });

  it("is a look carrying the Flow's own step addresses when a re-author's draft holds the Flow without resuming it", async () => {
    const { result, executeTool } = await heldRound({ seed: [flowStep(1, "https://social.example/"), kept(2), flowStep(3, "https://social.example/friends/requests/")] });

    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(executeTool.mock.calls[0]![0].value).toEqual({
      ...look,
      held: [
        { node: "web.output.browser-navigate", parameters: { url: "https://social.example/" } },
        { target: "t.2" },
        { node: "web.output.browser-navigate", parameters: { url: "https://social.example/friends/requests/" } }
      ]
    });
    expect(result.steps.filter((entry) => entry.disposition === "kept").map((entry) => entry.callId)).toEqual(["call.1", "call.2", "call.3"]);
  });

  it("goes to the start as the Flow's first step on a build's first round, as before", async () => {
    const { result, executeTool } = await round(undefined);

    expect(executeTool.mock.calls[0]![0]).toMatchObject({ callId: "initial.core.run_node", value: arrival });
    expect(executeTool.mock.calls[0]![0].value.held).toBeUndefined();
    expect(result.steps.map((entry) => [entry.callId, entry.disposition])).toEqual([["initial.core.run_node", "kept"]]);
  });

  it("is the Flow's first step on a round that seeds a draft without resuming one", async () => {
    const { result } = await round({ seed: [] });

    expect(result.steps.find((entry) => entry.callId === "initial.core.run_node")?.disposition).toBe("kept");
  });

  it("is the Flow's first step when a round resumes with nothing in the Flow", async () => {
    const { result, executeTool } = await round({ seed: [], resume: { revision: 2, stopped: "judged_wrong", outstandingIssueCodes: [], judgement: { stepsInFlow: 0 } } });

    expect(executeTool.mock.calls[0]![0].value).toEqual(arrival);
    expect(result.steps.find((entry) => entry.callId === "initial.core.run_node")?.disposition).toBe("kept");
  });

  it("carries nothing held on a look of a build told no start, whose draft holds nothing", async () => {
    const lookOnly: AutomationStudioLlmEvidenceTool = { ...runNode, initialObservation: { input: look } };
    const executeTool = vi.fn(async (_call: { callId: string; toolId: string; value: JsonObject }) => looked);
    await runAutomationStudioLlmEvidenceLoop({
      tools: [lookOnly], decide: vi.fn().mockResolvedValue({ kind: "recorded_run_ended" }), executeTool, maxIterations: 1, maxToolCalls: 2, dryRun: false,
      unusableDecisions: { maxConsecutive: 1, stalled: () => new Error("stalled") }, draft: { seed: [] }
    });

    expect(executeTool.mock.calls[0]![0].value).toEqual(look);
  });
});
