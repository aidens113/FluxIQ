// An offline trial at the whole-candidate trial gate (traces and offline
// trials, Decisions 3 and 6): no start hook and no site reset, and its yes is
// evidence only, never the judged pass that lets the build complete. In its
// own directory because `../../` is at its file limit.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../../../core/index.ts";
import type { AutomationStudioRunEnvironmentKind } from "../../../../../environment/index.ts";
import type { AutomationStudioSiteResetTrialReset } from "../../../../site-reset/index.ts";
import {
  AUTOMATION_STUDIO_CANDIDATE_OFFLINE_YES_INSTRUCTION,
  AutomationStudioFlowCandidateTrialGate,
  type AutomationStudioCandidateTrialPort,
  type AutomationStudioCandidateTrialVerdict,
  type AutomationStudioFlowCandidate
} from "../../../index.ts";

const latest = { revision: 1, digest: "d1", baseDependencyDigest: "b", status: "draft", summary: "s", buildPlan: { plan: { subflows: [] } }, changedPaths: [] } as unknown as AutomationStudioFlowCandidate;
const receipt: JsonObject = { revision: 1, digest: "d1" };

/** A gate whose port answers the verdicts given in turn, under the kind `kind()` names now, with a start hook and a reset that count their calls. */
function gateOf(kind: () => AutomationStudioRunEnvironmentKind | undefined, verdicts: AutomationStudioCandidateTrialVerdict[]) {
  const calls = { trials: 0, hooks: 0, resets: 0, ran: 0 };
  const run = async (request: { revision: number; digest: string }) => {
    calls.trials += 1;
    return { revision: request.revision, digest: request.digest, verdict: verdicts.shift() ?? "yes", feedback: {}, acts: [{ step: 1, definitionId: "n", consequences: ["create_new" as const] }] };
  };
  const port: AutomationStudioCandidateTrialPort = Object.defineProperty(Object.assign(run, {
    prepareStart: async () => {
      calls.hooks += 1;
      return "reset" as const;
    }
  }), "environmentKind", { get: kind });
  const reset: AutomationStudioSiteResetTrialReset = {
    beforeTrial: async () => {
      calls.resets += 1;
      return { kind: "admit" };
    },
    trialRan: () => {
      calls.ran += 1;
      return [];
    }
  };
  const gate = new AutomationStudioFlowCandidateTrialGate({ latest: () => latest, trial: { candidateId: "candidate.1", port }, reset });
  return { gate, calls };
}

describe("an offline trial at the trial gate", () => {
  it("runs no start hook and no site reset, and records nothing it did as left on the site", async () => {
    const { gate, calls } = gateOf(() => "trace", ["no"]);
    const answered = await gate.test(receipt);
    expect(calls).toEqual({ trials: 1, hooks: 0, resets: 0, ran: 0 });
    expect(answered.evidence).toMatchObject({ verdict: "no" });
    expect(answered.evidence).not.toHaveProperty("leftOnSite");
  });

  it("answers its yes as evidence, never keeps it, so completion still needs a live trial's yes", async () => {
    const { gate } = gateOf(() => "fixture", ["yes"]);
    const answered = await gate.test(receipt);
    expect(answered).toMatchObject({ resultCode: "candidate.trial_offline_yes", resultReason: "retry_allowed" });
    expect(answered.evidence).toMatchObject({ ok: false, verdict: "yes", retestsLeft: 2, instruction: AUTOMATION_STUDIO_CANDIDATE_OFFLINE_YES_INSTRUCTION });
    expect(gate.standing(latest)).toBeUndefined();
    expect(gate.completion({ revision: 1, digest: "d1" })).toMatchObject({ ok: false, issueCodes: ["candidate.trial_required"] });
    expect(gate.retestable()).toEqual({ revision: 1, digest: "d1", trials: 1 });
  });

  it("drops a stale verdict of the revision, but never a live yes that stands", async () => {
    let kind: AutomationStudioRunEnvironmentKind = "trace";
    const offlineFirst = gateOf(() => kind, ["unsure", "yes"]);
    await offlineFirst.gate.test(receipt);
    expect(offlineFirst.gate.standing(latest)?.verdict).toBe("unsure");
    await offlineFirst.gate.test(receipt);
    expect(offlineFirst.gate.standing(latest)).toBeUndefined();

    kind = "live";
    const liveFirst = gateOf(() => kind, ["yes", "yes"]);
    await liveFirst.gate.test(receipt);
    expect(liveFirst.calls).toMatchObject({ hooks: 1, resets: 1, ran: 1 });
    expect(liveFirst.gate.completion({ revision: 1, digest: "d1" })).toEqual({ ok: true });
    kind = "trace";
    await liveFirst.gate.test(receipt);
    expect(liveFirst.calls).toMatchObject({ trials: 2, hooks: 1, resets: 1, ran: 1 });
    expect(liveFirst.gate.standing(latest)?.verdict).toBe("yes");
    expect(liveFirst.gate.completion({ revision: 1, digest: "d1" })).toEqual({ ok: true });
  });

  it("treats a port with no kind, or a live one, as before: hook, reset, and a yes that completes", async () => {
    for (const kind of [undefined, "live" as const]) {
      const { gate, calls } = gateOf(() => kind, ["yes"]);
      const answered = await gate.test(receipt);
      expect(calls).toEqual({ trials: 1, hooks: 1, resets: 1, ran: 1 });
      expect(answered).toMatchObject({ resultCode: "candidate.trial_yes", evidence: { ok: true, verdict: "yes" } });
      expect(gate.completion({ revision: 1, digest: "d1" })).toEqual({ ok: true });
    }
  });
});
