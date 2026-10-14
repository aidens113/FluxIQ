import { describe, expect, it } from "vitest";
import { automationStudioSubflowTrialPort } from "../index.ts";
import { SPENT, subflowTrialFixture as fixture } from "./fixtures.ts";

describe("subflow trial port", () => {
  it("refuses another build's request, records each trial and sums what its judges spent", async () => {
    const f = fixture();
    const { port, records, spent } = automationStudioSubflowTrialPort("build.1", f.ports);
    const other = f.request();
    other.scope = { ...other.scope, buildId: "build.2" };
    expect(await port(other)).toMatchObject({ partial: true, scope: "subflow", verdict: "execution_failed", entryPrepared: false, feedback: { code: "subflow.trial_other_build" } });
    expect(records()).toEqual([]);
    const [first, second] = await Promise.all([port(f.request()), port(f.request())]);
    expect([first.trialRunId, second.trialRunId].sort()).toEqual(["subflow-trial.1", "subflow-trial.2"]);
    expect(records()).toHaveLength(2);
    expect(spent()).toMatchObject({ calls: 4, totalTokens: 660 });
    f.setVerdict({ verdict: "not_judged", why: "deadline", spent: { ...SPENT, calls: 1 } });
    expect(await port(f.request())).toMatchObject({ verdict: "not_judged", partial: true });
  });
});
