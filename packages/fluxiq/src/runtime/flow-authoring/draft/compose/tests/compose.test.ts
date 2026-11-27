// The framework drafts the Flow from the calls that worked (`../compose.ts`, D16): each reason a step is
// left out, the model's rulings left alone, the result's choice, and that the function is pure and settles.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDraftStep } from "../../step.ts";
import { automationStudioFlowDraftCompose } from "../compose.ts";

type Step = AutomationStudioFlowDraftStep;

const step = (position: number, rest: Partial<Step> = {}): Step => ({
  position, iteration: position, actionId: "press", input: { target: `t${position}` }, effect: "mutate", effectApplied: true, disposition: "taken", ...rest
});
const read = (position: number, rest: Partial<Step> = {}): Step => {
  const { effectApplied: _unused, ...base } = step(position);
  return { ...base, actionId: "read", effect: "observe", proposes: true, ...rest };
};
const words = (steps: Step[]) => steps.map((each) => each.drafted ?? `(${each.disposition})`);

describe("drafting the Flow from the calls that worked", () => {
  it("puts a step that worked in the Flow", () => {
    const [only] = automationStudioFlowDraftCompose({ steps: [step(1)] });
    expect([only!.drafted, only!.disposition]).toEqual(["in", "kept"]);
  });

  it("leaves out a rerun's replaced step, a look and a call that did not work, and says why", () => {
    const out = automationStudioFlowDraftCompose({
      steps: [
        step(1, { replacedBy: "p2" }),
        step(2, { actionId: "look", effect: "observe", proposes: false }),
        step(3, { effectApplied: false }),
        step(4)
      ]
    });
    expect(words(out)).toEqual(["replaced", "look", "did_not_work", "in"]);
    expect(out.map((each) => each.disposition)).toEqual(["taken", "taken", "taken", "kept"]);
  });

  it("leaves out a press a later press of the same control undid, both halves, keeping their pairing", () => {
    const out = automationStudioFlowDraftCompose({
      steps: [step(1, { toggle: { key: "k", to: "on" } }), step(2, { toggle: { key: "k", to: "off" } }), step(3)]
    });
    expect(words(out)).toEqual(["undone", "undone", "in"]);
    expect([out[0]!.cancels, out[1]!.cancels]).toEqual(["p2", "p1"]);
  });

  it("leaves out a detour that came back to the state it left with nothing lasting", () => {
    const out = automationStudioFlowDraftCompose({
      steps: [
        step(1, { stateBefore: "S0", stateAfter: "S1" }),
        step(2, { input: { target: "back" }, stateBefore: "S1", stateAfter: "S0" }),
        step(3, { input: { target: "real" }, stateBefore: "S0", stateAfter: "S2", changed: [{ words: "Cart (1)", how: "appeared" }] })
      ]
    });
    expect(words(out)).toEqual(["dead_end", "dead_end", "in"]);
  });

  it("does not mark a detour with a lasting step inside", () => {
    const out = automationStudioFlowDraftCompose({
      steps: [
        step(1, { stateBefore: "S0", stateAfter: "S1" }),
        step(2, { input: { target: "claimed" }, acts: ["a1"], stateBefore: "S1", stateAfter: "S2" }),
        step(3, { input: { target: "back" }, stateBefore: "S2", stateAfter: "S0" })
      ]
    });
    expect(words(out)).toEqual(["in", "in", "in"]);
  });

  it("does not mark a detour that holds the result's read", () => {
    const out = automationStudioFlowDraftCompose({
      steps: [
        step(1, { stateBefore: "S0", stateAfter: "S1" }),
        read(2, { reads: "L" }),
        step(3, { input: { target: "back" }, stateBefore: "S1", stateAfter: "S0" }),
        // Lasting, so the press back is not left out as a press after the result (`../after-result.ts`).
        step(4, { input: { target: "add" }, stateBefore: "S0", stateAfter: "S2", changed: [{ words: "Cart (1)", how: "rose" }] })
      ]
    });
    expect(words(out)).toEqual(["in", "in", "in", "in"]);
  });

  it("never forms a dead end from steps with no digests", () => {
    expect(words(automationStudioFlowDraftCompose({ steps: [step(1), step(2)] }))).toEqual(["in", "in"]);
  });

  it("keeps the second press of a click, back, click again run: the dead end comes before the repeat", () => {
    const out = automationStudioFlowDraftCompose({
      steps: [
        step(1, { stateBefore: "S0", stateAfter: "S1" }),
        step(2, { input: { target: "back" }, stateBefore: "S1", stateAfter: "S0" }),
        step(3, { input: { target: "t1" }, stateBefore: "S0" })
      ]
    });
    expect(words(out)).toEqual(["dead_end", "dead_end", "in"]);
  });

  it("leaves out the second of two presses of one control from one state", () => {
    const out = automationStudioFlowDraftCompose({
      steps: [
        step(1, { input: { target: "x" }, stateBefore: "S0", changed: [{ words: "a", how: "appeared" }] }),
        step(2, { input: { target: "x" }, stateBefore: "S0" })
      ]
    });
    expect(words(out)).toEqual(["in", "repeat"]);
  });

  it("leaves a model's ruling alone: kept, dropped, exploratory", () => {
    const steps = [step(1, { disposition: "kept" }), step(2, { disposition: "dropped" }), step(3, { disposition: "exploratory" }), step(4, { effectApplied: false, disposition: "kept" })];
    const out = automationStudioFlowDraftCompose({ steps });
    expect(out).toEqual(steps);
    expect(out.every((each) => each.drafted === undefined)).toBe(true);
  });

  it("counts a kept step of the model's as in the Flow for the rules that look at it", () => {
    const out = automationStudioFlowDraftCompose({
      steps: [
        step(1, { input: { target: "x" }, stateBefore: "S0", disposition: "kept" }),
        step(2, { input: { target: "x" }, stateBefore: "S0" })
      ]
    });
    expect(words(out)).toEqual(["(kept)", "repeat"]);
  });

  describe("the result's reads", () => {
    it("chooses the last read, and leaves out the others", () => {
      const out = automationStudioFlowDraftCompose({ steps: [read(1, { reads: "A" }), read(2, { reads: "B" }), read(3, { reads: "C" })] });
      expect(words(out)).toEqual(["not_the_result", "not_the_result", "in"]);
    });

    it("chooses the last read the caller accepts as the asked table", () => {
      const out = automationStudioFlowDraftCompose({
        steps: [read(1, { reads: "A" }), read(2, { reads: "B" }), read(3, { reads: "C" })],
        isAskedTable: (each) => each.reads !== "C"
      });
      expect(words(out)).toEqual(["not_the_result", "in", "not_the_result"]);
    });

    it("falls back to the last read when the caller accepts none", () => {
      const out = automationStudioFlowDraftCompose({ steps: [read(1, { reads: "A" }), read(2, { reads: "B" })], isAskedTable: () => false });
      expect(words(out)).toEqual(["not_the_result", "in"]);
    });

    it("keeps every read of the chosen list as a result read, when a press between them keeps them from being copies", () => {
      const out = automationStudioFlowDraftCompose({
        steps: [read(1, { reads: "L" }), step(2, { changed: [{ words: "next", how: "reads" }] }), read(3, { reads: "L" }), read(4, { reads: "M" })],
        isAskedTable: (each) => each.reads === "L"
      });
      expect(words(out)).toEqual(["in", "in", "in", "not_the_result"]);
    });

    it("lets a read the model named the result stand in place of the framework's choice", () => {
      const out = automationStudioFlowDraftCompose({
        steps: [read(1, { reads: "A", drafted: "in", result: true }), read(2, { reads: "B" })]
      });
      expect(words(out)).toEqual(["in", "not_the_result"]);
    });

    it("lets a model's kept read named the result outrank the framework's reads", () => {
      const out = automationStudioFlowDraftCompose({
        steps: [read(1, { reads: "A", disposition: "kept", result: true }), read(2, { reads: "B" })]
      });
      expect(words(out)).toEqual(["(kept)", "not_the_result"]);
    });

    it("moves the result when a later read arrives, and the earlier pick goes back out", () => {
      const first = automationStudioFlowDraftCompose({ steps: [read(1, { reads: "A" })] });
      expect(words(first)).toEqual(["in"]);
      const second = automationStudioFlowDraftCompose({ steps: [...first, read(2, { reads: "B" })] });
      expect(words(second)).toEqual(["not_the_result", "in"]);
    });

    it("keeps the later of two reads of one list with nothing changed between, the earlier going as a repeat", () => {
      const out = automationStudioFlowDraftCompose({
        steps: [read(1, { reads: "L", input: { fields: ["name"] } }), read(2, { reads: "L", input: { fields: ["name", "price"] } })]
      });
      expect(words(out)).toEqual(["repeat", "in"]);
    });

    it("keeps a model's kept read and leaves out the framework's later copy of it", () => {
      const out = automationStudioFlowDraftCompose({ steps: [read(1, { reads: "L", disposition: "kept" }), read(2, { reads: "L" })] });
      expect(words(out)).toEqual(["(kept)", "repeat"]);
    });

    it("leaves out the presses after the result's last read that nothing lasting follows", () => {
      const out = automationStudioFlowDraftCompose({
        steps: [step(1), read(2, { reads: "L" }), step(3, { input: { target: "filter" } }), step(4, { input: { target: "next" } })]
      });
      expect(words(out)).toEqual(["in", "in", "dead_end", "dead_end"]);
    });

    it("keeps a press after the result's last read when something lasting comes after it", () => {
      const out = automationStudioFlowDraftCompose({
        steps: [read(1, { reads: "L" }), step(2, { input: { target: "open" } }), step(3, { input: { target: "add" }, changed: [{ words: "Cart (1)", how: "rose" }] })]
      });
      expect(words(out)).toEqual(["in", "in", "in"]);
    });

    // t1037 phase 2: a renewal after the list's read declared its lasting effect and changed nothing on its page.
    it("keeps a press after the result's last read whose call declared a lasting effect, as the dry run reads it", () => {
      const out = automationStudioFlowDraftCompose({
        steps: [
          read(1, { reads: "L" }),
          step(2, { input: { target: "renew", consequences: ["modify_existing"] } }),
          step(3, { input: { target: "other" }, ranWith: { target: "#other", consequences: [] } })
        ]
      });
      expect(words(out)).toEqual(["in", "in", "dead_end"]);
    });

    // t1037 phase 2: answer-first says which reads its answer is made of (every read not marked a working read).
    it("takes every read the caller says is the answer's as a result read, and leaves out only the others", () => {
      const out = automationStudioFlowDraftCompose({
        steps: [read(1, { input: { output: "one" } }), read(2, { input: { output: "working" } }), read(3, { input: { output: "two" } })],
        isResult: (each) => each.input.output !== "working"
      });
      expect(words(out)).toEqual(["in", "not_the_result", "in"]);
    });

    it("leaves a Flow with no read alone, its last press in it", () => {
      const out = automationStudioFlowDraftCompose({ steps: [step(1), step(2, { input: { target: "last" } })] });
      expect(words(out)).toEqual(["in", "in"]);
    });

    it("brings a step back in, with its reason cleared, when it becomes the result again", () => {
      const out = automationStudioFlowDraftCompose({ steps: [read(1, { reads: "A", drafted: "not_the_result", disposition: "taken" })] });
      expect([out[0]!.drafted, out[0]!.disposition]).toEqual(["in", "kept"]);
    });
  });

  it("clears the pairing an undone step carried when it comes back in", () => {
    const out = automationStudioFlowDraftCompose({ steps: [step(1, { drafted: "undone", cancels: "p9" })] });
    expect([out[0]!.drafted, out[0]!.cancels]).toEqual(["in", undefined]);
  });

  it("does not undo a model's kept half of a pair, nor the framework's other half", () => {
    const out = automationStudioFlowDraftCompose({
      steps: [step(1, { disposition: "kept", toggle: { key: "k", to: "on" } }), step(2, { toggle: { key: "k", to: "off" } })]
    });
    expect(words(out)).toEqual(["(kept)", "in"]);
    expect(out[0]!.cancels).toBeUndefined();
  });

  it("returns copies in the same order and positions, and never changes its input", () => {
    const steps = [step(2, { toggle: { key: "k", to: "on" } }), step(1, { effectApplied: false }), step(3, { toggle: { key: "k", to: "off" } })];
    const before = JSON.stringify(steps);
    const out = automationStudioFlowDraftCompose({ steps });
    expect(JSON.stringify(steps)).toBe(before);
    expect(out.map((each) => each.position)).toEqual([2, 1, 3]);
    expect(out.some((each, index) => each === steps[index])).toBe(false);
  });

  it("settles: drafting its own output changes nothing", () => {
    const steps = [
      step(1, { stateBefore: "S0", stateAfter: "S1" }),
      step(2, { input: { target: "back" }, stateBefore: "S1", stateAfter: "S0" }),
      step(3, { toggle: { key: "k", to: "on" } }),
      step(4, { toggle: { key: "k", to: "off" } }),
      read(5, { reads: "A" }),
      read(6, { reads: "B" }),
      step(7, { effectApplied: false }),
      step(8, { input: { target: "x" }, stateBefore: "S5", changed: [{ words: "a", how: "appeared" }] }),
      step(9, { input: { target: "x" }, stateBefore: "S5" })
    ];
    const once = automationStudioFlowDraftCompose({ steps });
    expect(automationStudioFlowDraftCompose({ steps: once })).toEqual(once);
  });
});

