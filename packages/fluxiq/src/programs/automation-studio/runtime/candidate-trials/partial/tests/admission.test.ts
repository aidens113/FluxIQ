// @fluxiq-test-group real-sql
import { describe, expect, it } from "vitest";
import { AutomationStudioProjectDatabasePool } from "../../../../storage/project/index.ts";
import { AutomationStudioProjectExecutionAdmissionStore } from "../../../../storage/project/execution-admission/index.ts";
import { sqlAdmissionFixture } from "../../../../storage/project/execution-admission/tests/fixture.ts";
import { AdmissionTestSource } from "../../../../../../runtime/execution-admission/tests/source.ts";
import type { AutomationStudioSubflowTrialPreparingPort, AutomationStudioSubflowTrialRequest, AutomationStudioSubflowTrialResult } from "../../../flow-bootstrap/subflow-candidate/index.ts";
import { bindTrialExecutionSource } from "../../observation/index.ts";
import { partialAdmissionFixture } from "./fixture.ts";

describe("partial trials share the actual persisted candidate series", () => {
  it.each(["throw", "lost acknowledgement"] as const)("does not reset, start or dispatch twice after a real counter increment and %s", async failure => sqlAdmissionFixture(async ({ store, root }) => {
    let counter = 0;
    let starts = 0;
    let resets = 0;
    let postReads = 0;
    const prepareStart = async () => {
      starts += 1;
      return "none" as const;
    };
    const port: AutomationStudioSubflowTrialPreparingPort = Object.assign(async () => {
      counter += 1;
      throw new Error(failure === "throw" ? "synthetic private partial stimulus" : "synthetic private lost acknowledgement");
    }, { prepareStart });
    const reset = { beforeTrial: async () => {
      resets += 1;
      return { kind: "admit" as const };
    }, trialRan: () => {
      postReads++;
      return [];
    } };
    const f = await partialAdmissionFixture({ persistence: store, port, reset });
    // These exact fixture hooks only count calls; the unknown port below performs the simulated write.
    f.callbacks.manage({ receiver: port, callback: prepareStart, contract: "no_direct_effects" });
    f.callbacks.manage({ receiver: reset, callback: reset.beforeTrial, contract: "no_direct_effects" });
    f.callbacks.manage({ receiver: reset, callback: reset.trialRan, contract: "no_direct_effects" });
    const first = await f.gate.test(f.receipt());
    expect(first).toMatchObject({ evidence: { verdict: "execution_failed" } });
    expect(JSON.stringify(first)).not.toContain("synthetic private");
    expect(counter).toBe(1);
    expect(starts).toBe(1);
    expect(resets).toBe(1);
    expect(postReads).toBe(1);
    expect((await f.assembly.consumer.inspect(f.executionScope)).state).toBe("pending");
    await expect(f.gate.test(f.receipt())).rejects.toThrow();
    await expect(f.gate.test({ ...f.receipt(), cannotUndo: [] })).rejects.toThrow();
    const revised = await f.submit("a genuine changed partial revision");
    expect(revised.revision).toBeGreaterThan(f.proposal.revision);
    expect(revised.digest).not.toBe(f.proposal.digest);
    await expect(f.newGate().test(f.receipt())).rejects.toThrow();
    const later: AutomationStudioSubflowTrialPreparingPort = async () => {
      counter += 1;
      throw new Error("a later port must not run");
    };
    bindTrialExecutionSource(later, f.configured);
    await expect(f.newGate(later).test(f.receipt())).rejects.toThrow();
    const pool = new AutomationStudioProjectDatabasePool({ rootDir: root });
    const reopened = await AutomationStudioProjectExecutionAdmissionStore.open({ pool, projectId: "project.isolated" });
    try {
      const reopenedPort: AutomationStudioSubflowTrialPreparingPort = async () => {
        counter += 1;
        throw new Error("a reopened partial port must not run");
      };
      const independent = await partialAdmissionFixture({ persistence: reopened, port: reopenedPort, reset });
      await expect(independent.gate.test(independent.receipt())).rejects.toThrow();
    } finally {
      await reopened.close();
      await pool.closeAll();
    }
    expect(counter).toBe(1);
    expect(starts).toBe(1);
    expect(resets).toBe(1);
    expect(postReads).toBe(1);
  }));

  it("closes a genuine no-dispatch callback and binds a later partial port after registration is closed", async () => {
    let calls = 0;
    const pure = async (request: AutomationStudioSubflowTrialRequest): Promise<AutomationStudioSubflowTrialResult> => {
      calls += 1;
      return { partial: true, scope: "subflow", identity: request.proposal.scope, revision: request.proposal.revision, digest: request.proposal.digest, verdict: "unsure", feedback: {}, entryPrepared: true };
    };
    const f = await partialAdmissionFixture({ port: pure, noDispatch: true });
    expect(await f.gate.test(f.receipt())).toMatchObject({ evidence: { verdict: "unsure" } });
    expect((await f.assembly.consumer.inspect(f.executionScope)).state).toBe("clear");
    expect(() => f.assembly.registerSource(new AdmissionTestSource(f.executionScope, "too.late"))).toThrow("registration_closed");
    const later: AutomationStudioSubflowTrialPreparingPort = request => pure(request);
    f.callbacks.manage({ receiver: undefined, callback: later, contract: "no_direct_effects" });
    bindTrialExecutionSource(later, f.configured);
    expect(await f.newGate(later).test(f.receipt())).toMatchObject({ evidence: { verdict: "unsure" } });
    expect(calls).toBe(2);
    expect((await f.assembly.consumer.inspect(f.executionScope)).state).toBe("clear");
  });
});
