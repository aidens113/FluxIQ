// P6 (t769, design section 2; T17): the recorded run an offline-first test
// runs against is the latest eligible live trial of the same scope, kept by
// the build as it runs. Identical states in different episodes never merge:
// one trace per trial, never across candidates, subflows or builds, and an
// offline trial's own derived trace is never a source.
import { describe, expect, it } from "vitest";
import type { AutomationStudioCandidateTrialRecord } from "../../candidate-trial/index.ts";
import type { AutomationStudioSubflowTrialRecord } from "../../subflow-trial/index.ts";
import { AutomationStudioOfflineFirstSources } from "../index.ts";

const NO_SPEND = Object.freeze({ calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 });

function whole(run: number, overrides: Partial<AutomationStudioCandidateTrialRecord> = {}): AutomationStudioCandidateTrialRecord {
  return {
    candidateId: "candidate.a", revision: 1, digest: "digest.1", trialRunId: `trial.${run}`, traceId: `trace.${run}`,
    start: { status: "not_reset" }, execution: "succeeded", verdict: "yes", judge: { ...NO_SPEND }, ...overrides
  };
}

function subflow(run: number, identity: Partial<AutomationStudioSubflowTrialRecord["identity"]> = {}, overrides: Partial<AutomationStudioSubflowTrialRecord> = {}): AutomationStudioSubflowTrialRecord {
  return {
    identity: { buildId: "build.a", briefId: "brief.a", planDigest: "plan.a", subflowKey: "lamps", ...identity },
    revision: 1, digest: "digest.1", trialRunId: `trial.${run}`, traceId: `trace.${run}`,
    start: { status: "not_reset" }, execution: "succeeded", entryPrepared: true, verdict: "yes", judge: { ...NO_SPEND }, ...overrides
  };
}

const WHOLE_A = AutomationStudioOfflineFirstSources.wholeScope("candidate.a");
const LAMPS = AutomationStudioOfflineFirstSources.subflowScope("build.a", "lamps");

describe("the scopes", () => {
  it("are a whole candidate's id and a subflow's build and key", () => {
    expect(WHOLE_A).toBe("whole:candidate.a");
    expect(LAMPS).toBe("build.a/lamps");
  });
});

describe("a scope's source", () => {
  it("is nothing before the scope's first live trial", () => {
    const sources = new AutomationStudioOfflineFirstSources();

    expect(sources.latest(WHOLE_A)).toBeUndefined();
    expect(sources.latest(LAMPS)).toBeUndefined();
  });

  it("is the latest eligible live trial, one trace per trial even for identical runs", () => {
    const sources = new AutomationStudioOfflineFirstSources();

    expect(sources.observeWhole(whole(1))).toBe(true);
    // The same revision and digest, in another episode: it replaces the first, never merges with it.
    expect(sources.observeWhole(whole(2))).toBe(true);

    expect(sources.latest(WHOLE_A)).toEqual({ traceId: "trace.2", trialRunId: "trial.2" });
  });

  it("is never a trial that did not run, had no trace or run id, or was a judge asked again", () => {
    const sources = new AutomationStudioOfflineFirstSources();
    sources.observeWhole(whole(1));

    expect(sources.observeWhole(whole(2, { execution: "not_run" }))).toBe(false);
    const { traceId: _traceId, ...untraced } = whole(3);
    const { trialRunId: _trialRunId, ...unopened } = whole(4);
    expect(sources.observeWhole(untraced)).toBe(false);
    expect(sources.observeWhole(unopened)).toBe(false);
    expect(sources.observeWhole(whole(5, { judgedAgain: true }))).toBe(false);

    expect(sources.latest(WHOLE_A)).toEqual({ traceId: "trace.1", trialRunId: "trial.1" });
  });

  it("ignores a trial it has already seen, so passing every record after each call keeps the latest", () => {
    const sources = new AutomationStudioOfflineFirstSources();
    const first = whole(1), second = whole(2);
    [first].forEach((record) => sources.observeWhole(record));
    [first, second].forEach((record) => sources.observeWhole(record));

    expect(sources.observeWhole(first)).toBe(false);
    expect(sources.latest(WHOLE_A)).toEqual({ traceId: "trace.2", trialRunId: "trial.2" });
  });

  it("is never an offline trial's derived trace", () => {
    const sources = new AutomationStudioOfflineFirstSources();
    sources.observeWhole(whole(1));
    sources.noteDerived("trace.9");

    expect(sources.observeWhole(whole(9))).toBe(false);
    expect(sources.latest(WHOLE_A)).toEqual({ traceId: "trace.1", trialRunId: "trial.1" });
  });
});

describe("no merge across scopes (T17)", () => {
  it("never takes one candidate's trial for another's", () => {
    const sources = new AutomationStudioOfflineFirstSources();
    sources.observeWhole(whole(1, { candidateId: "candidate.b" }));

    expect(sources.latest(WHOLE_A)).toBeUndefined();
    expect(sources.latest(AutomationStudioOfflineFirstSources.wholeScope("candidate.b"))).toEqual({ traceId: "trace.1", trialRunId: "trial.1" });
  });

  it("keeps a subflow's latest across its briefs, never another subflow's or another build's", () => {
    const sources = new AutomationStudioOfflineFirstSources();
    sources.observeSubflow(subflow(1));
    sources.observeSubflow(subflow(2, { briefId: "brief.b", planDigest: "plan.b" }));
    sources.observeSubflow(subflow(3, { subflowKey: "desks" }));
    sources.observeSubflow(subflow(4, { buildId: "build.b" }));

    expect(sources.latest(LAMPS)).toEqual({ traceId: "trace.2", trialRunId: "trial.2" });
    expect(sources.latest(AutomationStudioOfflineFirstSources.subflowScope("build.a", "desks"))).toEqual({ traceId: "trace.3", trialRunId: "trial.3" });
    expect(sources.latest(AutomationStudioOfflineFirstSources.subflowScope("build.b", "lamps"))).toEqual({ traceId: "trace.4", trialRunId: "trial.4" });
  });

  it("never takes a subflow trial whose entry was not prepared", () => {
    const sources = new AutomationStudioOfflineFirstSources();

    expect(sources.observeSubflow(subflow(1, {}, { entryPrepared: false, failedPredecessor: "open" }))).toBe(false);
    expect(sources.latest(LAMPS)).toBeUndefined();
  });

  it("keeps whole and subflow scopes apart", () => {
    const sources = new AutomationStudioOfflineFirstSources();
    sources.observeSubflow(subflow(1));

    expect(sources.latest(WHOLE_A)).toBeUndefined();
  });
});
