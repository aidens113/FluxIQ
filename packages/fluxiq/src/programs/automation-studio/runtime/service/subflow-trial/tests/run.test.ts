import { describe, expect, it } from "vitest";
import { AutomationStudioHostLeaseScope, AutomationStudioHostResourceScheduler } from "../../../project-agents/host-resources/index.ts";
import { StubHost } from "../../../project-agents/host-resources/tests/stub-host.ts";
import type { AutomationStudioPrepareCandidateStart } from "../../candidate-trial/index.ts";
import { runAutomationStudioSubflowTrial } from "../index.ts";
import { part, subflowTrialFixture as fixture } from "./fixtures.ts";

describe("the success check a partial trial is judged against (t569)", () => {
  const check = [{ fact: "page.ended", op: "exists" as const }];

  it("is the plan's when the scope has one, said as the plan's", async () => {
    const f = fixture();
    const request = f.request();
    request.scope.successCheck = structuredClone(check);
    await runAutomationStudioSubflowTrial(request, f.ports);
    expect(f.judged[0]!.successCheck).toEqual({ check, from: "plan" });
  });

  it("is the one the tried proposal carries, its builder's, when the plan gives none", async () => {
    const f = fixture();
    const request = f.request();
    request.proposal.subflows[0]!.metadata = { "fluxiq.successCheck": structuredClone(check) };
    const { record } = await runAutomationStudioSubflowTrial(request, f.ports);
    expect(record.execution, JSON.stringify(record)).toBe("succeeded");
    expect(f.judged[0]!.successCheck).toEqual({ check, from: "builder" });
  });
});

