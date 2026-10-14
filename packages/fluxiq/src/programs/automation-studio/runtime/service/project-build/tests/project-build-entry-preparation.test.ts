// A dependent builder's entry (`../entry-preparation.ts`, t580): its
// predecessors' latest passing proposals run once, in order, after the start
// and in a session of their own; where that cannot happen the answer says
// why. The detached runner and the trial environment are stubs.

import { describe, expect, it } from "vitest";
import type { AutomationStudioSubflowProposal, AutomationStudioSubflowScope } from "../../../flow-bootstrap/subflow-candidate/index.ts";
import type { AutomationStudioDetachedSubflowInput, AutomationStudioDetachedSubflowResult } from "../../../flow-bootstrap/verification/index.ts";
import { automationStudioProjectBuildPrepareEntry } from "../entry-preparation.ts";
import { AutomationStudioProjectBuildProposals } from "../proposals.ts";
import type { AutomationStudioProjectBuildTrialEnvironment } from "../whole-trials.ts";

const scopeOf = (subflowKey: string, briefId: string, predecessors: string[] = []): AutomationStudioSubflowScope => ({ buildId: "build-1", briefId, planDigest: "plan-1", subflowKey, parts: [], predecessors });

function proposalOf(scope: AutomationStudioSubflowScope, revision: number): AutomationStudioSubflowProposal {
  return { scope: { buildId: scope.buildId, briefId: scope.briefId, planDigest: scope.planDigest, subflowKey: scope.subflowKey }, revision, digest: `${scope.subflowKey}-${revision}`, subflows: [], summary: "", changedPaths: [] };
}

function harness(options: { startFails?: boolean } = {}) {
  const happened: string[] = [];
  const environment = {
    projectId: "project-1", flowId: "flow-1", sourceInstructionIds: ["instruction.build"], resolution: {},
    parentFlow: async () => ({}), currentBaseDigest: async () => "base-1", snapshots: async () => [], deprecatedPublicationIds: async () => [],
    prepareStart: async () => {
      happened.push("start");
      if (options.startFails) throw new Error("The site would not reset.");
      return {};
    },
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
  const proposals = new AutomationStudioProjectBuildProposals();
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
    expect(entry).toEqual({ kind: "prepared", predecessors: ["first", "second"], runId: "entry-run-1", acts: [] });
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
    expect(entry).toMatchObject({ kind: "unprepared", code: "candidate.trial_failed", failed: "first", runId: "entry-run-1" });
    expect(run.happened.at(-1)).toBe("write failed");
  });

  it("runs no predecessor when the start failed", async () => {
    const run = harness({ startFails: true });
    run.passed("first", "brief-1", 1);
    expect(await run.prepare(scopeOf("second", "brief-2", ["first"]))).toMatchObject({ kind: "unprepared", code: "candidate.trial_start_failed" });
    expect(run.happened).toEqual(["start"]);
  });
});
