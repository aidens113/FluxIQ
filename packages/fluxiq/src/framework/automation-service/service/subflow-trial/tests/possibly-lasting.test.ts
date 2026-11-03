// A partial trial names its possibly lasting steps to the scoped judge (t676).
// On A8 crossborder round 1 a subflow's step pressed another part's control,
// declared `consequences: none` and changed its page; Core recorded the act as
// possible (`../../candidate-trial/landed-acts.ts`), and the judge excused it
// as non-lasting on its own label. The judge input now carries those steps by
// nodeId. The fixture's presses declare a class, so the landed acts are
// wrapped here to mark the brief's own one possible, as a press that declared
// nothing and changed its page would be answered.
import { describe, expect, it, vi } from "vitest";
import { runAutomationStudioSubflowTrial } from "../index.ts";
import { subflowTrialFixture as fixture } from "./fixtures.ts";

const possible = vi.hoisted(() => ({ on: false }));

vi.mock("../../candidate-trial/index.ts", async (original) => {
  const actual = await original<typeof import("../../candidate-trial/index.ts")>();
  return {
    ...actual,
    automationStudioCandidateTrialLandedActs: (...args: Parameters<typeof actual.automationStudioCandidateTrialLandedActs>) => {
      const acts = actual.automationStudioCandidateTrialLandedActs(...args);
      // The last act is the brief's own subflow's press; the first, its predecessor's.
      return possible.on ? acts.map((act, index) => (index === acts.length - 1 ? { ...act, consequences: [], possible: true as const } : act)) : acts;
    }
  };
});

describe("a partial trial's possibly lasting steps", () => {
  it("are handed to the judge by the nodeId of the step whose act was recorded possible", async () => {
    possible.on = true;
    const f = fixture();
    const { result } = await runAutomationStudioSubflowTrial(f.request(), f.ports);
    expect(result.verdict).toBe("yes");
    expect(result.acts?.at(-1)).toMatchObject({ possible: true });
    // The brief's own press ran second, after its predecessor's.
    expect(f.judged[0]!.possiblyLasting).toEqual([f.pressed[1]]);
  });

  it("are absent from the judge's input when no act was recorded possible", async () => {
    possible.on = false;
    const f = fixture();
    await runAutomationStudioSubflowTrial(f.request(), f.ports);
    expect(f.judged[0]).not.toHaveProperty("possiblyLasting");
  });
});
