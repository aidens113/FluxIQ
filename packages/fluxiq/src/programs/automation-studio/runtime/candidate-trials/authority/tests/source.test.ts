// @fluxiq-test-group real-sql
import { describe, expect, it } from "vitest";
import { AdmissionTestPersistence } from "../../../../../../runtime/execution-admission/tests/persistence.ts";
import { candidateTrialReentry } from "../../reentry/index.ts";
import { candidateAdmissionFixture } from "./fixture.ts";
import { AutomationStudioProjectDatabasePool } from "../../../../storage/project/index.ts";
import { AutomationStudioProjectExecutionAdmissionStore } from "../../../../storage/project/execution-admission/index.ts";
import { sqlAdmissionFixture } from "../../../../storage/project/execution-admission/tests/fixture.ts";

describe("candidate source completion", () => {
  it("issues one repeat credit only after original managed callback and durable child/root completion", async () => {
    let calls = 0;
    const fixture = await candidateAdmissionFixture({ noDispatch: true, port: async request => {
      calls += 1;
      return { revision: request.revision, digest: request.digest, verdict: "unsure", feedback: {} };
    } });
    const loop = {};
    fixture.gate.bindReentry(loop);
    const value = { revision: fixture.candidate.revision, digest: fixture.candidate.digest };
    await fixture.gate.test(value);
    expect((await fixture.assembly.consumer.inspect(fixture.scope)).state).toBe("clear");
    expect(candidateTrialReentry(loop)?.claim({ ...fixture.gate.tool }, value)).toBe(false);
    expect(candidateTrialReentry(loop)?.claim(fixture.gate.tool, { ...value, digest: "copied" })).toBe(false);
    expect(candidateTrialReentry(loop)?.claim(fixture.gate.tool, value)).toBe(true);
    expect(candidateTrialReentry(loop)?.claim(fixture.gate.tool, value)).toBe(false);
    expect(calls).toBe(1);
  });

  it("keeps a returned unsupported callback unknown and blocks another trial despite forged result flags", async () => {
    let calls = 0;
    const fixture = await candidateAdmissionFixture({ port: async request => {
      calls += 1;
      return { revision: request.revision, digest: request.digest, verdict: "unsure", feedback: { effectApplied: false, targetsUnchanged: true, resultReason: "retry_allowed", disposition: "unacted" } };
    } });
    const loop = {};
    fixture.gate.bindReentry(loop);
    const value = { revision: fixture.candidate.revision, digest: fixture.candidate.digest };
    await fixture.gate.test(value);
    expect(candidateTrialReentry(loop)?.claim(fixture.gate.tool, value)).toBe(false);
    expect((await fixture.assembly.consumer.inspect(fixture.scope)).state).toBe("pending");
    await expect(fixture.gate.test(value)).rejects.toThrow();
    const ordinary = { write() {
      calls++;
      return "a second write must not run";
    } };
    await expect(fixture.ordinary.invoke({ receiver: ordinary, callback: ordinary.write, args: [] })).rejects.toThrow();
    expect(calls).toBe(1);
  });

  it("persists an unsupported fulfilled callback's actual write and blocks ordinary entry and an independent SQL reopen", async () => sqlAdmissionFixture(async ({ store, root }) => {
    let writes = 0;
    const fixture = await candidateAdmissionFixture({ persistence: store, port: async request => {
      writes++;
      return { revision: request.revision, digest: request.digest, verdict: "unsure", feedback: {} };
    } });
    expect(await fixture.gate.test({})).toMatchObject({ evidence: { verdict: "unsure" } });
    expect(writes).toBe(1);
    const later = { write() {
      writes++;
      return "a second write must not run";
    } };
    await expect(fixture.ordinary.invoke({ receiver: later, callback: later.write, args: [] })).rejects.toThrow();
    const pool = new AutomationStudioProjectDatabasePool({ rootDir: root });
    const reopened = await AutomationStudioProjectExecutionAdmissionStore.open({ pool, projectId: "project.isolated" });
    try {
      const independent = await candidateAdmissionFixture({ persistence: reopened, port: async request => {
        writes++;
        return { revision: request.revision, digest: request.digest, verdict: "unsure", feedback: {} };
      } });
      await expect(independent.gate.test({})).rejects.toThrow();
      await expect(independent.ordinary.invoke({ receiver: later, callback: later.write, args: [] })).rejects.toThrow();
    } finally {
      await reopened.close();
      await pool.closeAll();
    }
    expect(writes).toBe(1);
    expect((await fixture.assembly.consumer.inspect(fixture.scope)).state).toBe("pending");
  }));

  it("does not turn an unverified baseline into live reentry credit even after managed no-dispatch callbacks", async () => {
    let calls = 0;
    const fixture = await candidateAdmissionFixture({ baseline: "unverified", noDispatch: true, port: async request => {
      calls += 1;
      return { revision: request.revision, digest: request.digest, verdict: "not_judged", feedback: {} };
    } });
    const loop = {};
    fixture.gate.bindReentry(loop);
    await fixture.gate.test({});
    expect((await fixture.assembly.consumer.inspect(fixture.scope)).state).toBe("unverified");
    expect(candidateTrialReentry(loop)?.claim(fixture.gate.tool, {})).toBe(false);
    await expect(fixture.gate.test({})).rejects.toThrow();
    expect(calls).toBe(1);
  });

  it("allows only one overlapping gate invocation before the real callback returns", async () => {
    let release!: () => void;
    let entered!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    let calls = 0;
    const fixture = await candidateAdmissionFixture({ noDispatch: true, port: async request => {
      calls += 1;
      entered();
      await pending;
      return { revision: request.revision, digest: request.digest, verdict: "unsure", feedback: {} };
    } });
    const first = fixture.gate.test({});
    await started;
    expect(await fixture.gate.test({})).toMatchObject({ evidence: { code: "candidate.trial_in_flight" } });
    release();
    await first;
    expect(calls).toBe(1);
  });

  it("uses a new completed ordinal for a real changed revision without reviving its old request credit", async () => {
    const fixture = await candidateAdmissionFixture({ noDispatch: true, port: async request => ({ revision: request.revision, digest: request.digest, verdict: "unsure", feedback: {} }) });
    const loop = {};
    fixture.gate.bindReentry(loop);
    await fixture.gate.test({});
    const first = { revision: fixture.candidate.revision, digest: fixture.candidate.digest };
    expect(candidateTrialReentry(loop)?.claim(fixture.gate.tool, first)).toBe(true);
    const changed = await fixture.submit("changed actual validated plan");
    await fixture.gate.test({});
    expect(candidateTrialReentry(loop)?.claim(fixture.gate.tool, first)).toBe(false);
    expect(candidateTrialReentry(loop)?.claim(fixture.gate.tool, { revision: changed.revision, digest: changed.digest })).toBe(true);
  });

  it("aborts after durable reservation but before callback entry without executing or minting credit", async () => {
    const store = new AdmissionTestPersistence();
    let calls = 0;
    const fixture = await candidateAdmissionFixture({ persistence: store, noDispatch: true, port: async request => {
      calls += 1;
      return { revision: request.revision, digest: request.digest, verdict: "unsure", feedback: {} };
    } });
    const loop = {};
    fixture.gate.bindReentry(loop);
    const abort = new AbortController();
    const paused = store.pauseNext("reserve");
    const running = fixture.gate.test({}, abort.signal);
    await paused.entered;
    abort.abort();
    paused.release();
    await expect(running).rejects.toThrow();
    expect(calls).toBe(0);
    expect(candidateTrialReentry(loop)?.claim(fixture.gate.tool, {})).toBe(false);
    expect((await fixture.assembly.consumer.inspect(fixture.scope)).state).toBe("pending");
  });
});
