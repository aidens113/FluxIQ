// A purse's refusal is carried per run (t534): two runs on one purse at once
// each read the refusal they met, and one run alone behaves as the single field
// always did.
import { describe, expect, it } from "vitest";
import { AutomationStudioLlmBuildPurse, AutomationStudioLlmBuildPurseRefused, automationStudioLlmBuildPurseRun, automationStudioLlmBuildPurseScope, type AutomationStudioLlmBuildPurseCall } from "../index.ts";

const call = (projectedCostUsd: number): AutomationStudioLlmBuildPurseCall => ({ projectedCostUsd, estimatedInputTokens: 1_000, maxOutputTokens: 100 });

function gate(): { opened: Promise<void>; open: () => void } {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => { open = resolve; });
  return { opened, open };
}

describe("a refusal met by one of two runs on one purse", () => {
  it("ends that run alone, even when the other run begins after it and ends before it", async () => {
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1 });
    const refusedFirst = gate();
    const secondDone = gate();
    const refusing = automationStudioLlmBuildPurseRun(purse, async () => {
      expect(purse.hold(call(0.2)).ok).toBe(false);
      refusedFirst.open();
      // The other run starts -- once clearing the shared field -- and finishes while this one is still going.
      await secondDone.opened;
      return "a caller that read the failure as something else";
    });
    await refusedFirst.opened;
    const clean = automationStudioLlmBuildPurseRun(purse, async () => {
      expect(purse.refusal).toBeUndefined();
      const held = purse.hold(call(0.01));
      if (held.ok) held.hold.settle({ estimatedCostUsd: 0.01 });
      return "clean";
    });
    await expect(clean).resolves.toBe("clean");
    secondDone.open();
    await expect(refusing).rejects.toBeInstanceOf(AutomationStudioLlmBuildPurseRefused);
  });

  it("never reaches a run beside it that met none, however they interleave", async () => {
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1 });
    const bothStarted = gate();
    const refused = gate();
    let started = 0;
    const begin = async (): Promise<void> => {
      started += 1;
      if (started === 2) bothStarted.open();
      await bothStarted.opened;
    };
    const quiet = automationStudioLlmBuildPurseRun(purse, async () => {
      await begin();
      await refused.opened;
      // A judge reading the purse's refusal before and after its call sees none of the other run's.
      expect(purse.refusal).toBeUndefined();
      return "quiet";
    });
    const loud = automationStudioLlmBuildPurseRun(purse, async () => {
      await begin();
      expect(purse.hold(call(0.5)).ok).toBe(false);
      expect(purse.refusal).toMatchObject({ code: "llm_budget.run_cost_limit" });
      refused.open();
      return "loud";
    });
    await expect(loud).rejects.toMatchObject({ refusal: { code: "llm_budget.run_cost_limit", ceilingUsd: 0.1 } });
    await expect(quiet).resolves.toBe("quiet");
    // Outside any run, the purse's own last refusal remains readable.
    expect(purse.refusal).toMatchObject({ code: "llm_budget.run_cost_limit" });
  });
});

describe("one run alone, as before", () => {
  it("clears a refusal an earlier run met before it begins", async () => {
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1 });
    await expect(automationStudioLlmBuildPurseRun(purse, async () => purse.hold(call(0.2)))).rejects.toBeInstanceOf(AutomationStudioLlmBuildPurseRefused);
    expect(purse.refusal).toBeDefined();
    await expect(automationStudioLlmBuildPurseRun(purse, async () => "next")).resolves.toBe("next");
    expect(purse.refusal).toBeUndefined();
  });

  it("is seen by the scope around it, and a run nested in a scope clears the scope's view as it begins", async () => {
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1 });
    await automationStudioLlmBuildPurseScope(purse, async () => {
      await expect(automationStudioLlmBuildPurseRun(purse, async () => purse.hold(call(0.2)))).rejects.toBeInstanceOf(AutomationStudioLlmBuildPurseRefused);
      expect(purse.refusal).toMatchObject({ code: "llm_budget.run_cost_limit" });
      await automationStudioLlmBuildPurseRun(purse, async () => undefined);
      expect(purse.refusal).toBeUndefined();
      // A refusal set from outside the harness -- the instruction reading's (`creation-purse.ts`) -- reaches the run that set it.
      const reading = { code: "llm_budget.run_cost_limit" as const, estimatedInputTokens: 1, maxOutputTokens: 1, spentUsd: 0.1, pendingUsd: 0, ceilingUsd: 0.1 };
      await expect(automationStudioLlmBuildPurseRun(purse, async () => { purse.refusal = reading; })).rejects.toMatchObject({ refusal: reading });
      expect(purse.refusal).toEqual(reading);
    });
  });

  it("a refusal met in a nested run of the same purse ends the outer run too", async () => {
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1 });
    const outer = automationStudioLlmBuildPurseRun(purse, async () => {
      try {
        await automationStudioLlmBuildPurseRun(purse, async () => purse.hold(call(0.2)));
      } catch {
        return "swallowed by a caller";
      }
      return "not reached";
    });
    await expect(outer).rejects.toBeInstanceOf(AutomationStudioLlmBuildPurseRefused);
  });
});
