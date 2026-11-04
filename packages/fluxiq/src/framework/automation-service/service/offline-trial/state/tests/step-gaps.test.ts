// Which step each gap sits on: the nth command of an action is the nth attempt that dispatched
// it, a retry included, and a look belongs to the next step that acts.
import { describe, expect, it } from "vitest";
import type { ClientGatewayTraceStateEngineGap } from "../../../../../../client-gateway/index.ts";
import type { AutomationStudioTrialExecutedStep } from "../../../candidate-trial/index.ts";
import { automationStudioStateTrialStepGaps } from "../step-gaps.ts";

const attempt = (outputId: string) => ({ outputs: { outputId } }) as unknown as AutomationStudioTrialExecutedStep["attempt"];
const step = (outputId: string, failedFirst = 0): AutomationStudioTrialExecutedStep => ({ attempt: attempt(outputId), attempts: failedFirst + 1, absorbed: Array.from({ length: failedFirst }, () => ({ failed: attempt(outputId), retry: attempt(outputId) })) });
const gap = (ordinal: number, actionType: string): ClientGatewayTraceStateEngineGap => ({ ordinal, commandId: `c${ordinal}`, actionType, wentOn: true, reason: "argument_mismatch", cause: "state_rule", fields: [], recordedSequence: null });

describe("the step a state trial's gap sits on", () => {
  it("numbers a command by the attempt that dispatched it, a retry included", () => {
    const steps = [step("go"), step("read", 1), step("read")];
    const commands = ["go", "read", "read", "read"];
    const found = automationStudioStateTrialStepGaps({ steps, commands, gaps: [gap(3, "read"), gap(4, "read")] });
    expect(found.map((item) => item.step)).toEqual([2, 3]);
  });

  it("puts a look on the next step that acts, and at the end of the run on the last step", () => {
    const steps = [step("go"), step("read")];
    const commands = ["look", "go", "look", "read", "look"];
    expect(automationStudioStateTrialStepGaps({ steps, commands, gaps: [gap(1, "look"), gap(3, "look"), gap(5, "look")] }).map((item) => item.step)).toEqual([1, 2, 2]);
  });

  it("names no step for a run that ran none, and never drops a gap", () => {
    const found = automationStudioStateTrialStepGaps({ steps: [], commands: ["read"], gaps: [gap(1, "read")] });
    expect(found).toEqual([{ step: null, reason: "argument_mismatch", cause: "state_rule", actionType: "read", fields: [], wentOn: true }]);
  });
});
