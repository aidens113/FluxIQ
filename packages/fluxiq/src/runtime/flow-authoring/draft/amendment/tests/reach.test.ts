// A decision that leaves a step of the Flow with no way to the page it acted on
// (live run `run-muwao5n4-44977b2a`, lane D, cause D2-1).
//
// Decision 0025 put the friend-request listing at step 2, after `navigate ~/`
// and before both navigations that reach the requests page; decision 0030
// dropped both navigations. Each was answered "applied" and nothing more, and
// every later test ran the listing on the home feed.
import { describe, expect, it } from "vitest";
import { applyAutomationStudioFlowDraftAmendments } from "../index.ts";
import type { AutomationStudioFlowDraftStep } from "../../step.ts";

const HOME = "https://example.test/";
const FRIENDS = "https://example.test/friends/";
const REQUESTS = "https://example.test/friends/requests/";

/** One step as the loop appends it: its own id, and the page the host wrote it found. */
function step(n: number, page: string | undefined, kind: "press" | "read" = "press", disposition: AutomationStudioFlowDraftStep["disposition"] = "kept"): AutomationStudioFlowDraftStep {
  return {
    position: n, id: `d${n}`, iteration: n, actionId: kind === "read" ? "extract_list" : "press", input: { n },
    effect: kind === "read" ? "observe" : "mutate", effectApplied: true, ...(kind === "read" ? { proposes: true } : {}),
    disposition, ...(page === undefined ? {} : { replay: { from: { location: page } } })
  };
}

/** The 0030 draft: home, cookies, to friends, to requests, close chat, the listing, Confirm. */
function requestsDraft(): AutomationStudioFlowDraftStep[] {
  return [step(1, HOME), step(2, HOME), step(3, HOME), step(4, FRIENDS), step(5, REQUESTS), step(6, REQUESTS, "read"), step(7, REQUESTS)];
}

describe("a decision that leaves a step of the Flow with no way to its page", () => {
  it("refuses a drop of the only steps that bring the page to where a kept step acted, and applies the rest", () => {
    const draft = requestsDraft();
    const report = applyAutomationStudioFlowDraftAmendments(draft, [
      { step: 3, change: "drop" },
      { step: 4, change: "drop" },
      { step: 5, change: "drop" }
    ]);
    // Step 4 is the navigation to the requests page the listing (6) acted on;
    // once it stays, step 3 is the navigation to the friends page step 4 acted on.
    expect(report.applied).toBe(1);
    expect(report.refused).toEqual([
      { step: 4, reason: "strands_a_step", strands: 6 },
      { step: 3, reason: "strands_a_step", strands: 4 }
    ]);
    expect(draft.map((entry) => entry.disposition)).toEqual(["kept", "kept", "kept", "kept", "dropped", "kept", "kept"]);
  });

  it("applies a drop that leaves every kept step a way to its page", () => {
    const draft = requestsDraft();
    // Close chat ran on the requests page and brought nothing there.
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 5, change: "drop" }])).toEqual({ applied: 1, refused: [] });
    // Dropping the listing and Confirm too leaves no step on the requests page: the navigation may go.
    const bare = requestsDraft();
    expect(applyAutomationStudioFlowDraftAmendments(bare, [{ step: 6, change: "drop" }, { step: 7, change: "drop" }, { step: 4, change: "drop" }, { step: 5, change: "drop" }])).toEqual({ applied: 4, refused: [] });
  });

  it("says, beside an applied decision, which step it put after a step that does not leave the page it acted on", () => {
    // The 0025 shape: the listing ran last and is added at step 2, before the navigations.
    const draft = [step(1, HOME), step(2, HOME), step(3, HOME), step(4, FRIENDS), step(5, REQUESTS, "read", "taken")];
    const report = applyAutomationStudioFlowDraftAmendments(draft, [{ step: 5, change: "add", to: 2 }]);
    expect(report.applied).toBe(1);
    expect(report.refused).toEqual([]);
    expect(report.unreached).toEqual([{ step: 5, after: 1, reachedBy: [4] }]);
    expect(draft.map((entry) => entry.id)).toEqual(["d1", "d5", "d2", "d3", "d4"]);
  });

  it("says nothing about a step already without its way before the decision, or where the pages are unknown", () => {
    const stranded = [step(1, HOME), step(2, REQUESTS, "read"), step(3, HOME), step(4, FRIENDS), step(5, REQUESTS)];
    stranded[1]!.id = "d6";
    expect(applyAutomationStudioFlowDraftAmendments(stranded, [{ step: 5, change: "keep", settings: { waitFor: "x" } }])).toEqual({ applied: 1, refused: [] });
    const unknown = requestsDraft().map(({ replay: _replay, ...entry }) => entry);
    expect(applyAutomationStudioFlowDraftAmendments(unknown, [{ step: 3, change: "drop" }, { step: 4, change: "drop" }])).toEqual({ applied: 2, refused: [] });
  });
});