// t1037 phase 2: a step carried from a saved Flow or an earlier attempt is the model's word, whatever the saved draft
// wrote on it: the read a saved run broke at is not taken out as a copy of the read the model then made by hand.
describe("a step the caller says is the model's word", () => {
  it("is never decided again, in or out", () => {
    const steps = [
      read(1, { reads: "L", drafted: "in", disposition: "kept" }),
      step(2, { drafted: "dead_end", disposition: "taken" }),
      read(3, { reads: "L" })
    ];
    const out = automationStudioFlowDraftCompose({ steps, isRuled: (each) => each.position < 3 });
    expect(out.map((each) => [each.drafted, each.disposition])).toEqual([["in", "kept"], ["dead_end", "taken"], ["repeat", "taken"]]);
  });
});

// F5 (`run-mwyfoz8o-507c92f6`): the model moved the result to a later paging loop and never dropped the first one.
describe("a paging loop a later loop over the same list replaced", () => {
  const modelsLoop = (first: number, list: string, result: boolean): Step[] => [
    read(first, { reads: list, disposition: "kept", ...(result ? { result: true as const } : {}), routing: { kind: "repeat", through: `p${first + 1}`, while: `p${first + 1}` } }),
    step(first + 1, { input: { target: `next${first}` }, disposition: "kept" })
  ];

  it("is left out, so the Flow pages the list once", () => {
    const out = automationStudioFlowDraftCompose({ steps: [...modelsLoop(1, "L", false), ...modelsLoop(3, "L", true)] });
    expect(out.map((each) => [each.drafted, each.disposition])).toEqual([["repeat", "taken"], ["repeat", "taken"], [undefined, "kept"], [undefined, "kept"]]);
  });

  it("settles, and leaves a loop over another list in", () => {
    const steps = [...modelsLoop(1, "M", false), ...modelsLoop(3, "L", true)];
    const once = automationStudioFlowDraftCompose({ steps });
    expect(once.map((each) => each.disposition)).toEqual(["kept", "kept", "kept", "kept"]);
    const replaced = automationStudioFlowDraftCompose({ steps: [...modelsLoop(1, "L", false), ...modelsLoop(3, "L", true)] });
    expect(automationStudioFlowDraftCompose({ steps: replaced })).toEqual(replaced);
  });

  it("stays out of a loop a step outside it still names, and out of one the model keeps again", () => {
    const named = [...modelsLoop(1, "L", false), ...modelsLoop(3, "L", true), step(5, { disposition: "kept", routing: { kind: "only_if", check: "p1" } })];
    expect(automationStudioFlowDraftCompose({ steps: named }).map((each) => each.disposition)).toEqual(["kept", "kept", "kept", "kept", "kept"]);
    const dropped = automationStudioFlowDraftCompose({ steps: [...modelsLoop(1, "L", false), ...modelsLoop(3, "L", true)] });
    // The model's `keep` deletes `drafted` and says kept.
    const kept = dropped.map((each) => (each.position <= 2 ? (({ drafted: _gone, ...rest }) => ({ ...rest, disposition: "kept" as const }))(each) : each));
    expect(automationStudioFlowDraftCompose({ steps: kept }).map((each) => each.disposition)).toEqual(["kept", "kept", "kept", "kept"]);
  });
});
