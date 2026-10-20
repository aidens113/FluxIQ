import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_WITHHELD_VALUE } from "../../../executor/index.ts";
import { runAutomationStudioSubflowTrial } from "../index.ts";
import { subflowTrialFixture as fixture } from "./fixtures.ts";

// t738, rerun round 2 `run-mvgf801u-cc23575e`: a trial's acts were read off the saved trace, which withholds a page
// address the run resolved out of state, so a press on a book's own page -- opened by that row's link -- was handed to
// the reset ledger with the withholding marker for its location. Here the address is a value the run was handed, so
// the saved trace withholds it, and each part runs as a called frame, so the root's withholding rewrites its steps.

const ADDRESS = "https://reading-list.test/books/42";

describe("the acts a subflow trial hands its reset ledger", () => {
  it("carry the page address the trial executed on, while the trace the session saves still withholds it", async () => {
    const f = fixture();
    let captured = 0;
    const graphOptions = f.ports.graphOptions;
    f.ports.graphOptions = (input) => ({
      ...graphOptions(input),
      inputs: { link: ADDRESS },
      hostRuntime: {
        capabilities: [],
        captureStateSnapshot: ({ attemptId, point }) => ({ stateSnapshotId: `s.${++captured}`, stateRef: `s.${captured}@${attemptId}:${point}`, capturedAt: captured, summary: {} }),
        inspectStateDiff: () => ({ added: ["pressed"], removed: [], documentChanged: false, spot: { place: "p:want", state: "v:off" }, controls: { page: "p:book", location: ADDRESS, before: { "v:off": 1 }, after: { "v:on": 1 } } })
      }
    });
    const { result, record } = await runAutomationStudioSubflowTrial(f.request(), f.ports);
    expect(record.execution, JSON.stringify(record)).toBe("succeeded");
    // The predecessor's press and the brief's own both landed, each on the book's page.
    expect(result.acts?.map((act) => act.controls)).toEqual([
      { page: "p:book", location: ADDRESS, before: { "v:off": 1 }, after: { "v:on": 1 } },
      { page: "p:book", location: ADDRESS, before: { "v:off": 1 }, after: { "v:on": 1 } }
    ]);
    // What the session saves, and what the builder is shown, never carries it.
    const saved = f.sessions.at(-1)!.trace;
    expect(saved).toBeDefined();
    expect(JSON.stringify(saved)).not.toContain(ADDRESS);
    expect(JSON.stringify(saved)).toContain(AUTOMATION_STUDIO_WITHHELD_VALUE);
    expect(JSON.stringify(result.feedback)).not.toContain(ADDRESS);
    // Only the location: every other field of each act is the saved trace's.
    for (const act of result.acts ?? []) expect(act.spot).toEqual({ place: "p:want", state: "v:off" });
  });
});
