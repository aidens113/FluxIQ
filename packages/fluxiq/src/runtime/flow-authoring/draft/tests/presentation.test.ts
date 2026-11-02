import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import {
  automationStudioFlowDraftEntry,
  automationStudioFlowDraftFullRunRequiredFeedback,
  automationStudioFlowDraftDryRunFeedback,
  automationStudioFlowDraftDryRunVerdict,
  automationStudioFlowDraftExcusedWords,
  type AutomationStudioFlowDraftStep,
  type AutomationStudioFlowDraftReplayOutcome,
  type DraftPresentation
} from "../index.ts";

const step = (over: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep => ({
  position: 1, id: "d1", iteration: 1, callId: "call.1", actionId: "fixture.act",
  input: { node: "fixture.act", parameters: { text: "shown" } },
  effect: "mutate", effectApplied: true, disposition: "kept", ...over
});

function presentation() {
  return {
    entryInstruction: vi.fn<DraftPresentation["entryInstruction"]>(() => "neutral entry"),
    fullRunRequired: vi.fn<DraftPresentation["fullRunRequired"]>(({ nothingRan }) => nothingRan ? "nothing ran" : "run the complete plan"),
    dryRunInstruction: vi.fn<DraftPresentation["dryRunInstruction"]>(() => "neutral replay"),
    excused: vi.fn<DraftPresentation["excused"]>(({ reason, status }) => `${reason}:${status}`),
    missingPredecessors: vi.fn<DraftPresentation["missingPredecessors"]>(({ steps, targetStep }) => `${steps.join(",")} before ${targetStep}`),
    withdrawal: vi.fn<DraftPresentation["withdrawal"]>(() => "withdrawn")
  };
}

describe("draft projection with explicit neutral presentation", () => {
  it("passes bounded feature facts without private arguments or execution proofs", () => {
    const words = presentation();
    const original = step({ ranWith: { private: "not-shown" }, stateBefore: "private-before", stateAfter: "private-after" });
    const candidate = step({
      effectApplied: false,
      checkedCandidate: { callId: "checked", code: "core.replay.present" },
      priorExecution: { ...original, lasting: true },
      settings: { retries: 3 }, acts: ["a1"], places: ["r1"]
    });
    const result = automationStudioFlowDraftEntry({ steps: [candidate], authored: true, route: { state: "named", quote: "first place", places: ["first place"] } }, words);
    expect(words.entryInstruction).toHaveBeenCalledWith({ mode: "authored", hasBindable: false, routeKind: "named", hasReplaced: false, hasChecked: true });
    expect(words.entryInstruction).toHaveBeenCalledOnce();
    expect(result?.value).toMatchObject({
      code: "llm_evidence_loop.draft", instruction: "neutral entry",
      route: { named: "first place", places: { r1: "first place" } },
      steps: [{ step: 1, changed: "no", inResult: true, checkedCandidate: { performed: false }, priorExecution: { callId: "call.1", performed: true, configuration: "original" }, settings: { retries: 3 }, act: "a1", place: "r1" }]
    });
    expect(JSON.stringify(result)).not.toContain("private-");
    expect(candidate.priorExecution?.lasting).toBe(true);
  });

  it("retains every step and complete argument with caller-supplied text", () => {
    const words = presentation();
    const steps = Array.from({ length: 200 }, (_, index) => step({ position: index + 1, id: `d${index + 1}`, input: { payload: "v".repeat(2_000) } }));
    const result = automationStudioFlowDraftEntry({ steps }, words);
    const value = result?.value;
    expect(value).toMatchObject({ instruction: "neutral entry" });
    expect(typeof value === "object" && value !== null && !Array.isArray(value) ? value.steps : undefined).toEqual(steps.map((current) => ({
      step: current.position, actionId: current.actionId, input: current.input, changed: "yes", disposition: "kept", inResult: true
    })));
    expect(Buffer.byteLength(JSON.stringify(result))).toBeGreaterThan(400_000);
    expect(words.entryInstruction).toHaveBeenCalledOnce();
  });

  it("describes withdrawal using only its verified position and toggle facts", () => {
    const words = presentation();
    const steps = [
      step({ disposition: "dropped", cancels: "d2" }),
      step({ position: 2, id: "d2", disposition: "dropped", cancels: "d1", toggle: { key: "private-control", to: "off" } })
    ];
    const result = automationStudioFlowDraftEntry({ steps }, words);
    expect(words.withdrawal).toHaveBeenNthCalledWith(1, { kind: "paired_first", partner: 2, first: 1, later: 2, previouslyChosen: false });
    expect(words.withdrawal).toHaveBeenNthCalledWith(2, { kind: "paired_later", partner: 1, first: 1, later: 2, previouslyChosen: false });
    expect(result?.value).toMatchObject({ steps: [{ out: "withdrawn" }, { out: "withdrawn" }] });
    expect(JSON.stringify(words.withdrawal.mock.calls)).not.toContain("private-control");
  });

  it("lets a second composer supply its own instruction without changing projection", () => {
    const first = presentation();
    const second: DraftPresentation = { ...first, entryInstruction: () => "another domain" };
    const input = { steps: [step()] };
    const a = automationStudioFlowDraftEntry(input, first)?.value;
    const b = automationStudioFlowDraftEntry(input, second)?.value;
    expect(a).toMatchObject({ instruction: "neutral entry" });
    expect(b).toMatchObject({ instruction: "another domain" });
    const data = (value: unknown): unknown => {
      if (typeof value !== "object" || value === null || Array.isArray(value) || !("instruction" in value)) return value;
      const { instruction: _instruction, ...projection } = value;
      return projection;
    };
    expect(data(a)).toEqual(data(b));
    expect(automationStudioFlowDraftEntry({ steps: [] }, first)).toBeUndefined();
    expect(first.entryInstruction).toHaveBeenCalledOnce();
  });

  it("retains every unrunnable reason and supplies only the required presentation facts", () => {
    const words = presentation();
    const reasons: Parameters<typeof automationStudioFlowDraftFullRunRequiredFeedback>[0] = [
      { position: 1, actionId: "fixture.act", word: "not_run_in_this_build" },
      { position: 2, actionId: "fixture.act", word: "cannot_run_again" },
      { position: 3, actionId: "fixture.act", word: "not_a_library_step" },
      { position: 4, actionId: "fixture.act", word: "not_reached" }
    ];
    const feedback = automationStudioFlowDraftFullRunRequiredFeedback(reasons, words);
    expect(feedback).toEqual({ ok: false, code: "llm_evidence_loop.full_run_required", steps: reasons.map((current) => ({ step: current.position, actionId: current.actionId, replayed: current.word })), instruction: "run the complete plan" });
    expect(words.fullRunRequired).toHaveBeenLastCalledWith({ nothingRan: false });
    expect(automationStudioFlowDraftFullRunRequiredFeedback([], words).instruction).toBe("nothing ran");
    expect(words.fullRunRequired).toHaveBeenLastCalledWith({ nothingRan: true });
  });

  it("keeps replay metadata while presenting narrow excuse and predecessor facts", () => {
    const words = presentation();
    const outcomes: AutomationStudioFlowDraftReplayOutcome[] = [
      { step: 1, actionId: "fixture.act", status: "failed", excused: "withheld", withheldBy: 7, resultCode: "fixture.failed", reanchored: true },
      { step: 2, actionId: "fixture.act", status: "unreproducible" }
    ];
    const steps = [step({ disposition: "taken", stateBefore: "before", stateAfter: "between" }), step({ position: 2, id: "d2", iteration: 2, stateBefore: "between" })];
    const verdict = automationStudioFlowDraftDryRunVerdict({ attempt: 3, reset: "ok", outcomes });
    const feedback = automationStudioFlowDraftDryRunFeedback(verdict, words, new Set(), steps);
    expect(feedback.instruction).toBe("neutral replay");
    expect(feedback.notInFlow).toBe("1 before 2");
    expect(words.missingPredecessors).toHaveBeenCalledWith({ steps: [1], targetStep: 2 });
    expect(words.missingPredecessors).toHaveBeenCalledOnce();
    expect(words.excused).toHaveBeenCalledWith({ reason: "withheld", status: "failed", withheldBy: 7 });
    expect(words.excused).toHaveBeenCalledOnce();
    expect(feedback.steps).toEqual([
      { step: 1, actionId: "fixture.act", replayed: "failed", resultCode: "fixture.failed", afterWithheld: 7, excused: "withheld:failed", reanchored: true },
      { step: 2, actionId: "fixture.act", replayed: "unreproducible" }
    ] satisfies JsonObject[]);
    expect(automationStudioFlowDraftExcusedWords({ step: 1, actionId: "fixture.act", status: "replayed", excused: "optional" }, words)).toBeUndefined();
    expect(words.excused).toHaveBeenCalledOnce();
  });
});
