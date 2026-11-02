import { describe, expect, it } from "vitest";
import { automationStudioCandidateTrialPort } from "../../../service/candidate-trial/index.ts";
import { trialFixture } from "../../../service/candidate-trial/tests/fixtures.ts";
import { bindTrialExecutionSource } from "../../observation/index.ts";
import { candidateAdmissionFixture } from "./fixture.ts";

describe("a configured whole port needs its original gate checkout", () => {
  it("refuses direct run and bare prepare before starting a hook or native callback", async () => {
    const f = await candidateAdmissionFixture({ port: async () => { throw new Error("unused fixture port"); } });
    const actual = trialFixture();
    let starts = 0;
    let dispatched = 0;
    actual.ports.prepareStart = async () => {
      starts += 1;
      return { reset: true };
    };
    actual.ports.graphOptions = () => ({ nativeNodeExecutor: async () => {
      dispatched += 1;
      throw new Error("an unadmitted whole callback must not run");
    } });
    bindTrialExecutionSource(actual.ports, f.configured);
    const trials = automationStudioCandidateTrialPort("candidate.1", actual.ports);
    const request = actual.request();
    await expect(trials.port(request)).rejects.toThrow("candidate.trial_checkout_required");
    await expect(trials.port.prepareStart!({ revision: request.revision, digest: request.digest, signal: request.signal })).rejects.toThrow("candidate.trial_checkout_required");
    expect(starts).toBe(0);
    expect(dispatched).toBe(0);
    expect(actual.sessions).toEqual([]);
    expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("clear");
  });
});
