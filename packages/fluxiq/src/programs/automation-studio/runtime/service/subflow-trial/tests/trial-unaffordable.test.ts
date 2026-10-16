// t661, A8 towels debug (`run-mvac0nmw-52ed30b2`, fix 8): a partial trial starts only when the purse it would be judged
// under can hold both judge calls at their worst case (`../../candidate-trial/judging-fits.ts`).

import { describe, expect, it } from "vitest";
import { AutomationStudioLlmBuildPurse, automationStudioLlmBuildPurseScope } from "../../../llm/build-purse/index.ts";
import { automationStudioSubflowTrialPort, runAutomationStudioSubflowTrial } from "../index.ts";
import { subflowTrialFixture as fixture } from "./fixtures.ts";

/** A purse of `ceilingUsd` that knows the provider's price: a judge call at the standing 8,000 in and 1,250 out is held at $0.0105. */
function pricedPurse(ceilingUsd: number): AutomationStudioLlmBuildPurse {
  const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd });
  const held = purse.hold({ projectedCostUsd: 0.002, estimatedInputTokens: 1_000, maxOutputTokens: 500, price: (input, output) => input / 1_000_000 + 2 * output / 1_000_000 });
  if (!held.ok) throw new Error("the first call should fit");
  held.hold.settle({ estimatedCostUsd: 0.001 });
  return purse;
}

describe("a subflow trial the purse can hold one judge call for, not two", () => {
  it("refuses before the subflow runs, with no judge call recorded", async () => {
    const f = fixture();
    const { result, record } = await automationStudioLlmBuildPurseScope(pricedPurse(0.02), () => runAutomationStudioSubflowTrial(f.request(), f.ports));
    expect(result).toMatchObject({ verdict: "not_judged", entryPrepared: false, feedback: { code: "subflow.trial_unaffordable", partial: true, judgeCalls: 2, neededUsd: 0.021, leftUsd: 0.019 } });
    expect(record).toMatchObject({ execution: "not_run", code: "subflow.trial_unaffordable", judge: { calls: 0 } });
    expect(f.pressed).toEqual([]);
    expect(f.sessions).toEqual([]);
    expect(f.judged).toEqual([]);
  });

  it("runs as now where the purse can hold two", async () => {
    const f = fixture();
    const { result } = await automationStudioLlmBuildPurseScope(pricedPurse(0.05), () => runAutomationStudioSubflowTrial(f.request(), f.ports));
    expect(result.verdict).toBe("yes");
    expect(f.judged).toHaveLength(1);
  });

  it("puts nothing back ahead of a trial that will not start", async () => {
    const f = fixture();
    let hooked = 0;
    f.ports.prepareStart = async () => {
      hooked += 1;
      return {};
    };
    const { port } = automationStudioSubflowTrialPort("build.1", f.ports);
    const request = f.request();
    const prepared = await automationStudioLlmBuildPurseScope(pricedPurse(0.02), () => port.prepareStart!({ scope: request.scope, revision: request.proposal.revision, digest: request.proposal.digest, signal: request.signal }));
    expect(prepared).toBe("none");
    expect(hooked).toBe(0);
  });
});
