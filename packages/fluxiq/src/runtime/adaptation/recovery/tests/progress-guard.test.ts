import { describe, expect, it } from "vitest";
import {
  AUTOMATION_STUDIO_EXPLORATION_DEFAULT_MAX_STEPS_WITHOUT_PROGRESS,
  AUTOMATION_STUDIO_EXPLORATION_NO_PROGRESS_REASONS,
  AutomationStudioExplorationProgressGuard,
  automationStudioExplorationEvidenceDigest,
  type AutomationStudioExplorationProgressStep
} from "../progress-guard.ts";

// The guard that makes removing the call caps safe. Its whole contract is two
// sentences: a loop that keeps bringing back something new is never stopped by
// it, however long it runs, and a loop that has stopped doing so is stopped
// after a short streak, with the reason it was going nowhere.
describe("AutomationStudioExplorationProgressGuard", () => {
  it("never stalls a loop whose every step brings back something new", () => {
    const guard = new AutomationStudioExplorationProgressGuard({ maxStepsWithoutProgress: 3 });

    for (let index = 0; index < 200; index += 1) {
      expect(guard.record(step(`inspect.${index}`, `evidence.${index}`))).toEqual({ advanced: true });
    }
    expect(guard.stepsWithoutProgress).toBe(0);
    expect(guard.reason).toBeUndefined();
  });

  it.each([
    ["the same request again", [step("inspect.a", "one"), step("inspect.a", "two"), step("inspect.a", "three"), step("inspect.a", "four")], "repeated_request"],
    ["new requests returning an answer it already has", [step("inspect.a", "same"), step("inspect.b", "same"), step("inspect.c", "same"), step("inspect.d", "same")], "repeated_evidence"],
    ["steps that return nothing", [step("inspect.a", "one"), step("inspect.b", ""), step("inspect.c", ""), step("inspect.d", "")], "no_new_evidence"],
    ["steps that are refused", [step("inspect.a", "one"), refused("inspect.b"), refused("inspect.c"), refused("inspect.d")], "no_new_evidence"]
  ] as const)("stalls on %s, after exactly the configured streak, and says why", (_label, steps, reason) => {
    const guard = new AutomationStudioExplorationProgressGuard({ maxStepsWithoutProgress: 3 });
    const [first, ...rest] = steps;

    expect(guard.record(first)).toEqual({ advanced: true });
    const verdicts = rest.map((item) => guard.record(item));

    expect(verdicts).toEqual([
      { advanced: false, reason, stalled: false },
      { advanced: false, reason, stalled: false },
      { advanced: false, reason, stalled: true }
    ]);
    expect(guard.reason).toBe(reason);
    expect(guard.stepsWithoutProgress).toBe(3);
  });

  // "Asked again" explains more than "came back empty", so a repeated request
  // that also returned nothing is reported as the repeat.
  it("names a repeated request as the repeat even when its answer was also empty", () => {
    const guard = new AutomationStudioExplorationProgressGuard({ maxStepsWithoutProgress: 3 });

    guard.record(step("inspect.a", "one"));
    expect(guard.record(step("inspect.a", ""))).toMatchObject({ advanced: false, reason: "repeated_request" });
  });

  it("resets the streak the moment a step advances", () => {
    const guard = new AutomationStudioExplorationProgressGuard({ maxStepsWithoutProgress: 3 });

    guard.record(step("a", "one"));
    guard.record(step("b", "one"));
    guard.record(step("c", "one"));
    expect(guard.stepsWithoutProgress).toBe(2);
    expect(guard.record(step("d", "two"))).toEqual({ advanced: true });
    expect(guard.stepsWithoutProgress).toBe(0);
    expect(guard.reason).toBeUndefined();
  });

  it("treats a nonsensical limit as the default rather than as no limit", () => {
    const guard = new AutomationStudioExplorationProgressGuard({ maxStepsWithoutProgress: Number.NaN });
    const verdicts = Array.from({ length: AUTOMATION_STUDIO_EXPLORATION_DEFAULT_MAX_STEPS_WITHOUT_PROGRESS + 1 }, () => guard.record(step("same", "same")));

    expect(verdicts.at(-1)).toMatchObject({ advanced: false, stalled: true });
    expect(new AutomationStudioExplorationProgressGuard({ maxStepsWithoutProgress: 0 }).record(step("x", ""))).toMatchObject({ stalled: true });
  });

  it("has four distinct reasons", () => {
    expect([...AUTOMATION_STUDIO_EXPLORATION_NO_PROGRESS_REASONS]).toEqual(["repeated_request", "repeated_evidence", "no_new_evidence", "unusable_decision"]);
  });

  // A reply that could not be used is a step that did nothing. Three in a row
  // stall the loop, and say that it was the answers that were unusable.
  it("stalls on decisions that keep coming back unusable, after exactly the configured streak", () => {
    const guard = new AutomationStudioExplorationProgressGuard({ maxStepsWithoutProgress: 3 });

    expect(guard.record(step("inspect.a", "one"))).toEqual({ advanced: true });
    expect([guard.recordUnusableDecision(), guard.recordUnusableDecision(), guard.recordUnusableDecision()]).toEqual([
      { advanced: false, reason: "unusable_decision", stalled: false },
      { advanced: false, reason: "unusable_decision", stalled: false },
      { advanced: false, reason: "unusable_decision", stalled: true }
    ]);
    expect(guard.reason).toBe("unusable_decision");
  });

  // One bad reply between steps that work is ordinary, and it asked for
  // nothing, so the step after it is judged on its own and is not a repeat.
  it("lets an unusable decision between productive steps pass, without recording a request", () => {
    const guard = new AutomationStudioExplorationProgressGuard({ maxStepsWithoutProgress: 2 });

    for (let index = 0; index < 20; index += 1) {
      expect(guard.recordUnusableDecision()).toMatchObject({ stalled: false });
      expect(guard.record(step(`inspect.${index}`, `evidence.${index}`))).toEqual({ advanced: true });
    }
    expect(guard.stepsWithoutProgress).toBe(0);
  });

  // It shares the streak with barren actions rather than keeping its own.
  it("counts an unusable decision in the same streak as a barren action", () => {
    const guard = new AutomationStudioExplorationProgressGuard({ maxStepsWithoutProgress: 3 });

    guard.record(step("inspect.a", "one"));
    guard.record(step("inspect.b", ""));
    guard.recordUnusableDecision();
    expect(guard.record(step("inspect.c", ""))).toEqual({ advanced: false, reason: "no_new_evidence", stalled: true });
  });
});

describe("automationStudioExplorationEvidenceDigest", () => {
  it("is stable for equal text and different for different text", () => {
    expect(automationStudioExplorationEvidenceDigest("{\"a\":1}")).toBe(automationStudioExplorationEvidenceDigest("{\"a\":1}"));
    expect(automationStudioExplorationEvidenceDigest("{\"a\":1}")).not.toBe(automationStudioExplorationEvidenceDigest("{\"a\":2}"));
    expect(automationStudioExplorationEvidenceDigest("")).toBe("0:811c9dc5");
  });
});

function step(signature: string, evidence: string): AutomationStudioExplorationProgressStep {
  return { signature, evidenceDigest: automationStudioExplorationEvidenceDigest(evidence), evidenceBytes: evidence.length, refused: false };
}

function refused(signature: string): AutomationStudioExplorationProgressStep {
  return { signature, evidenceDigest: automationStudioExplorationEvidenceDigest("{\"ok\":false}"), evidenceBytes: 12, refused: true };
}
