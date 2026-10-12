// The recovery ladder's last words name what actually happens next (t428).
// Paid run R4a read "Trying again didn't help: FluxIQ tried the step again and
// it still didn't work, so the test follows what the Flow says to do when this
// step fails." The Flow had no way on from that step's failure, and the test
// simply ended there.

import { describe, expect, it } from "vitest";
import { automationStudioActivityRecoveryChoice } from "../index.ts";

const stop = (run: Parameters<typeof automationStudioActivityRecoveryChoice>[1]) => automationStudioActivityRecoveryChoice({ kind: "stop" }, run);
const FLOW_PATH = /follows what the Flow says/u;

describe("the recovery ladder's end, by what happens next", () => {
  it("names the Flow's own way on only when the Flow has one", () => {
    expect(stop({ attempts: 2, test: true, next: "on_fail" }).text).toBe("FluxIQ tried the step again and it still didn't work, so the test follows what the Flow says to do when this step fails.");
    for (const next of ["goes_on", "repair", "stop"] as const) expect(stop({ attempts: 2, test: true, next }).text).not.toMatch(FLOW_PATH);
  });

  it("says the run stops here when nothing takes it on and no fix comes", () => {
    expect(stop({ attempts: 2, test: true, next: "stop" })).toEqual({ title: "Trying again didn't help", text: "FluxIQ tried the step again and it still didn't work, so the test stops here at this step." });
    expect(stop({ attempts: 1, retryable: false, next: "stop" }).text).toBe("Another try wouldn't change what happened, so the run stops here at this step.");
    expect(stop({ attempts: 1, mayAbsorb: false, next: "stop" }).text).toBe("The run has already waited as long as it may, so it stops here at this step.");
    expect(stop({ attempts: 1, actUncertain: true, next: "stop" }).text).toBe("FluxIQ can't tell whether the step went through, and repeating it could do it twice, so the run stops here at this step.");
  });

  it("says FluxIQ will look at the page and fix the step when an in-run fix comes", () => {
    expect(stop({ attempts: 2, next: "repair" }).text).toBe("FluxIQ tried the step again and it still didn't work, so FluxIQ will look at the page and fix this step before going on.");
    expect(stop({ attempts: 1, retryable: true, next: "repair" }).text).toBe("The step didn't work, so FluxIQ will look at the page and fix this step before going on.");
  });

  it("says the run carries on past a step the Flow can finish without", () => {
    expect(stop({ attempts: 1, retryable: false, test: true, next: "goes_on" }).text).toBe("Another try wouldn't change what happened, so the test carries on past this step, since the Flow can finish without it.");
  });

  it("promises nothing when it is not told what comes next", () => {
    expect(stop({ attempts: 1 }).text).toBe("The step didn't work, so the run stops here at this step.");
  });

  it("uses plain words, with no codes or graph terms", () => {
    for (const next of ["on_fail", "goes_on", "repair", "stop"] as const) {
      for (const run of [{ attempts: 1 }, { attempts: 2 }, { attempts: 1, actUncertain: true }, { attempts: 1, mayAbsorb: false }, { attempts: 1, retryable: false }]) {
        const said = stop({ ...run, next });
        expect(`${said.title} ${said.text}`).not.toMatch(/\b(handle|handler|node|port|resubmit)\b|\{|_/iu);
      }
    }
  });
});
