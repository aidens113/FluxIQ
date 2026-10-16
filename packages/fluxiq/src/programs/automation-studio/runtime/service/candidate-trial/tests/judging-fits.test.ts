// t661, A8 towels debug (`run-mvac0nmw-52ed30b2`, fix 8): a repair brief's last trial ran the site for 54 seconds,
// paid $0.0042 for its first judge call and could not hold the second, so it came back not judged. A trial now starts
// only when the purse it would be judged under can hold both judge calls at their worst case; otherwise nothing acts on
// the site, no judge is asked, and the answer says so in figures.

import { describe, expect, it } from "vitest";
import { AutomationStudioLlmBuildPurse, automationStudioLlmBuildPurseRun, automationStudioLlmBuildPurseScope, type AutomationStudioLlmBuildPurseCall } from "../../../llm/build-purse/index.ts";
import { automationStudioCandidateTrialPort, automationStudioTrialJudgingShortfall, automationStudioTrialLargestJudgePrompt, runAutomationStudioCandidateTrial } from "../index.ts";
import { trialFixture } from "./fixtures.ts";

/** A dollar per million input tokens and two per million output tokens: a judge call at the standing 8,000 in and 1,250 out is held at $0.0105. */
const price = (inputTokens: number, outputTokens: number) => inputTokens / 1_000_000 + 2 * outputTokens / 1_000_000;

/** A purse of `ceilingUsd` that has already settled one priced call at $0.001, so it knows the provider's price. */
function pricedPurse(ceilingUsd: number): AutomationStudioLlmBuildPurse {
  const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd });
  const first: AutomationStudioLlmBuildPurseCall = { projectedCostUsd: 0.002, estimatedInputTokens: 1_000, maxOutputTokens: 500, price };
  const held = purse.hold(first);
  if (!held.ok) throw new Error("the first call should fit");
  held.hold.settle({ estimatedCostUsd: 0.001 });
  return purse;
}

describe("whether a trial's two judge calls can be paid", () => {
  it("answers nothing where both fit, and leaves nothing held or spent", () => {
    const purse = pricedPurse(0.05);
    expect(automationStudioTrialJudgingShortfall({ code: "candidate.trial_unaffordable", purse })).toBeUndefined();
    expect(purse.pendingUsd()).toBe(0);
    expect(purse.spentUsd()).toBe(0.001);
    expect(purse.refusal).toBeUndefined();
  });

  it("refuses in figures where only one fits, and puts back the refusal the run saw before it", async () => {
    const purse = pricedPurse(0.02);
    const shortfall = await automationStudioLlmBuildPurseRun(purse, async () => {
      const said = automationStudioTrialJudgingShortfall({ code: "candidate.trial_unaffordable" });
      // The probe's refusal is not the build's: the loop does not end on a call nobody made.
      expect(purse.refusal).toBeUndefined();
      return said;
    });
    expect(shortfall).toMatchObject({ code: "candidate.trial_unaffordable", judgeCalls: 2, judgeCallUsd: 0.0105, neededUsd: 0.021, refusedBy: "llm_budget.run_cost_limit", leftUsd: 0.019 });
    expect(shortfall?.happened).toMatch(/^Core did not start this trial: the build's money left cannot pay the 2 judge calls/u);
    expect(purse.pendingUsd()).toBe(0);
  });

  it("holds each call at the largest judge prompt an earlier trial sent, never below the standing one", () => {
    const purse = pricedPurse(0.03);
    expect(automationStudioTrialJudgingShortfall({ code: "c", purse, judgeInputTokens: 2_000 })).toBeUndefined();
    // 15,000 tokens a call, as the towels run's judges were sent: $0.0175 each, $0.035 for the pair.
    expect(automationStudioTrialJudgingShortfall({ code: "c", purse, judgeInputTokens: 15_000 })).toMatchObject({ judgeCallUsd: 0.0175, neededUsd: 0.035 });
    expect(automationStudioTrialLargestJudgePrompt([{ judge: { calls: 2, inputTokens: 30_000 } }, { judge: { calls: 0, inputTokens: 0 } }, { judge: { calls: 1, inputTokens: 9_000 } }])).toBe(15_000);
    expect(automationStudioTrialLargestJudgePrompt([{ judge: { calls: 0, inputTokens: 0 } }])).toBeUndefined();
  });

  it("says nothing outside any purse", () => {
    expect(automationStudioTrialJudgingShortfall({ code: "c" })).toBeUndefined();
  });
});

describe("a candidate trial the purse cannot judge", () => {
  it("does not start: no start hook, no session, no run and no judge call, and answers not_judged with the figures", async () => {
    const fixture = trialFixture();
    let hooked = 0;
    let executed = 0;
    fixture.ports.prepareStart = async () => {
      hooked += 1;
      return {};
    };
    fixture.ports.execute = async () => {
      executed += 1;
      throw new Error("the trial must not run");
    };
    const outcome = await automationStudioLlmBuildPurseScope(pricedPurse(0.02), () => runAutomationStudioCandidateTrial(fixture.request(), fixture.ports));
    expect(outcome.result).toMatchObject({ verdict: "not_judged", feedback: { code: "candidate.trial_unaffordable", neededUsd: 0.021, leftUsd: 0.019 } });
    expect(outcome.record).toMatchObject({ execution: "not_run", code: "candidate.trial_unaffordable", judge: { calls: 0, estimatedCostUsd: 0 } });
    expect(outcome.unjudged).toBeUndefined();
    expect([hooked, executed, fixture.sessions.length, fixture.judged.length]).toEqual([0, 0, 0, 0]);
  });

  it("runs as before where the purse can hold both", async () => {
    const fixture = trialFixture();
    fixture.ports.graphOptions = ({ signal }) => ({ signal, now: () => 100, nativeNodeExecutor: async () => ({ result: { status: "success", route: "success", outputs: {} } }) } as ReturnType<typeof fixture.ports.graphOptions>);
    const outcome = await automationStudioLlmBuildPurseScope(pricedPurse(0.05), () => runAutomationStudioCandidateTrial(fixture.request(), fixture.ports));
    expect(outcome.result.verdict).toBe("yes");
    expect(fixture.judged).toHaveLength(1);
  });

  it("the port puts nothing back ahead of a trial that will not start", async () => {
    const fixture = trialFixture();
    let hooked = 0;
    fixture.ports.prepareStart = async () => {
      hooked += 1;
      return {};
    };
    const { port } = automationStudioCandidateTrialPort("candidate.1", fixture.ports);
    const prepared = await automationStudioLlmBuildPurseScope(pricedPurse(0.02), () => port.prepareStart!({ revision: 1, digest: fixture.candidate.digest, signal: new AbortController().signal }));
    expect(prepared).toBe("none");
    expect(hooked).toBe(0);
  });
});
