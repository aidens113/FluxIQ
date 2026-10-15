// A trial judged no carries Core's record of that no beside its feedback,
// never in it, and the port passes it on to the trial gate (t633,
// `../run.ts`). Nothing of it on a yes.
import { describe, expect, it } from "vitest";
import type { AutomationStudioResultStandingNoRecord } from "../../../result-verification/index.ts";
import { automationStudioCandidateTrialPort, runAutomationStudioCandidateTrial } from "../index.ts";
import { SPENT_TWO, trialFixture } from "./fixtures.ts";

const RECORD: AutomationStudioResultStandingNoRecord = {
  stored: ["Row one", "Row two"], storedWhole: true,
  conditions: [{ name: "condition 1 (name contains [\"Row\"])", key: "name contains [\"row\"]", leftOutAlone: [] }],
  upheldKind: ["Row two"], standing: [{ call: 1 }, { call: 2, drops: ["name contains [\"row\"]"] }]
};
/** Every press lands, as `./run.test.ts` stubs it, so the trial runs to its end and is judged. */
function pressing(fixture: ReturnType<typeof trialFixture>): ReturnType<typeof trialFixture> {
  fixture.ports.graphOptions = ({ signal }) => ({ signal, now: () => 100, nativeNodeExecutor: async () => ({ result: { status: "success", route: "success", outputs: {} } }) } as ReturnType<typeof fixture.ports.graphOptions>);
  return fixture;
}

const NO = { verdict: "no" as const, expected: "x", observed: "y", findings: [], records: { stored: 2, refused: 0, missingRequired: 0 }, standingNo: RECORD, spent: { ...SPENT_TWO } };

describe("Core's record of a trial's no (t633)", () => {
  it("rides on the trial's result beside its feedback, and the port passes it on", async () => {
    const fixture = pressing(trialFixture());
    fixture.setVerdict(structuredClone(NO));
    const { result } = await runAutomationStudioCandidateTrial(fixture.request(), fixture.ports);
    expect(result).toMatchObject({ verdict: "no", standingNo: RECORD });
    expect(JSON.stringify(result.feedback)).not.toContain("upheldKind");
    expect(JSON.stringify(result.feedback)).not.toContain("Row two");
    const trials = automationStudioCandidateTrialPort("candidate.1", fixture.ports);
    expect(await trials.port(fixture.request())).toMatchObject({ verdict: "no", standingNo: RECORD });
  });

  it("is absent on a yes", async () => {
    const fixture = pressing(trialFixture());
    const { result } = await runAutomationStudioCandidateTrial(fixture.request(), fixture.ports);
    expect(result.verdict).toBe("yes");
    expect(result).not.toHaveProperty("standingNo");
  });
});
