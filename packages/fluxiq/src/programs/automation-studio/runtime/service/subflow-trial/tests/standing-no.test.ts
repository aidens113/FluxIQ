// A partial trial judged no carries Core's record of that no beside its
// feedback, never in it, and the port passes it on to the subflow trial gate
// (t633, `../run.ts`). Nothing of it on a yes.
import { describe, expect, it } from "vitest";
import type { AutomationStudioResultStandingNoRecord } from "../../../result-verification/index.ts";
import { automationStudioSubflowTrialPort, runAutomationStudioSubflowTrial } from "../index.ts";
import { SPENT, subflowTrialFixture as fixture } from "./fixtures.ts";

const RECORD: AutomationStudioResultStandingNoRecord = {
  stored: ["Row one", "Row two"], storedWhole: true,
  conditions: [{ name: "condition 1 (name contains [\"Row\"])", key: "name contains [\"row\"]", leftOutAlone: [] }],
  upheldKind: ["Row two"], standing: [{ call: 1 }, { call: 2, drops: ["name contains [\"row\"]"] }]
};
const NO = { verdict: "no" as const, expected: "x", observed: "y", findings: [], records: { stored: 2, refused: 0, missingRequired: 0 }, standingNo: RECORD, spent: { ...SPENT } };

describe("Core's record of a partial trial's no (t633)", () => {
  it("rides on the partial receipt beside its feedback, and the port passes it on", async () => {
    const f = fixture();
    f.setVerdict(structuredClone(NO));
    const { result } = await runAutomationStudioSubflowTrial(f.request(), f.ports);
    expect(result).toMatchObject({ partial: true, verdict: "no", entryPrepared: true, standingNo: RECORD });
    expect(JSON.stringify(result.feedback)).not.toContain("upheldKind");
    expect(JSON.stringify(result.feedback)).not.toContain("Row two");
    const trials = automationStudioSubflowTrialPort("build.1", f.ports);
    expect(await trials.port(f.request())).toMatchObject({ verdict: "no", standingNo: RECORD });
  });

  it("is absent on a yes", async () => {
    const f = fixture();
    const { result } = await runAutomationStudioSubflowTrial(f.request(), f.ports);
    expect(result.verdict).toBe("yes");
    expect(result).not.toHaveProperty("standingNo");
  });
});
