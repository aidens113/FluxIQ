// The judge of a subflow's trial is told each earlier judged trial's advice
// (t752): the gate's `earlierAdvice` rides the partial trial's request to the
// summary its judge reads, last (`../run.ts`). Generic words only.
import { describe, expect, it } from "vitest";
import type { AutomationStudioResultEarlierAdvice } from "../../../result-verification/index.ts";
import { runAutomationStudioSubflowTrial } from "../index.ts";
import { subflowTrialFixture as fixture } from "./fixtures.ts";

const EARLIER: AutomationStudioResultEarlierAdvice[] = [{
  revision: 1, verdict: "unsure", advice: "Also accept books on hold.", followed: "unknown",
  said: "After the trial of revision 1 (judged unsure) the judge advised: Also accept books on hold. Core could not tell which conditions or steps that advice names, so whether revision 2 followed it is not known."
}];

describe("earlier judged trials' advice in a partial trial's summary (t752)", () => {
  it("rides the request to the summary its judge reads, as the summary's last key", async () => {
    const f = fixture();
    await runAutomationStudioSubflowTrial({ ...f.request(), earlierAdvice: EARLIER }, f.ports);
    expect(f.judged[0]!.summary.earlierAdvice).toEqual(EARLIER);
    expect(Object.keys(f.judged[0]!.summary).at(-1)).toBe("earlierAdvice");
  });
});
