import { describe, expect, it } from "vitest";
import type { AutomationStudioSubflowTrialPreparingPort, AutomationStudioSubflowTrialRequest, AutomationStudioSubflowTrialResult } from "../../../flow-bootstrap/subflow-candidate/index.ts";
import { bindPartialTrialReadOnly, type PartialTrialReadOnlyOwner } from "../index.ts";
import { partialAdmissionFixture } from "./fixture.ts";
import { automationStudioSubflowTrialPort, type AutomationStudioSubflowTrialPorts } from "../../../service/subflow-trial/index.ts";
import { bindTrialExecutionSource } from "../../observation/index.ts";

describe("a partial diagnosis has an actual retained-evidence owner", () => {
  it("keeps diagnosis available while live coverage is pending, with no new reservation, start, reset or promotion", async () => {
    let dispatches = 0;
    let starts = 0;
    let resets = 0;
    let judges = 0;
    let retained: { lease: object; result: AutomationStudioSubflowTrialResult; rows: string[] } | undefined;
    const prepareStart = async () => {
      starts += 1;
      return "none" as const;
    };
    const port: AutomationStudioSubflowTrialPreparingPort = Object.assign(async (request: AutomationStudioSubflowTrialRequest) => {
      dispatches += 1;
      const result: AutomationStudioSubflowTrialResult = { partial: true, scope: "subflow", identity: request.proposal.scope, revision: request.proposal.revision, digest: request.proposal.digest, verdict: "not_judged", feedback: {}, trialRunId: "partial.actual.run", entryPrepared: true };
      retained = { lease: Object.freeze({}), result, rows: ["actual isolated result"] };
      throw new Error("the first actual result acknowledgement was lost");
    }, { prepareStart });
    const reset = { beforeTrial: async () => {
      resets += 1;
      return { kind: "admit" as const };
    }, trialRan: () => [] };
    const f = await partialAdmissionFixture({ port, reset });
    f.callbacks.manage({ receiver: port, callback: prepareStart, contract: "no_direct_effects" });
    f.callbacks.manage({ receiver: reset, callback: reset.beforeTrial, contract: "no_direct_effects" });
    f.callbacks.manage({ receiver: reset, callback: reset.trialRan, contract: "no_direct_effects" });
    await f.gate.test(f.receipt());
    expect((await f.assembly.consumer.inspect(f.executionScope)).state).toBe("pending");
    const owner: PartialTrialReadOnlyOwner = {
      pin: request => retained?.result.digest === request.proposal.digest ? retained.lease : undefined,
      current: (lease, request) => retained?.lease === lease && retained.result.digest === request.proposal.digest,
      async run(lease, request) {
        if (!this.current(lease, request) || !retained) throw new Error("retained evidence lost");
        judges += 1;
        return { ...retained.result, verdict: retained.rows.length === 1 ? "yes" : "no", feedback: { rows: retained.rows.length } };
      }
    };
    f.callbacks.manage({ receiver: owner, callback: owner.pin, contract: "no_direct_effects" });
    f.callbacks.manage({ receiver: owner, callback: owner.current, contract: "no_direct_effects" });
    f.callbacks.manage({ receiver: owner, callback: owner.run, contract: "no_direct_effects" });
    bindPartialTrialReadOnly(port, f.callbacks, owner);
    bindPartialTrialReadOnly(port, f.callbacks, owner);
    const originalPersistence = f.persistence;
    const before = "events" in originalPersistence ? JSON.stringify(originalPersistence.events) : "";
    for (let count = 0; count < 2; count += 1) {
      const result = await f.gate.test(f.receipt());
      expect(result).toMatchObject({ evidence: { ok: false, verdict: "yes", checkedAgainst: "recorded_run", promotionCredit: false }, resultCode: "subflow.trial_offline_yes" });
      expect(f.gate.completion(f.receipt()).ok).toBe(false);
    }
    expect(judges).toBe(2);
    expect(dispatches).toBe(1);
    expect(starts).toBe(1);
    expect(resets).toBe(1);
    if ("events" in originalPersistence) expect(JSON.stringify(originalPersistence.events)).toBe(before);
    expect((await f.assembly.consumer.inspect(f.executionScope)).state).toBe("pending");
  });

  it.each(["missing", "foreign", "evicted"] as const)("refuses a %s retained lease with no live fallback", async loss => {
    let live = 0;
    let judged = 0;
    const port: AutomationStudioSubflowTrialPreparingPort = async () => {
      live += 1;
      throw new Error("the original actual invocation acknowledgement was lost");
    };
    const f = await partialAdmissionFixture({ port });
    await f.gate.test(f.receipt());
    const lease = Object.freeze({});
    let current = true;
    let checks = 0;
    const owner: PartialTrialReadOnlyOwner = {
      pin: () => loss === "missing" ? undefined : loss === "foreign" ? Object.freeze({}) : lease,
      current: original => {
        checks += 1;
        if (loss === "evicted" && checks === 2) current = false;
        return current && original === lease;
      },
      run: async () => {
        judged += 1;
        throw new Error("unavailable evidence cannot be judged");
      }
    };
    f.callbacks.manage({ receiver: owner, callback: owner.pin, contract: "no_direct_effects" });
    f.callbacks.manage({ receiver: owner, callback: owner.current, contract: "no_direct_effects" });
    f.callbacks.manage({ receiver: owner, callback: owner.run, contract: "no_direct_effects" });
    bindPartialTrialReadOnly(port, f.callbacks, owner);
    await expect(f.gate.test(f.receipt())).rejects.toThrow(/subflow.trial_readonly/);
    expect(live).toBe(1);
    expect(judged).toBe(0);
    expect((await f.assembly.consumer.inspect(f.executionScope)).state).toBe("pending");
  });

  it("does not infer no-dispatch authority from an offline label or an offline-first callback", async () => {
    let live = 0;
    let fallbackChecks = 0;
    const offlineFirst = async () => {
      fallbackChecks += 1;
      return { kind: "live" as const, note: { outcome: "not_tried" as const, why: "no authenticated retained lease" } };
    };
    const port: AutomationStudioSubflowTrialPreparingPort = Object.assign(async (request: AutomationStudioSubflowTrialRequest): Promise<AutomationStudioSubflowTrialResult> => {
      live += 1;
      return { partial: true, scope: "subflow", identity: request.proposal.scope, revision: request.proposal.revision, digest: request.proposal.digest, verdict: "not_judged", feedback: {}, entryPrepared: true };
    }, { environmentKind: "trace" as const, offlineFirst });
    const f = await partialAdmissionFixture({ port });
    // This exact choice only returns data; the actual live port remains unsupported.
    f.callbacks.manage({ receiver: port, callback: offlineFirst, contract: "no_direct_effects" });
    await f.gate.test(f.receipt());
    const checksBefore = fallbackChecks;
    await expect(f.newGate().test(f.receipt())).rejects.toThrow();
    expect(live).toBe(1);
    expect(fallbackChecks).toBe(checksBefore);
  });

  it("does not certify an unsupported callback merely because a readonly owner was bound", async () => {
    let calls = 0;
    const port: AutomationStudioSubflowTrialPreparingPort = async () => {
      calls += 1;
      throw new Error("the original committing acknowledgement was lost");
    };
    const f = await partialAdmissionFixture({ port });
    await f.gate.test(f.receipt());
    const owner: PartialTrialReadOnlyOwner = {
      pin: () => {
        calls += 1;
        throw new Error("an unsupported method must not run");
      },
      current: () => true,
      run: async () => { throw new Error("an unsupported method must not run"); }
    };
    bindPartialTrialReadOnly(port, f.callbacks, owner);
    await expect(f.gate.test(f.receipt())).rejects.toThrow("readonly_contract_missing");
    expect(calls).toBe(1);
  });

  it("keeps a direct canonical readonly port on its original diagnosis even when every live backend is unavailable", async () => {
    let live = 0;
    let judged = 0;
    let retained: AutomationStudioSubflowTrialResult | undefined;
    const f = await partialAdmissionFixture({ port: async request => {
      live += 1;
      retained = { partial: true, scope: "subflow", identity: request.proposal.scope, revision: request.proposal.revision, digest: request.proposal.digest, verdict: "not_judged", feedback: {}, entryPrepared: true };
      throw new Error("the first actual partial acknowledgement was lost");
    } });
    await f.gate.test(f.receipt());
    const unsupported = async () => { throw new Error("a readonly diagnosis must never reach a live backend"); };
    const ports: AutomationStudioSubflowTrialPorts = {
      projectId: "project.isolated", flowId: "flow.actual", sourceInstructionIds: ["instruction.isolated"], registry: f.registry, resolution: f.resolution,
      parentFlow: unsupported, currentBaseDigest: unsupported, snapshots: unsupported, deprecatedPublicationIds: unsupported,
      openSession: unsupported, writeSession: unsupported, graphOptions: () => { throw new Error("a readonly diagnosis must not create live graph options"); },
      processDatasets: unsupported, recordSets: unsupported, predecessorProposals: unsupported, judge: unsupported, prepareStart: unsupported
    };
    bindTrialExecutionSource(ports, f.configured);
    const actual = automationStudioSubflowTrialPort(f.scope.buildId, ports);
    const lease = Object.freeze({});
    const owner: PartialTrialReadOnlyOwner = {
      pin: request => retained?.digest === request.proposal.digest ? lease : undefined,
      current: (original, request) => original === lease && retained?.digest === request.proposal.digest,
      run: async () => {
        if (!retained) throw new Error("the original retained result was lost");
        judged += 1;
        return { ...retained, verdict: "yes" };
      }
    };
    f.callbacks.manage({ receiver: owner, callback: owner.pin, contract: "no_direct_effects" });
    f.callbacks.manage({ receiver: owner, callback: owner.current, contract: "no_direct_effects" });
    f.callbacks.manage({ receiver: owner, callback: owner.run, contract: "no_direct_effects" });
    bindPartialTrialReadOnly(actual.port, f.callbacks, owner);
    expect(await actual.port({ scope: f.scope, proposal: f.proposal, signal: new AbortController().signal })).toMatchObject({ partial: true, verdict: "yes" });
    expect(actual.records()).toEqual([]);
    expect(judged).toBe(1);
    expect(live).toBe(1);
    expect((await f.assembly.consumer.inspect(f.executionScope)).state).toBe("pending");
  });
});
