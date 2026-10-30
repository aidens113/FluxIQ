// A single-subflow brief's whole-test port hands the scoped port's from-step
// run to the gate as it is (t804, `../whole-test-port.ts`): the whole test is
// never asked for it.
import { describe, expect, it } from "vitest";
import type { AutomationStudioSubflowFromStepPort, AutomationStudioSubflowTrialPreparingPort } from "../../../flow-bootstrap/subflow-candidate/index.ts";
import type { AutomationStudioProjectDispatchWholeTrial } from "../../dispatch/index.ts";
import { AutomationStudioProjectWholeTestPort } from "../whole-test-port.ts";

const unused = (): AutomationStudioSubflowTrialPreparingPort => async () => {
  throw new Error("not asked");
};

/** A whole test that records each time it is asked and never answers. */
function wholeTest(asked: unknown[]): AutomationStudioProjectDispatchWholeTrial {
  return async (request) => {
    asked.push(request);
    throw new Error("not asked");
  };
}

describe("the whole-test port, from a step", () => {
  it("hands the scoped port's from-step run through, never asking the whole test", () => {
    const asked: unknown[] = [];
    const fromStep: AutomationStudioSubflowFromStepPort = async () => {
      throw new Error("not asked");
    };
    const scoped = unused();
    Object.assign(scoped, { fromStep });
    const whole = new AutomationStudioProjectWholeTestPort(wholeTest(asked), scoped, (port) => port);
    expect(whole.port.fromStep).toBe(fromStep);
    expect(asked).toEqual([]);
  });

  it("offers none without a scoped port that offers one", () => {
    expect(new AutomationStudioProjectWholeTestPort(wholeTest([]), unused(), (port) => port).port.fromStep).toBeUndefined();
    expect(new AutomationStudioProjectWholeTestPort(wholeTest([]), undefined, (port) => port).port.fromStep).toBeUndefined();
  });
});
