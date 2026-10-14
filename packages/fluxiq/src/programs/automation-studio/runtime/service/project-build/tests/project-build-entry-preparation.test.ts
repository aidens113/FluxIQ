// A dependent builder's entry (`../entry-preparation.ts`, t580): its
// predecessors' latest passing proposals run once, in order, after the start
// and in a session of their own; where that cannot happen the answer says
// why. The detached runner and the trial environment are stubs. An answer
// says when the start was the deployment's start hook (`startReset`, t585), so
// the builder's ledgers can mark what it put back undone.

import { describe, expect, it } from "vitest";
import type { AutomationStudioSubflowProposal, AutomationStudioSubflowScope } from "../../../flow-bootstrap/subflow-candidate/index.ts";
import type { AutomationStudioDetachedSubflowInput, AutomationStudioDetachedSubflowResult } from "../../../flow-bootstrap/verification/index.ts";
import { automationStudioProjectBuildPrepareEntry, type AutomationStudioProjectBuildKeptProposals } from "../entry-preparation.ts";
import { AutomationStudioProjectBuildProposals } from "../proposals.ts";
import type { AutomationStudioProjectBuildTrialEnvironment } from "../whole-trials.ts";

const scopeOf = (subflowKey: string, briefId: string, predecessors: string[] = []): AutomationStudioSubflowScope => ({ buildId: "build-1", briefId, planDigest: "plan-1", subflowKey, parts: [], predecessors });

function proposalOf(scope: AutomationStudioSubflowScope, revision: number): AutomationStudioSubflowProposal {
  return { scope: { buildId: scope.buildId, briefId: scope.briefId, planDigest: scope.planDigest, subflowKey: scope.subflowKey }, revision, digest: `${scope.subflowKey}-${revision}`, subflows: [], summary: "", changedPaths: [] };
}

function harness(options: { startFails?: boolean; noHook?: boolean; keptUnder?: AutomationStudioProjectBuildKeptProposals["keptUnder"] } = {}) {
  const happened: string[] = [];
  const environment = {
    projectId: "project-1", flowId: "flow-1", sourceInstructionIds: ["instruction.build"], resolution: {},
    parentFlow: async () => ({}), currentBaseDigest: async () => "base-1", snapshots: async () => [], deprecatedPublicationIds: async () => [],
    ...(options.noHook ? {} : {
      prepareStart: async () => {
        happened.push("start");
        if (options.startFails) throw new Error("The site would not reset.");
        return {};
      }
    }),
    openSession: async ({ runId, metadata }: { runId: string; metadata: Record<string, unknown> }) => {
      happened.push(`open ${JSON.stringify(metadata)}`);
      return { runId, status: "queued", metadata };
    },
    writeSession: async (session: { status: string }) => { happened.push(`write ${session.status}`); },
    graphOptions: () => ({}),
    processDatasets: async () => { happened.push("datasets"); },
    recordSets: async () => []
  } as unknown as AutomationStudioProjectBuildTrialEnvironment;
  const ran: AutomationStudioDetachedSubflowInput[] = [];
  const result = (status: "succeeded" | "failed", failedPredecessor?: string): AutomationStudioDetachedSubflowResult => ({
    partial: true, entryPrepared: status === "succeeded", ...(failedPredecessor ? { failedPredecessor, code: "candidate.trial_failed" } : {}),
    receipt: { status, finishedAt: 2 } as unknown as AutomationStudioDetachedSubflowResult["receipt"]
  });
  // As the build wires them (`../run.ts`): the proposals answer which an amendment kept, where the test says so (t590).
  const proposals = Object.assign(new AutomationStudioProjectBuildProposals(), options.keptUnder ? { keptUnder: options.keptUnder } : {});
  const passed = (subflowKey: string, briefId: string, revision: number) => proposals.trialled(scopeOf(subflowKey, briefId), proposalOf(scopeOf(subflowKey, briefId), revision), "yes");
  const prepare = (scope: AutomationStudioSubflowScope, answer = result("succeeded")) => automationStudioProjectBuildPrepareEntry({
    scope, proposals, environment, signal: new AbortController().signal, newRunId: () => "entry-run-1",
    execute: async (input) => {
      happened.push("execute");
      ran.push(input);
      return answer;
    }
  });
  return { happened, ran, passed, proposals, prepare, result };
}

