import { describe, expect, it } from "vitest";
import { reduceAutomationStudioExploration } from "../backward-slice.ts";
import { AUTOMATION_STUDIO_EXPLORATION_DROP_SENTENCE } from "../reduction.ts";
import { automationStudioExplorationStateSatisfies } from "../state-predicate.ts";
import type { AutomationStudioExplorationStep } from "../step.ts";

// The canonical case is written in the web domain's own words deliberately --
// this is a test file, where naming a click and a scroll proves Core carried
// them opaquely rather than that Core learned them. Nothing under the reducer
// itself knows any of these words; each step reaches it as a name, an effect,
// an outcome and two state digests.
//
// The digests say what a browser would say. Looking at something and scrolling
// to it leave the page as they found it. The wrong click navigates somewhere
// (S0 to S1) and going back returns exactly where it was (S1 to S0), which is
// the only thing that makes it an undo as far as the reducer is concerned. The
// correct click goes somewhere new (S0 to S2), and the wait lets the page
// settle into the state success is observed in (S2 to S3).

const PAGE_AS_FOUND = "state:list";
const WRONG_PAGE = "state:wrong-detail";
const RIGHT_PAGE = "state:right-detail";
const RIGHT_PAGE_SETTLED = "state:right-detail-loaded";

function canonicalExploration(): AutomationStudioExplorationStep[] {
  return [
    { actionId: "observe", effect: "observe", outcome: "succeeded", stateBefore: PAGE_AS_FOUND, stateAfter: PAGE_AS_FOUND },
    { actionId: "scroll", effect: "observe", outcome: "succeeded", stateBefore: PAGE_AS_FOUND, stateAfter: PAGE_AS_FOUND },
    { actionId: "click", input: { target: "wrong" }, effect: "mutate", outcome: "succeeded", stateBefore: PAGE_AS_FOUND, stateAfter: WRONG_PAGE },
    { actionId: "back", effect: "mutate", outcome: "succeeded", stateBefore: WRONG_PAGE, stateAfter: PAGE_AS_FOUND },
    { actionId: "inspect", effect: "observe", outcome: "succeeded", stateBefore: PAGE_AS_FOUND, stateAfter: PAGE_AS_FOUND },
    { actionId: "click", input: { target: "right" }, effect: "mutate", outcome: "succeeded", stateBefore: PAGE_AS_FOUND, stateAfter: RIGHT_PAGE },
    { actionId: "wait", effect: "mutate", outcome: "succeeded", stateBefore: RIGHT_PAGE, stateAfter: RIGHT_PAGE_SETTLED }
  ];
}

