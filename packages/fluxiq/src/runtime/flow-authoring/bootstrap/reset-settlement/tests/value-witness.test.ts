import { describe, expect, it } from "vitest";
import { AutomationStudioSiteResetValueTracker, automationStudioSiteResetValueReplacements as replacements, type AutomationStudioSiteResetValueWitness } from "../index.ts";

// t772 value witness (office `run-mvrj7qg8-6916b3f7` cause 1, in generic shape):
// a choice confirmed by a press that reloads its page to the same address
// replaces a value the page shows, and settles when a fresh read shows the
// build's start value there again. Generic fixtures: a choir's rehearsal
// planner, the room a section rehearses in. Opaque tokens only.

const PAGE = "p:planner", AT = "loc:planner";

describe("which shown values an act replaced", () => {
  it("a value gone from the page is replaced; one still shown elsewhere only moved", () => {
    expect(replacements({ "pl:room": "v:room-a", "pl:time": "v:seven" }, { "pl:room": "v:room-b", "pl:time": "v:seven" })).toEqual([{ place: "pl:room", from: "v:room-a", to: "v:room-b", newValue: true }]);
    expect(replacements({ "pl:1": "v:first", "pl:2": "v:second" }, { "pl:1": "v:second", "pl:2": "v:first" })).toEqual([]);
    expect(replacements({ "pl:1": "v:row-1", "pl:2": "v:row-2" }, { "pl:1": "v:row-0", "pl:2": "v:row-1", "pl:3": "v:row-2" })).toEqual([]);
  });

  it("a new value an option's label showed before is still a replacement, without newValue", () => {
    expect(replacements({ "pl:room": "v:room-a", "pl:label-a": "v:room-a", "pl:label-b": "v:room-b" }, { "pl:room": "v:room-b" })).toEqual([{ place: "pl:room", from: "v:room-a", to: "v:room-b" }]);
  });
});

describe("a value act settled by observed value", () => {
  const room = (to: string, newValue = true): AutomationStudioSiteResetValueWitness => ({ page: PAGE, location: AT, replaced: [{ place: "pl:room", from: "v:room-a", to, ...(newValue ? { newValue: true as const } : {}) }] });

  it("read around while exploring: open while the set value shows, stale after a later lasting call, restored when the start value shows", () => {
    const tracker = new AutomationStudioSiteResetValueTracker();
    tracker.read({ scope: PAGE, location: AT, values: { "pl:room": "v:room-a" } }, 0);
    const witness = room("v:room-b", false);
    tracker.witnessed(witness);
    tracker.read({ scope: PAGE, location: AT, values: { "pl:room": "v:room-b" } }, 1);
    expect(tracker.standing(witness, 1, 1)).toEqual({ status: "open", location: AT });
    expect(tracker.standing(witness, 1, 2)).toEqual({ status: "stale", location: AT });
    // A third room is no start: still open.
    tracker.read({ scope: PAGE, location: AT, values: { "pl:room": "v:room-c" } }, 2);
    expect(tracker.standing(witness, 1, 2)).toEqual({ status: "open", location: AT });
    tracker.read({ scope: PAGE, location: AT, values: { "pl:room": "v:room-a" } }, 3);
    expect(tracker.standing(witness, 1, 3)).toEqual({ status: "holds", location: AT });
  });

  it("a later read never seeds the start of a place an act replaced", () => {
    const tracker = new AutomationStudioSiteResetValueTracker();
    const witness = room("v:room-b");
    tracker.witnessed(witness);
    tracker.read({ scope: PAGE, location: AT, values: { "pl:room": "v:room-b" } }, 1);
    expect(tracker.standing(witness, 1, 1)).toEqual({ status: "unproven", location: AT });
  });

  it("a trial step's act read only by its own diff starts an unread place at its from", () => {
    const tracker = new AutomationStudioSiteResetValueTracker();
    const witness = room("v:room-b");
    tracker.landed(witness);
    expect(tracker.standing(witness, 1, 1)).toEqual({ status: "stale", location: AT });
    tracker.read({ scope: PAGE, location: AT, values: { "pl:room": "v:room-a" } }, 1);
    expect(tracker.standing(witness, 1, 1)).toEqual({ status: "holds", location: AT });
  });

  it("a place that changes by itself neither holds nor blocks; a new value still shown blocks", () => {
    const tracker = new AutomationStudioSiteResetValueTracker();
    tracker.read({ scope: PAGE, location: AT, values: { "pl:room": "v:room-a", "pl:saved": "v:saved-1", "pl:leader": "v:leader-1" } }, 0);
    const witness: AutomationStudioSiteResetValueWitness = { page: PAGE, location: AT, replaced: [
      { place: "pl:room", from: "v:room-a", to: "v:room-b", newValue: true },
      { place: "pl:saved", from: "v:saved-1", to: "v:saved-2", newValue: true }
    ] };
    tracker.witnessed(witness);
    tracker.read({ scope: PAGE, location: AT, values: { "pl:room": "v:room-a", "pl:saved": "v:saved-3" } }, 1);
    expect(tracker.standing(witness, 1, 1).status).toBe("holds");
    const both: AutomationStudioSiteResetValueWitness = { page: PAGE, replaced: [...witness.replaced, { place: "pl:leader", from: "v:leader-1", to: "v:leader-2", newValue: true }] };
    tracker.read({ scope: PAGE, location: AT, values: { "pl:room": "v:room-a", "pl:saved": "v:saved-3", "pl:leader": "v:leader-2" } }, 1);
    expect(tracker.standing(both, 1, 1).status).toBe("open");
  });

  it("two acts at one place both settle at the build's start; an act that set the start back holds there", () => {
    const tracker = new AutomationStudioSiteResetValueTracker();
    tracker.read({ scope: PAGE, values: { "pl:room": "v:room-a" } }, 0);
    const first = room("v:room-b");
    tracker.witnessed(first);
    const second: AutomationStudioSiteResetValueWitness = { page: PAGE, replaced: [{ place: "pl:room", from: "v:room-b", to: "v:room-c", newValue: true }] };
    tracker.witnessed(second);
    tracker.read({ scope: PAGE, values: { "pl:room": "v:room-b" } }, 2);
    expect([tracker.standing(first, 1, 2).status, tracker.standing(second, 2, 2).status]).toEqual(["open", "open"]);
    tracker.read({ scope: PAGE, values: { "pl:room": "v:room-a" } }, 2);
    expect([tracker.standing(first, 1, 2).status, tracker.standing(second, 2, 2).status]).toEqual(["holds", "holds"]);
    const back: AutomationStudioSiteResetValueWitness = { page: PAGE, replaced: [{ place: "pl:room", from: "v:room-b", to: "v:room-a", newValue: true }] };
    expect(tracker.standing(back, 2, 2).status).toBe("holds");
  });
});
