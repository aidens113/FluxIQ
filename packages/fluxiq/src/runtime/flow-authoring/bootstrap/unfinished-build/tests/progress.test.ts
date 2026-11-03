// What a repair measurably got further on (`../progress.ts`).
//
// Live run `run-musp4h2f-72e8ed99` (lane B, t193 round 1003): round 1 was
// judged no by both judge calls; round 2's first call said no and its second
// said yes (`model_disagreed`, so `unknown`). No measure covered a judge that
// stopped refuting, so the build stopped not finished on a Flow the second
// call accepted at 0.9. A `no` then an unsure pair in which neither call said
// yes (`model_unconfirmed`) is not that, and stays no progress.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowBootstrapJudgedWrong, AutomationStudioFlowBootstrapJudgement } from "../contracts.ts";
import { automationStudioFlowBootstrapJudgementProgress } from "../progress.ts";

const judged = (judge: AutomationStudioFlowBootstrapJudgedWrong): AutomationStudioFlowBootstrapJudgement => ({
  round: 1, stopped: "judged_wrong", tested: "replayed_clean", testIssueCodes: [], failedSteps: [], stepsInFlow: 6,
  done: 2, proven: 2, todo: [], lastIssueCodes: [], judge, flowSignature: "f"
});
const refuted = judged({ verdict: "no", findings: ["result.acts_judged_undone"], advice: "read the list after the confirms" });

describe("a judge that stopped refuting the Flow", () => {
  it("is progress when two agreeing calls said no, and then one of the next pair said yes (run-musp4h2f-72e8ed99)", () => {
    const disputed = judged({ verdict: "unknown", findings: ["checked twice, the answers differed"], oneCallSaidYes: true });
    expect(automationStudioFlowBootstrapJudgementProgress(refuted, disputed)).toEqual(["judge_no_longer_refutes"]);
  });

  it("is not progress when the next pair is unsure with no yes in it: a no, then nothing said (model_unconfirmed)", () => {
    const unconfirmed = judged({ verdict: "unknown", findings: ["checked twice, neither said yes"], unconfirmedReading: { advice: "read the list" } });
    expect(automationStudioFlowBootstrapJudgementProgress(refuted, unconfirmed)).toEqual([]);
  });

  it("is not this measure when the judge before was already unsure", () => {
    const unsure = judged({ verdict: "unknown", findings: ["unsure"] });
    const disputed = judged({ verdict: "unknown", findings: ["unsure"], oneCallSaidYes: true });
    expect(automationStudioFlowBootstrapJudgementProgress(unsure, disputed)).not.toContain("judge_no_longer_refutes");
  });
});