describe("reduceAutomationStudioExploration", () => {
  // The case from the MVP plan, and the one sentence this whole module exists
  // to make true: seven steps of wandering become the two that did the work.
  it("reduces observe, scroll, wrong click, back, inspect, correct click, wait to correct click then wait", () => {
    const reduction = reduceAutomationStudioExploration({ steps: canonicalExploration() });

    expect(reduction.actions).toEqual([
      { index: 5, actionId: "click", input: { target: "right" } },
      { index: 6, actionId: "wait" }
    ]);
    expect(reduction.exploredSteps).toBe(7);
    expect(reduction.successAt).toBe(6);
    expect(reduction.stateChainIntact).toBe(true);
  });

  // The two predicates are what make the sequence reusable rather than a list
  // of things that once happened: the state it may be applied from, and the
  // state it reaches.
  it("bounds the sequence with the state it starts from and the state success was observed in", () => {
    const reduction = reduceAutomationStudioExploration({ steps: canonicalExploration() });

    expect(reduction.inputState).toEqual({ kind: "state_digest_equals", digest: PAGE_AS_FOUND });
    expect(reduction.outputState).toEqual({ kind: "state_digest_equals", digest: RIGHT_PAGE_SETTLED });
    expect(automationStudioExplorationStateSatisfies(reduction.inputState, PAGE_AS_FOUND)).toBe(true);
    expect(automationStudioExplorationStateSatisfies(reduction.inputState, WRONG_PAGE)).toBe(false);
    expect(automationStudioExplorationStateSatisfies(reduction.outputState, RIGHT_PAGE_SETTLED)).toBe(true);
  });

  // A reduction claims most of the exploration was unnecessary, and a claim
  // like that is worth nothing unless it can be checked. Every step in scope
  // appears in one list or the other, with the reason it was left out.
  it("accounts for every step it dropped, and says which rule dropped it", () => {
    const reduction = reduceAutomationStudioExploration({ steps: canonicalExploration() });

    expect(reduction.dropped).toEqual([
      { index: 0, actionId: "observe", reason: "observation_only" },
      { index: 1, actionId: "scroll", reason: "observation_only" },
      { index: 2, actionId: "click", reason: "undone" },
      { index: 3, actionId: "back", reason: "undone" },
      { index: 4, actionId: "inspect", reason: "observation_only" }
    ]);
    expect(reduction.actions.length + reduction.dropped.length).toBe(reduction.exploredSteps);
    expect(AUTOMATION_STUDIO_EXPLORATION_DROP_SENTENCE.undone).toContain("cancel out");
  });

  // The undo rule on its own, with nothing else in the trace to explain the
  // reduction: the state came back, so the pair contributed nothing. Nothing
  // declared `back` the inverse of `click`; the digest returning is the whole
  // of the evidence.
  it("drops an action and its undo because the state returned, not because the pair was declared", () => {
    const reduction = reduceAutomationStudioExploration({
      steps: [
        { actionId: "step.one", effect: "mutate", outcome: "succeeded", stateBefore: "a", stateAfter: "b" },
        { actionId: "step.two", effect: "mutate", outcome: "succeeded", stateBefore: "b", stateAfter: "a" },
        { actionId: "step.three", effect: "mutate", outcome: "succeeded", stateBefore: "a", stateAfter: "c" }
      ]
    });

    expect(reduction.actions.map((action) => action.actionId)).toEqual(["step.three"]);
    expect(reduction.dropped.map((drop) => drop.reason)).toEqual(["undone", "undone"]);
  });

  // A longer detour, to prove the rule is not two-steps-deep pattern matching:
  // three steps out and three steps back still cancel, because the state that
  // held at the start holds again at the end of them.
  it("drops a detour of any length once the state it started from returns", () => {
    const reduction = reduceAutomationStudioExploration({
      steps: [
        { actionId: "out.one", effect: "mutate", outcome: "succeeded", stateBefore: "a", stateAfter: "b" },
        { actionId: "out.two", effect: "mutate", outcome: "succeeded", stateBefore: "b", stateAfter: "c" },
        { actionId: "out.three", effect: "mutate", outcome: "succeeded", stateBefore: "c", stateAfter: "d" },
        { actionId: "home", effect: "mutate", outcome: "succeeded", stateBefore: "d", stateAfter: "a" },
        { actionId: "fix", effect: "mutate", outcome: "succeeded", stateBefore: "a", stateAfter: "done" }
      ]
    });

    expect(reduction.actions.map((action) => action.actionId)).toEqual(["fix"]);
    expect(reduction.dropped.map((drop) => drop.reason)).toEqual(["undone", "undone", "undone", "undone"]);
  });

  // The observation rule carrying weight on its own. A state digest is rarely
  // perfectly stable -- a clock, a counter, a re-render -- so an observation
  // can look like it changed something. It cannot have, and the reducer must
  // not put it in a sequence somebody is going to replay as a fix.
  it("never keeps an observation, even when the state digest moved across it", () => {
    const reduction = reduceAutomationStudioExploration({
      steps: [
        { actionId: "read", effect: "observe", outcome: "succeeded", stateBefore: "a", stateAfter: "a.rerendered" },
        { actionId: "fix", effect: "mutate", outcome: "succeeded", stateBefore: "a.rerendered", stateAfter: "done" }
      ]
    });

    expect(reduction.actions.map((action) => action.actionId)).toEqual(["fix"]);
    expect(reduction.dropped).toEqual([{ index: 0, actionId: "read", reason: "observation_only" }]);
    // Something unreplayable sat on the chain, so the reduction says the chain
    // it was derived from is not sound rather than presenting it as certain.
    expect(reduction.stateChainIntact).toBe(false);
  });

  // The same seven steps, with the two lookups recorded as having moved the
  // digest -- which is what a page that re-renders under an observation really
  // produces. The answer must not change: an observation is still not something
  // anybody can replay as a fix, however the digest behaved across it.
  it("reduces the canonical sequence to the same two actions when its observations disturbed the digest", () => {
    const rerendered = "state:list.rerendered";
    const steps = canonicalExploration();
    steps[1] = { actionId: "scroll", effect: "observe", outcome: "succeeded", stateBefore: PAGE_AS_FOUND, stateAfter: rerendered };
    steps[2] = { ...steps[2]!, stateBefore: rerendered };
    steps[3] = { ...steps[3]!, stateAfter: rerendered };
    steps[4] = { actionId: "inspect", effect: "observe", outcome: "succeeded", stateBefore: rerendered, stateAfter: rerendered };
    steps[5] = { ...steps[5]!, stateBefore: rerendered };

    const reduction = reduceAutomationStudioExploration({ steps });

    expect(reduction.actions).toEqual([
      { index: 5, actionId: "click", input: { target: "right" } },
      { index: 6, actionId: "wait" }
    ]);
    // The scroll is the first place the state the correct click starts from
    // appears, so the walk reaches it and refuses it -- and says the chain it
    // derived the sequence from is not sound, because something it cannot
    // replay sits on it.
    expect(reduction.stateChainIntact).toBe(false);
  });

  // A step that did not happen cannot be the fix. Each of the three ways it can
  // fail to happen is dropped, and the receipt says so with one reason rather
  // than three, because the sequence does not care which it was.
  it.each(["failed", "refused", "not_run"] as const)("drops a step whose outcome was %s", (outcome) => {
    const reduction = reduceAutomationStudioExploration({
      steps: [
        { actionId: "attempt", effect: "mutate", outcome, stateBefore: "a", stateAfter: "a" },
        { actionId: "fix", effect: "mutate", outcome: "succeeded", stateBefore: "a", stateAfter: "done" }
      ]
    });

    expect(reduction.actions.map((action) => action.actionId)).toEqual(["fix"]);
    expect(reduction.dropped).toEqual([{ index: 0, actionId: "attempt", reason: "did_not_succeed" }]);
  });

  it("drops a step that ran and left the state exactly as it found it", () => {
    const reduction = reduceAutomationStudioExploration({
      steps: [
        { actionId: "no.op", effect: "mutate", outcome: "succeeded", stateBefore: "a", stateAfter: "a" },
        { actionId: "fix", effect: "mutate", outcome: "succeeded", stateBefore: "a", stateAfter: "done" }
      ]
    });

    expect(reduction.dropped).toEqual([{ index: 0, actionId: "no.op", reason: "changed_nothing" }]);
  });

  // Anything after the moment success was seen is out of scope by definition:
  // the success was already observed, so it cannot have depended on them.
  it("ignores everything after the step success was observed at", () => {
    const steps = canonicalExploration();
    steps.push({ actionId: "click", input: { target: "elsewhere" }, effect: "mutate", outcome: "succeeded", stateBefore: RIGHT_PAGE_SETTLED, stateAfter: "state:somewhere-else" });
    const reduction = reduceAutomationStudioExploration({ steps, successAt: 6 });

    expect(reduction.actions.map((action) => action.index)).toEqual([5, 6]);
    expect(reduction.outputState).toEqual({ kind: "state_digest_equals", digest: RIGHT_PAGE_SETTLED });
    expect(reduction.dropped.at(-1)).toEqual({ index: 7, actionId: "click", reason: "after_success" });
  });

  // An exploration that found the state already right has a real answer, and it
  // is not the empty one: no action is needed, and the precondition says which
  // state that holds in.
  it("answers with no actions, and the state it requires, when nothing had to be done", () => {
    const reduction = reduceAutomationStudioExploration({
      steps: [{ actionId: "look", effect: "observe", outcome: "succeeded", stateBefore: "ready", stateAfter: "ready" }]
    });

    expect(reduction.actions).toEqual([]);
    expect(reduction.inputState).toEqual({ kind: "state_digest_equals", digest: "ready" });
    expect(reduction.outputState).toEqual({ kind: "state_digest_equals", digest: "ready" });
    expect(reduction.stateChainIntact).toBe(true);
  });

  it("carries the argument each kept action was given, so the sequence can be run again", () => {
    const reduction = reduceAutomationStudioExploration({ steps: canonicalExploration() });

    expect(reduction.actions[0]?.input).toEqual({ target: "right" });
    expect(reduction.actions[1]).not.toHaveProperty("input");
  });

  it("has nothing to reduce, and no state to require, when the exploration took no steps", () => {
    const reduction = reduceAutomationStudioExploration({ steps: [] });

    expect(reduction.actions).toEqual([]);
    expect(reduction.inputState).toEqual({ kind: "any_state" });
    expect(reduction.outputState).toEqual({ kind: "any_state" });
    expect(reduction.successAt).toBe(-1);
  });

  // Reducing a window the caller did not mean would answer with a fix for a
  // success nobody observed, so the index is refused rather than clamped.
  it("refuses a success index that is not one of the steps", () => {
    expect(() => reduceAutomationStudioExploration({ steps: canonicalExploration(), successAt: 7 })).toThrow(RangeError);
    expect(() => reduceAutomationStudioExploration({ steps: canonicalExploration(), successAt: -1 })).toThrow(RangeError);
    expect(() => reduceAutomationStudioExploration({ steps: [], successAt: 0 })).toThrow(RangeError);
  });
});