describe("a dependent builder's entry", () => {
  it("runs nothing for a subflow the build's start begins", async () => {
    const run = harness();
    expect(await run.prepare(scopeOf("first", "brief-1"))).toEqual({ kind: "start" });
    expect(run.happened).toEqual([]);
  });

  it("runs the predecessors' latest passing proposals in order, the last as the run's target, after the start and in a session of its own", async () => {
    const run = harness();
    run.passed("first", "brief-1", 1);
    run.passed("first", "brief-1", 3);
    run.passed("second", "brief-2", 2);
    // A later proposal that did not pass is not the one that runs.
    run.proposals.trialled(scopeOf("second", "brief-2"), proposalOf(scopeOf("second", "brief-2"), 4), "no");
    const entry = await run.prepare(scopeOf("third", "brief-3", ["first", "second"]));
    // The start was the deployment's hook, and the answer says so (t585).
    expect(entry).toEqual({ kind: "prepared", predecessors: ["first", "second"], runId: "entry-run-1", acts: [], startReset: true });
    expect(run.ran).toHaveLength(1);
    expect(run.ran[0]!.target).toMatchObject({ subflowKey: "second", revision: 2 });
    expect(run.ran[0]!.predecessors).toMatchObject([{ subflowKey: "first", revision: 3 }]);
    expect(run.ran[0]!.identity).toMatchObject({ buildId: "build-1", briefId: "brief-3", target: { subflowKey: "second", revision: 2 }, predecessors: [{ subflowKey: "first", revision: 3 }] });
    expect(run.happened[0]).toBe("start");
    expect(run.happened[1]).toContain(`"entryPreparation":{"buildId":"build-1","briefId":"brief-3","subflowKey":"third"`);
    expect(run.happened.slice(2)).toEqual(["write running", "execute", "datasets", "write succeeded"]);
  });

  it("says which predecessor has no passing proposal, and runs nothing", async () => {
    const run = harness();
    run.passed("first", "brief-1", 1);
    run.proposals.trialled(scopeOf("second", "brief-2"), proposalOf(scopeOf("second", "brief-2"), 1), "execution_failed");
    expect(await run.prepare(scopeOf("third", "brief-3", ["first", "second"]))).toEqual({ kind: "unprepared", predecessors: ["first", "second"], code: "project.entry_predecessor_missing", missing: ["second"], acts: [] });
    expect(run.happened).toEqual([]);
  });

  it("says which predecessor did not run to its end", async () => {
    const run = harness();
    run.passed("first", "brief-1", 1);
    run.passed("second", "brief-2", 1);
    const entry = await run.prepare(scopeOf("third", "brief-3", ["first", "second"]), run.result("failed", "first"));
    // The hook ran before the predecessor failed, so the site was still put back.
    expect(entry).toMatchObject({ kind: "unprepared", code: "candidate.trial_failed", failed: "first", runId: "entry-run-1", startReset: true });
    expect(run.happened.at(-1)).toBe("write failed");
  });

  it("says nothing of a start hook where the deployment has none", async () => {
    const run = harness({ noHook: true });
    run.passed("first", "brief-1", 1);
    const entry = await run.prepare(scopeOf("second", "brief-2", ["first"]));
    expect(entry).toMatchObject({ kind: "prepared", runId: "entry-run-1" });
    expect(entry).not.toHaveProperty("startReset");
  });

  it("runs no predecessor when the start failed", async () => {
    const run = harness({ startFails: true });
    run.passed("first", "brief-1", 1);
    expect(await run.prepare(scopeOf("second", "brief-2", ["first"]))).toMatchObject({ kind: "unprepared", code: "candidate.trial_start_failed" });
    expect(run.happened).toEqual(["start"]);
  });

  // An amendment that left a predecessor as it was keeps its passing proposal, made under the earlier plan (t590).
  it("runs a predecessor's passing proposal made under an earlier plan only when the plan in force kept it", async () => {
    const earlier = { ...scopeOf("first", "brief-1"), planDigest: "plan-0" };
    const asked: string[] = [];
    const kept = harness({
      keptUnder: (subflowKey, madeUnder, planDigest) => {
        asked.push(`${subflowKey} ${madeUnder} ${planDigest}`);
        return subflowKey === "first" && madeUnder === "plan-0" && planDigest === "plan-1";
      }
    });
    kept.proposals.trialled(earlier, proposalOf(earlier, 1), "yes");
    expect(await kept.prepare(scopeOf("second", "brief-2", ["first"]))).toMatchObject({ kind: "prepared", predecessors: ["first"] });
    expect(asked).toEqual(["first plan-0 plan-1"]);
    expect(kept.ran[0]!.target).toMatchObject({ subflowKey: "first", revision: 1 });

    // Proposals that cannot say, or say it was not kept: stale, and nothing runs.
    for (const run of [harness(), harness({ keptUnder: () => false })]) {
      run.proposals.trialled(earlier, proposalOf(earlier, 1), "yes");
      expect(await run.prepare(scopeOf("second", "brief-2", ["first"]))).toEqual({ kind: "unprepared", predecessors: ["first"], code: "project.entry_predecessor_stale", missing: ["first"], acts: [] });
      expect(run.happened).toEqual([]);
    }
  });
});
