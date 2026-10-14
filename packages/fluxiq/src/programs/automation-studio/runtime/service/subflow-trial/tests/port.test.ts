import { describe, expect, it } from "vitest";
import { automationStudioSubflowTrialPort } from "../index.ts";
import { SPENT, subflowTrialFixture as fixture } from "./fixtures.ts";

describe("subflow trial port", () => {
  it("refuses another build's request, records each trial and sums what its judges spent", async () => {
    const f = fixture();
    const { port, records, spent } = automationStudioSubflowTrialPort("build.1", f.ports);
    const other = f.request();
    other.scope = { ...other.scope, buildId: "build.2" };
    expect(await port(other)).toMatchObject({ partial: true, scope: "subflow", verdict: "execution_failed", entryPrepared: false, feedback: { code: "subflow.trial_other_build" } });
    expect(records()).toEqual([]);
    const [first, second] = await Promise.all([port(f.request()), port(f.request())]);
    expect([first.trialRunId, second.trialRunId].sort()).toEqual(["subflow-trial.1", "subflow-trial.2"]);
    expect(records()).toHaveLength(2);
    expect(spent()).toMatchObject({ calls: 4, totalTokens: 660 });
    f.setVerdict({ verdict: "not_judged", why: "deadline", spent: { ...SPENT, calls: 1 } });
    expect(await port(f.request())).toMatchObject({ verdict: "not_judged", partial: true });
  });

  it("runs the start hook ahead of a trial once, keeps that start for the same brief, revision and digest only, and runs none for another build (t578)", async () => {
    const f = fixture();
    const hooked: string[] = [];
    const { port, records } = automationStudioSubflowTrialPort("build.1", { ...f.ports, prepareStart: async ({ candidateId, revision }) => {
      hooked.push(`${candidateId}@${revision}`);
      return { reset: true };
    } });
    const request = f.request();
    const signal = new AbortController().signal;
    expect(await port.prepareStart!({ scope: { ...request.scope, buildId: "build.2" }, revision: 3, digest: "add.3", signal })).toBe("none");
    expect(await port.prepareStart!({ scope: request.scope, revision: 3, digest: "add.3", signal })).toBe("reset");
    // Another brief's trial of the same revision and digest does not take this brief's start: it runs its own hook.
    const other = f.request();
    other.scope = { ...other.scope, briefId: "brief.other" };
    other.proposal = { ...other.proposal, scope: { ...other.proposal.scope, briefId: "brief.other" } };
    await port(other);
    await port(request);
    // The next trial of this brief, prepared by nobody, runs the hook itself.
    await port(f.request());
    expect(hooked).toEqual(["subflow.build.1.brief.add@3", "subflow.build.1.brief.other@3", "subflow.build.1.brief.add@3"]);
    expect(records().map((record) => record.start.status)).toEqual(["reset", "reset", "reset"]);
  });
});
