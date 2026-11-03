// @fluxiq-test-group real-sql
import { describe, expect, it } from "vitest";
import { AutomationStudioProjectDatabasePool } from "../../../../storage/project/index.ts";
import { AutomationStudioProjectExecutionAdmissionStore } from "../../../../../../framework/persistence/project/execution-admission/index.ts";
import { sqlAdmissionFixture } from "../../../../storage/project/execution-admission/tests/fixture.ts";
import { AutomationStudioFlowCandidateTrialGate } from "../../../flow-bootstrap/candidate/index.ts";
import { AutomationStudioCandidateTrialModeOwner } from "../../mode/index.ts";
import { candidateAdmissionFixture } from "./fixture.ts";
import { AdmissionTestSource } from "../../../../../../runtime/execution-admission/tests/source.ts";

describe("one configured candidate source on persisted SQL history", () => {
  it.each(["throw", "lost acknowledgement"] as const)("blocks every new live entrance after the real counter increments then %s", async failure => sqlAdmissionFixture(async ({ store, root }) => {
    let counter = 0;
    let resets = 0;
    const actual = await candidateAdmissionFixture({ persistence: store, port: async () => {
      counter += 1;
      throw new Error(failure === "throw" ? "synthetic private callback detail" : "synthetic lost acknowledgement");
    } });
    const first = await actual.gate.test({});
    expect(counter).toBe(1);
    expect(JSON.stringify(first)).not.toContain("synthetic");
    expect((await actual.assembly.consumer.inspect(actual.scope)).state).toBe("pending");
    await expect(actual.gate.test({})).rejects.toThrow();
    await expect(actual.gate.test({ cannotUndo: [] })).rejects.toThrow();
    await actual.submit("a real changed revision");
    await expect(actual.gate.test({})).rejects.toThrow();
    const reset = { beforeTrial: async () => {
      resets += 1;
      return { kind: "admit" as const };
    }, trialRan: () => [] };
    const anotherGate = new AutomationStudioFlowCandidateTrialGate({ latest: () => actual.controller.latest(), trial: actual.trial, reset });
    await expect(anotherGate.test({})).rejects.toThrow();
    const nextPort: typeof actual.trial.port = async request => {
      counter += 1;
      return { revision: request.revision, digest: request.digest, verdict: "yes", feedback: {} };
    };
    const nextOwner = new AutomationStudioCandidateTrialModeOwner({ port: nextPort, candidateId: "candidate.next", environment: undefined, unjudged: new Map() });
    actual.configured.bind(nextOwner);
    const nextGate = new AutomationStudioFlowCandidateTrialGate({ latest: () => actual.controller.latest(), trial: { candidateId: "candidate.next", port: nextPort }, reset });
    await expect(nextGate.test({})).rejects.toThrow();
    const pool = new AutomationStudioProjectDatabasePool({ rootDir: root });
    const reopened = await AutomationStudioProjectExecutionAdmissionStore.open({ pool, projectId: "project.isolated" });
    try {
      const afterReopen = await candidateAdmissionFixture({ persistence: reopened, candidateId: "candidate.reopened", port: async request => {
        counter += 1;
        return { revision: request.revision, digest: request.digest, verdict: "yes", feedback: {} };
      }, reset });
      expect((await afterReopen.assembly.consumer.inspect(afterReopen.scope)).state).toBe("pending");
      await expect(afterReopen.gate.test({})).rejects.toThrow();
    } finally {
      await reopened.close();
      await pool.closeAll();
    }
    expect(counter).toBe(1);
    expect(resets).toBe(0);
  }));

  it("binds a real later port after the A1 registration fence is closed without registering another source", async () => sqlAdmissionFixture(async ({ store }) => {
    let calls = 0;
    const actual = await candidateAdmissionFixture({ persistence: store, noDispatch: true, port: async request => {
      calls += 1;
      return { revision: request.revision, digest: request.digest, verdict: "unsure", feedback: {} };
    } });
    await actual.gate.test({});
    expect(() => actual.assembly.registerSource(new AdmissionTestSource(actual.scope, "late.source"))).toThrow("registration_closed");
    const next = { candidateId: "candidate.later", port: async (request: Parameters<typeof actual.trial.port>[0]) => {
      calls += 1;
      return { revision: request.revision, digest: request.digest, verdict: "yes" as const, feedback: {} };
    } };
    actual.callbacks.manage({ receiver: next, callback: next.port, contract: "no_direct_effects" });
    const owner = new AutomationStudioCandidateTrialModeOwner({ port: next.port, candidateId: next.candidateId, environment: undefined, unjudged: new Map() });
    expect(actual.configured.bind(owner)).toBe(actual.configured.bind(owner));
    const gate = new AutomationStudioFlowCandidateTrialGate({ latest: () => actual.controller.latest(), trial: next });
    expect(await gate.test({})).toMatchObject({ evidence: { verdict: "yes" } });
    expect(calls).toBe(2);
    expect((await actual.assembly.consumer.inspect(actual.scope)).state).toBe("clear");
  }));
});
