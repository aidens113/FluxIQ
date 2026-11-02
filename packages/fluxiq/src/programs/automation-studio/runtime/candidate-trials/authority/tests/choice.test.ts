import { describe, expect, it } from "vitest";
import { AdmissionTestPersistence } from "../../../../../../runtime/execution-admission/tests/persistence.ts";
import { automationStudioOfflineFirstWhole } from "../../../service/offline-first/index.ts";
import { trialFixture } from "../../../service/candidate-trial/tests/fixtures.ts";
import { bindTrialExecutionSource } from "../../observation/index.ts";
import { candidateAdmissionFixture } from "./fixture.ts";
import { offlineHarness } from "../../../service/offline-trial/tests/offline-harness.ts";

describe("the public whole offline choice is not a readonly capability", () => {
  it.each(["returned", "threw"] as const)("admits its original unknown callback before it %s, then refuses a second call on the same series", async outcome => {
    const persistence = new AdmissionTestPersistence();
    const f = await candidateAdmissionFixture({ persistence, port: async () => { throw new Error("unused fixture port"); } });
    const actual = trialFixture();
    bindTrialExecutionSource(actual.ports, f.configured);
    let calls = 0;
    const offline = await offlineHarness();
    try {
      const choices = automationStudioOfflineFirstWhole({ candidateId: "candidate.1", ports: actual.ports, phase: "test", liveRecords: () => {
        calls += 1;
        expect(persistence.events.at(-1)).toBe("enter");
        if (outcome === "threw") throw new Error("synthetic unknown choice acknowledgement lost");
        return [];
      }, installation: { gateway: offline.gateway, storeFor: () => offline.store, sessionViewFor: () => undefined } });
      if (outcome === "threw") await expect(choices.offlineFirst(actual.request())).rejects.toThrow("synthetic unknown choice");
      else expect(await choices.offlineFirst(actual.request())).toMatchObject({ kind: "live", note: { outcome: "not_tried" } });
      expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("pending");
      await expect(choices.offlineFirst(actual.request())).rejects.toThrow();
      const ordinary = { write() {
        calls++;
        return "a second write must not run";
      } };
      await expect(f.ordinary.invoke({ receiver: ordinary, callback: ordinary.write, args: [] })).rejects.toThrow();
      const reopened = await candidateAdmissionFixture({ persistence, port: async () => { throw new Error("unused reopened fixture port"); } });
      await expect(reopened.ordinary.invoke({ receiver: ordinary, callback: ordinary.write, args: [] })).rejects.toThrow();
      expect(calls).toBe(1);
      expect(actual.sessions).toEqual([]);
      expect(actual.judged).toEqual([]);
    } finally { await offline.close(); }
  });
});
