// A yes over a read that kept every item it saw, after an act repeated over a
// narrower read of the same list, stands only where the judge's converse
// question confirmed it (t692, `../subflow-trial-gate.ts`). A8 cost round 2 `run-mvbr0w7e-6a01c05b`: the
// test acted on the 4 of 8 rows a condition kept, stored all 8 from a second
// read with no condition, and both judge calls said yes. Shown on another kind
// of site: a returns desk approves the 3 returns of 7 at most 50, then reads
// the returns list with no condition and stores all 7.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import {
  AutomationStudioSubflowTrialGate,
  type AutomationStudioSubflowProposal,
  type AutomationStudioSubflowTrialKeptEveryRowRead,
  type AutomationStudioSubflowTrialPreparingPort,
  type AutomationStudioSubflowTrialRequest,
  type AutomationStudioSubflowTrialResult
} from "../index.ts";
import { testScope } from "./subflow-fixture.ts";

const scope = testScope();
const identity = { buildId: scope.buildId, briefId: scope.briefId, planDigest: scope.planDigest, subflowKey: scope.subflowKey };
const proposal: AutomationStudioSubflowProposal = { scope: identity, revision: 2, digest: "d".repeat(64), subflows: [], summary: "Approve returns", changedPaths: [] };
const receipt: JsonObject = { revision: proposal.revision, digest: proposal.digest };

const SAID = "Step s7 read the same list as step s3 ... Check each row step s7 stored, one by one, against the request's own words for what the answer holds.";
const FLAGGED: AutomationStudioSubflowTrialKeptEveryRowRead = {
  nodeId: "s7", kept: 3,
  keptEveryRow: { narrowerRead: "s3", narrowerSeen: 7, narrowerKept: 3, actedBy: ["s5"], sameList: "items_edge_and_read_target", said: SAID }
};

type CheckRows = NonNullable<AutomationStudioSubflowTrialPreparingPort["checkRows"]>;

/** A port that answers each trial with `verdict`, carrying the flagged reads beside its result, and asks `checkRows` where given. */
function gateWith(options: { verdict?: AutomationStudioSubflowTrialResult["verdict"]; flagged?: unknown; checkRows?: CheckRows } = {}) {
  const trial = async (request: AutomationStudioSubflowTrialRequest): Promise<AutomationStudioSubflowTrialResult> => ({
    partial: true, scope: "subflow", identity: { ...request.proposal.scope }, revision: request.proposal.revision, digest: request.proposal.digest,
    verdict: options.verdict ?? "yes", feedback: { judge: "judged" }, entryPrepared: true, trialRunId: "trial.1",
    ...(options.flagged !== undefined ? { keptEveryRow: options.flagged } : {})
  }) as AutomationStudioSubflowTrialResult;
  const port: AutomationStudioSubflowTrialPreparingPort = Object.assign(trial, options.checkRows ? { checkRows: options.checkRows } : {});
  return new AutomationStudioSubflowTrialGate({ scope, latest: () => structuredClone(proposal), port });
}

describe("a yes over a read that kept every item it saw after an act over a narrower read", () => {
  it("asks the port's row check, and stands where the converse question confirmed the yes", async () => {
    const asked: Array<Parameters<CheckRows>[0]> = [];
    const gate = gateWith({ flagged: [FLAGGED], checkRows: async (input) => {
      asked.push(input);
      return { converse: "confirmed" };
    } });
    const ran = await gate.test(receipt);
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({ revision: 2, digest: proposal.digest, trialRunId: "trial.1", reads: [FLAGGED] });
    expect(ran.evidence).toMatchObject({ ok: true, verdict: "yes", feedback: { keptEveryRow: [{ read: "s7", said: SAID }], rowCheck: expect.stringContaining("the yes stands") } });
    expect(gate.completion(proposal)).toEqual({ ok: true });
  });

  it("is not taken where the converse did not confirm it, the check fails, or the port cannot answer it", async () => {
    const checks: Array<CheckRows | undefined> = [
      async () => ({ converse: "unconfirmed" }),
      async () => undefined,
      async () => ({ converse: "yes" }),
      async () => { throw new Error("provider said no"); },
      undefined
    ];
    for (const checkRows of checks) {
      const gate = gateWith({ flagged: [FLAGGED], ...(checkRows ? { checkRows } : {}) });
      const ran = await gate.test(receipt);
      expect(ran.evidence).toMatchObject({ ok: false, verdict: "unsure", retestsLeft: expect.any(Number), feedback: { code: "subflow.trial_rows_unaccounted", keptEveryRow: [{ read: "s7", said: SAID }] } });
      expect((ran.evidence as JsonObject).instruction).toContain("the yes was not confirmed by a judge call asking of each row it stored");
      expect(JSON.stringify(ran.evidence)).not.toContain("provider said no");
      expect(ran.resultReason).toBe("retry_allowed");
      expect(gate.completion(proposal)).toMatchObject({ ok: false, issueCodes: ["subflow.trial_unsure"] });
      expect(gate.refuted(proposal.digest)).toBeUndefined();
    }
  });

  it("asks nothing for a yes with no flagged read, a malformed flag, or a verdict that is not a yes", async () => {
    let asked = 0;
    const checkRows: CheckRows = async () => {
      asked += 1;
      return undefined;
    };
    for (const flagged of [undefined, [], [{ nodeId: "s7", kept: 0, keptEveryRow: FLAGGED.keptEveryRow }], [{ nodeId: "s7", kept: 3 }]]) {
      const gate = gateWith({ flagged, checkRows });
      expect((await gate.test(receipt)).evidence).toMatchObject({ verdict: "yes" });
      expect(gate.completion(proposal)).toEqual({ ok: true });
    }
    const no = gateWith({ verdict: "no", flagged: [FLAGGED], checkRows });
    expect((await no.test(receipt)).evidence).toMatchObject({ verdict: "no" });
    expect(asked).toBe(0);
  });
});
