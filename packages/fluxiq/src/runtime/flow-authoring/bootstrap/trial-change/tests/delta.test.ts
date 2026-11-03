import { describe, expect, it } from "vitest";
import { automationStudioTrialDelta as delta, type AutomationStudioTrialReading, type AutomationStudioTrialWitness } from "../index.ts";

// One witness's delta from the reading just before a trial to the one just
// after it: list subjects matched across every scope of the group, control
// counts at one place, and `unread` whenever a side carried no reading of it.

const cart: AutomationStudioTrialWitness = { id: "w1", kind: "list", group: "g:cart", where: "the cart page", steps: [2], parts: ["p1"] };
const like: AutomationStudioTrialWitness = { id: "w2", kind: "control", place: "pl:like", steps: [3], parts: ["p2"] };
const read = (reading: Omit<AutomationStudioTrialReading, "source">, source: AutomationStudioTrialReading["source"] = "core_look"): AutomationStudioTrialReading => ({ source, ...reading });

describe("a list witness's delta", () => {
  it("is one changed subject when the line left at 9 by an earlier act reads 10 after the trial", () => {
    const before = read({ collections: [{ scope: "sc:cart", group: "g:cart", subjects: ["s:a", "s:b"], states: { "s:a": "st:9", "s:b": "st:1" } }] }, "latest_read");
    const after = read({ collections: [{ scope: "sc:cart", group: "g:cart", subjects: ["s:a", "s:b"], states: { "s:a": "st:10", "s:b": "st:1" } }] });
    expect(delta(cart, before, after)).toEqual({ witness: "w1", kind: "list", status: "changed", added: [], removed: [], changed: ["s:a"], unchanged: ["s:b"] });
  });

  it("matches subjects across every scope of its group and ignores other groups", () => {
    const before = read({ collections: [
      { scope: "sc:p1", group: "g:cart", subjects: ["s:a"], states: { "s:a": "st:1" } },
      { scope: "sc:p2", group: "g:cart", subjects: ["s:b"], states: { "s:b": "st:1" } },
      { scope: "sc:other", group: "g:other", subjects: ["s:z"], states: { "s:z": "st:1" } }
    ] });
    const after = read({ collections: [
      { scope: "sc:p1", group: "g:cart", subjects: ["s:b", "s:c"], states: { "s:b": "st:1", "s:c": "st:1" } },
      { scope: "sc:p2", group: "g:cart", subjects: ["s:a"], states: { "s:a": "st:1" } }
    ] });
    expect(delta(cart, before, after)).toEqual({ witness: "w1", kind: "list", status: "changed", added: ["s:c"], removed: [], changed: [], unchanged: ["s:a", "s:b"] });
  });

  it("is unchanged when every subject keeps its state, and counts an emptied list as removed", () => {
    const one = read({ collections: [{ scope: "sc:cart", group: "g:cart", subjects: ["s:a"], states: { "s:a": "st:9" } }] });
    expect(delta(cart, one, one)).toMatchObject({ status: "unchanged", unchanged: ["s:a"] });
    const empty = read({ collections: [{ scope: "sc:cart", group: "g:cart", subjects: [], states: {} }] });
    expect(delta(cart, one, empty)).toMatchObject({ status: "changed", removed: ["s:a"] });
  });

  it("is unread when either side is missing or carried no read of the group", () => {
    const one = read({ collections: [{ scope: "sc:cart", group: "g:cart", subjects: ["s:a"], states: { "s:a": "st:9" } }] });
    expect(delta(cart, undefined, one)).toEqual({ witness: "w1", kind: "list", status: "unread" });
    expect(delta(cart, one, undefined)).toEqual({ witness: "w1", kind: "list", status: "unread" });
    expect(delta(cart, one, read({}))).toEqual({ witness: "w1", kind: "list", status: "unread" });
    expect(delta(cart, one, read({ collections: [{ scope: "sc:x", group: "g:other", subjects: [], states: {} }] }))).toEqual({ witness: "w1", kind: "list", status: "unread" });
  });
});

describe("a control witness's delta", () => {
  it("is the place's counts before and after, changed or not", () => {
    const before = read({ controls: { "pl:like": { "st:off": 1 }, "pl:other": { "st:on": 1 } } });
    const after = read({ controls: { "pl:like": { "st:on": 1 } } });
    expect(delta(like, before, after)).toEqual({ witness: "w2", kind: "control", status: "changed", before: { "st:off": 1 }, after: { "st:on": 1 } });
    expect(delta(like, before, before)).toMatchObject({ status: "unchanged" });
    expect(delta(like, read({ controls: { "pl:like": { "st:on": 1, "st:off": 0 } } }), read({ controls: { "pl:like": { "st:on": 1 } } }))).toMatchObject({ status: "unchanged" });
  });

  it("reads a place absent from a read that reports controls as empty, and a read with no controls as unread", () => {
    expect(delta(like, read({ controls: { "pl:like": { "st:on": 1 } } }), read({ controls: {} }))).toEqual({ witness: "w2", kind: "control", status: "changed", before: { "st:on": 1 }, after: {} });
    expect(delta(like, read({ controls: { "pl:like": { "st:on": 1 } } }), read({}))).toEqual({ witness: "w2", kind: "control", status: "unread" });
  });
});
