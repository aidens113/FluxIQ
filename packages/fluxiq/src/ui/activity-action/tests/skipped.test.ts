// Round 12, lane D (`run-mv62icw0-070f88ad`, screenshot 00009): a step passed
// over because what it acts on was not shown read "Done" while the status line
// beside it said "Skipped ...: it was not shown". A skipped step's card says
// it was skipped, and why.
import { describe, expect, it } from "vitest";
import { activityActionOf, activityActionSkipped } from "../index.ts";

const skippedRow = (reason: string) => ({
  phase: "running",
  label: "Skipped “Close the panel”: it was not shown",
  detail: { kind: "step", title: "Skipped “Close the panel”: it was not shown", status: "succeeded", ref: "n3", skipped: { reason, subject: "Close the panel" } }
});

describe("a run step skipped rather than run", () => {
  it("says it was skipped, and why, for each reason the contract names", () => {
    expect(activityActionSkipped({ reason: "optional_absent" })).toBe("Skipped: not there, optional");
    expect(activityActionSkipped({ reason: "state_routed" })).toBe("Skipped: the page was already at another step");
    expect(activityActionSkipped({ reason: "already_done" })).toBe("Skipped: already done in this run");
  });

  it("says nothing for a row with no skip or a reason it does not know", () => {
    expect(activityActionSkipped(undefined)).toBeNull();
    expect(activityActionSkipped({})).toBeNull();
    expect(activityActionSkipped({ reason: "some_newer_reason" })).toBeNull();
    expect(activityActionSkipped({ reason: "toString" })).toBeNull();
  });

  it("puts the words on the skipped row's card in place of Done", () => {
    const card = activityActionOf(skippedRow("optional_absent"));
    expect(card?.outcome).toBe("done");
    expect(card?.tested).toBe("Skipped: not there, optional");
  });

  it("leaves a plain step row as it was", () => {
    const card = activityActionOf({ phase: "running", label: "Running step 3 of 8", detail: { kind: "step", title: "Running step 3 of 8", status: "succeeded", ref: "n3", text: "Node: web.output.dom-click" } });
    expect(card?.tested).toBeUndefined();
  });
});