describe("one subflow partial trial", () => {
  it("runs the predecessor then the brief's subflow under a session marked as a subflow trial, and asks the scoped judge", async () => {
    const f = fixture();
    const { result, record } = await runAutomationStudioSubflowTrial(f.request(), f.ports);
    expect(f.pressed.map((id) => id.split(".").at(-2))).toEqual(["find", "add"]);
    expect(result).toMatchObject({ partial: true, scope: "subflow", identity: { buildId: "build.1", briefId: "brief.add", planDigest: "plan.1", subflowKey: "add" }, revision: 3, digest: "add.3", verdict: "yes", entryPrepared: true, trialRunId: "subflow-trial.1" });
    expect(result.feedback).toMatchObject({ partial: true, entryPrepared: true });
    // The predecessor's act and the subflow's own act both landed and are both answered.
    expect(result.acts).toHaveLength(2);
    expect(record).toMatchObject({ execution: "succeeded", entryPrepared: true, verdict: "yes", judge: { calls: 2, estimatedCostUsd: 0.002 } });
    // The injected judge is handed the trial's summary and the brief's scope, nothing else.
    expect(f.judged).toHaveLength(1);
    expect(Object.keys(f.judged[0]!)).toEqual(["summary", "scope"]);
    expect(f.judged[0]!.scope.parts).toEqual([{ partId: "part.2", sourceId: "instruction", text: "add it to the list" }]);
    // The session is the trial's own, marked as a subflow trial and never as an adaptive run or a whole candidate's trial.
    expect(f.sessions.map((session) => session.status)).toEqual(["queued", "running", "succeeded"]);
    expect(f.sessions[0]!.metadata).toEqual({ subflowTrial: { buildId: "build.1", briefId: "brief.add", subflowKey: "add", revision: 3, digest: "add.3" } });
    expect(f.sessions.at(-1)!.metadata).toMatchObject({ subflowTrial: { buildId: "build.1", briefId: "brief.add", execution: "succeeded", entryPrepared: true, start: "not_reset" } });
    for (const session of f.sessions) {
      expect(session.metadata).not.toHaveProperty("adaptiveRuntime");
      expect(session.metadata).not.toHaveProperty("candidateTrial");
    }
  });

  it("answers a failed predecessor as an entry not prepared, with the predecessor's acts, and never asks the judge", async () => {
    const f = fixture();
    f.failIn("find");
    const { result, record } = await runAutomationStudioSubflowTrial(f.request(), f.ports);
    expect(f.pressed.every((id) => id.includes(".find."))).toBe(true);
    expect(result).toMatchObject({ partial: true, verdict: "execution_failed", entryPrepared: false, feedback: { code: "subflow.trial_predecessor_failed", failedPredecessor: "find", partial: true, entryPrepared: false } });
    expect(record).toMatchObject({ execution: "failed", entryPrepared: false, failedPredecessor: "find", code: "subflow.trial_predecessor_failed", judge: { calls: 0 } });
    expect(f.judged).toEqual([]);
  });

  it("answers the target's own failure from a prepared entry, with the predecessor's landed act", async () => {
    const f = fixture();
    f.failIn("add");
    const { result } = await runAutomationStudioSubflowTrial(f.request(), f.ports);
    expect(result).toMatchObject({ partial: true, verdict: "execution_failed", entryPrepared: true });
    expect(result.acts).toHaveLength(1);
    expect(f.judged).toEqual([]);
  });

  it("runs nothing when a predecessor has no proposal, or one against another plan", async () => {
    const f = fixture();
    f.setPredecessors([]);
    const missing = await runAutomationStudioSubflowTrial(f.request(), f.ports);
    expect(missing.result).toMatchObject({ verdict: "execution_failed", entryPrepared: false, feedback: { code: "subflow.trial_predecessor_missing", missing: ["find"] } });
    f.setPredecessors([{ ...f.findProposal, scope: { ...f.findProposal.scope, planDigest: "plan.0" } }]);
    const stale = await runAutomationStudioSubflowTrial(f.request(), f.ports);
    expect(stale.result).toMatchObject({ verdict: "execution_failed", feedback: { code: "subflow.trial_predecessor_stale", stale: ["find"] } });
    expect(f.sessions).toEqual([]);
    expect(f.pressed).toEqual([]);
  });

  it("runs nothing for a proposal bound to another brief or headed by another subflow", async () => {
    const f = fixture();
    const otherBrief = f.request();
    otherBrief.proposal = { ...otherBrief.proposal, scope: { ...otherBrief.proposal.scope, briefId: "brief.other" } };
    const otherHead = f.request();
    otherHead.proposal = { ...otherHead.proposal, subflows: [part("find", "utility")] };
    for (const request of [otherBrief, otherHead]) {
      const { result, record } = await runAutomationStudioSubflowTrial(request, f.ports);
      expect(result).toMatchObject({ partial: true, verdict: "execution_failed", entryPrepared: false, feedback: { code: "subflow.trial_identity_mismatch" } });
      expect(record.execution).toBe("not_run");
    }
    expect(f.sessions).toEqual([]);
  });

  it("stops when a predecessor's proposal is replaced while the trial runs", async () => {
    const f = fixture();
    const press = f.ports.graphOptions;
    f.ports.graphOptions = (input) => {
      const options = press(input);
      const native = options.nativeNodeExecutor!;
      return { ...options, nativeNodeExecutor: async (request) => {
        const answer = await native(request);
        f.setPredecessors([{ ...f.findProposal, revision: 2, digest: "find.2" }]);
        return answer;
      } };
    };
    const { result } = await runAutomationStudioSubflowTrial(f.request(), f.ports);
    expect(result).toMatchObject({ verdict: "execution_failed", entryPrepared: false, feedback: { code: "candidate.execution_stale" } });
    expect(f.pressed).toHaveLength(1);
  });

  it("passes on what the site started with and throws a cancelled build before any judge call", async () => {
    const f = fixture();
    await runAutomationStudioSubflowTrial({ ...f.request(), startedWith: ["already done by this build (act-1): press button"] }, f.ports);
    expect(f.judged[0]!.summary.startedWith).toEqual(["already done by this build (act-1): press button"]);
    const controller = new AbortController();
    f.ports.processDatasets = async () => { controller.abort(new Error("cancelled")); };
    await expect(runAutomationStudioSubflowTrial(f.request(controller.signal), f.ports)).rejects.toThrow("cancelled");
    expect(f.judged).toHaveLength(1);
  });

  it("hands the start hook the brief's host lease under one, and no lease outside any (A11)", async () => {
    const seen: Array<Parameters<AutomationStudioPrepareCandidateStart>[0]> = [];
    const f = fixture();
    f.ports.prepareStart = async (input) => {
      seen.push(input);
      return { reset: input.lease?.resourceKey ?? "everything" };
    };
    const leases = new AutomationStudioHostLeaseScope(new AutomationStudioHostResourceScheduler(new StubHost({ capacity: 2 })));
    const leased = await leases.run({ role: "subflow_builder", briefId: "brief.add" }, async (lease) => ({ lease, outcome: await runAutomationStudioSubflowTrial(f.request(), f.ports) }));
    expect(seen[0]!.lease).toEqual(leased.lease);
    expect(leased.outcome.record.start).toEqual({ status: "reset", result: { reset: leased.lease.resourceKey } });
    const bare = await runAutomationStudioSubflowTrial(f.request(), f.ports);
    expect("lease" in seen[1]!).toBe(false);
    expect(bare.record.start).toEqual({ status: "reset", result: { reset: "everything" } });
  });
});
