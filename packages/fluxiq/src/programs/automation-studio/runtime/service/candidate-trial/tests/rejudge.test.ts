// A trial its judge did not judge is judged again on its own evidence, not run
// again (t473). Live run `run-mv5q4j5c-49bfb5e2` re-ran an identical 84-second
// trial only to get the judgement its timed-out judge never gave.
import { describe, expect, it } from "vitest";
import { automationStudioCandidateTrialPort } from "../index.ts";
import { SPENT_TWO, trialFixture } from "./fixtures.ts";

/** Every press succeeds and is counted: how many times the candidate actually ran. */
function pressing(fixture: ReturnType<typeof trialFixture>) {
  let presses = 0;
  fixture.ports.graphOptions = ({ signal }) => ({ signal, now: () => 100, nativeNodeExecutor: async () => {
    presses++;
    return { result: { status: "success", route: "success", outputs: {} } };
  } } as ReturnType<typeof fixture.ports.graphOptions>);
  return () => presses;
}

const NOT_JUDGED = { verdict: "not_judged" as const, why: "The judge could not answer, so the test was not judged; this is not a finding about the Flow. It was asked 2 times with the same evidence.", spent: { ...SPENT_TWO } };

describe("a trial its judge did not judge", () => {
  it("is judged again on the same evidence when the same revision is tested again, and the Flow is not run again", async () => {
    const fixture = trialFixture(), presses = pressing(fixture);
    const trials = automationStudioCandidateTrialPort("candidate.1", fixture.ports);
    fixture.setVerdict(NOT_JUDGED);
    const first = await trials.port(fixture.request());
    expect(first).toMatchObject({ verdict: "not_judged", trialRunId: "trial.1", feedback: { code: "candidate.trial_not_judged", why: NOT_JUDGED.why } });
    expect(first.acts).toHaveLength(1);

    fixture.setVerdict({ verdict: "yes", spent: { ...SPENT_TWO } });
    const again = await trials.port(fixture.request());
    // Nothing ran: the one press is the first trial's, and no act is said to have landed again.
    expect(presses()).toBe(1);
    expect(again).toMatchObject({ verdict: "yes", trialRunId: "trial.1", feedback: { judgedAgain: expect.stringContaining("not run again") } });
    expect(again).not.toHaveProperty("acts");
    // The judge read the same summary both times.
    expect(fixture.judged).toHaveLength(2);
    expect(fixture.judged[1]).toEqual(fixture.judged[0]);
    expect(trials.records()).toMatchObject([
      { verdict: "not_judged", trialRunId: "trial.1", execution: "succeeded" },
      { verdict: "yes", trialRunId: "trial.1", execution: "succeeded", judgedAgain: true }
    ]);
    // Both judgements are spent against the build.
    expect(trials.spent()).toMatchObject({ calls: 4 });
  });

  it("stays unjudged as long as the judge cannot answer, never running the Flow again; a verdict drops the kept evidence", async () => {
    const fixture = trialFixture(), presses = pressing(fixture);
    const trials = automationStudioCandidateTrialPort("candidate.1", fixture.ports);
    fixture.setVerdict(NOT_JUDGED);
    await trials.port(fixture.request());
    await trials.port(fixture.request());
    expect(presses()).toBe(1);
    fixture.setVerdict({ verdict: "unknown", why: "unconfirmed", spent: { ...SPENT_TWO } });
    expect(await trials.port(fixture.request())).toMatchObject({ verdict: "unsure", trialRunId: "trial.1" });
    expect(presses()).toBe(1);
    // A judged trial is not judged again: the next test of the revision runs it.
    await trials.port(fixture.request());
    expect(presses()).toBe(2);
    expect(trials.records().map((record) => [record.trialRunId, record.verdict, record.judgedAgain ?? false])).toEqual([
      ["trial.1", "not_judged", false], ["trial.1", "not_judged", true], ["trial.1", "unsure", true], ["trial.2", "unsure", false]
    ]);
  });

  it("is run again when its evidence is not intact: a result that could not be read was never judged", async () => {
    const fixture = trialFixture(), presses = pressing(fixture);
    const trials = automationStudioCandidateTrialPort("candidate.1", fixture.ports);
    let reads = 0;
    fixture.ports.recordSets = async () => {
      reads += 1;
      if (reads === 1) throw new TypeError("store closed");
      return [];
    };
    expect(await trials.port(fixture.request())).toMatchObject({ verdict: "not_judged", feedback: { code: "candidate.trial_result_unreadable" } });
    expect(await trials.port(fixture.request())).toMatchObject({ verdict: "yes", trialRunId: "trial.2" });
    expect(presses()).toBe(2);
    expect(trials.records()[0]).toMatchObject({ judge: { calls: 0 } });
  });
});
