// Offline-first trials at the whole-candidate trial gate (trace plan P6, t769;
// D40-D46): a port's optional `offlineFirst` is asked once per revision and
// digest, before admission, the start hook and the site reset. A failure the
// recording demonstrates is kept in place of the site trial and touches
// nothing; anything else runs live in the same call with a note, and an
// offline yes is never the gate's answer (Decision 3).
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../../../core/index.ts";
import type { AutomationStudioSiteResetTrialReset } from "../../../../site-reset/index.ts";
import { AUTOMATION_STUDIO_TRIAL_OFFLINE_FIRST_WORDS as WORDS } from "../../../../offline-first/index.ts";
import {
  AutomationStudioFlowCandidateTrialGate,
  type AutomationStudioCandidateTrialPort,
  type AutomationStudioCandidateTrialRequest,
  type AutomationStudioCandidateTrialResult,
  type AutomationStudioFlowCandidate
} from "../../../index.ts";

const latest = { revision: 1, digest: "d1", baseDependencyDigest: "b", status: "draft", summary: "s", buildPlan: { plan: { subflows: [] } }, changedPaths: [] } as unknown as AutomationStudioFlowCandidate;
const receipt: JsonObject = { revision: 1, digest: "d1" };
/** A recorded run that reached its success page but kept the wrong rows (T18): judged no on the offline run. */
const recordedNo = { revision: 1, digest: "d1", verdict: "no", feedback: { code: "candidate.trial_no", summary: "The stored rows are not the ones asked for." } };
/** A recorded stop at step 2, its control not found. */
const stopFeedback: JsonObject = { code: "web.action.target_missing", steps: [{ step: 1, status: "ok", definitionId: "n.open" }, { step: 2, status: "failed", definitionId: "n.press", failureCode: "web.action.target_missing" }] };
const recordedStop = { revision: 1, digest: "d1", verdict: "execution_failed", feedback: stopFeedback };

type Live = Partial<AutomationStudioCandidateTrialResult> & Pick<AutomationStudioCandidateTrialResult, "verdict">;

/** A gate whose live port answers `live` in turn, and whose `offlineFirst` answers `offline` in turn; every site action is logged in order. */
function gateOf(offline: Array<unknown | (() => unknown)> | undefined, live: Live[], options: { refuseResetOnce?: boolean } = {}) {
  const order: string[] = [];
  const asked: AutomationStudioCandidateTrialRequest[] = [];
  const calls = { offline: 0, trials: 0, hooks: 0, admits: 0, resets: 0, ran: 0 };
  let refuse = options.refuseResetOnce === true;
  const run = async (request: AutomationStudioCandidateTrialRequest) => {
    calls.trials += 1;
    order.push("trial");
    const next = live.shift() ?? { verdict: "yes" };
    return { revision: request.revision, digest: request.digest, feedback: {}, acts: [{ step: 1, definitionId: "n", consequences: ["create_new" as const] }], ...next };
  };
  const members: Record<string, unknown> = {
    prepareStart: async () => {
      calls.hooks += 1;
      order.push("hook");
      return "reset" as const;
    }
  };
  if (offline) {
    members.offlineFirst = async (request: AutomationStudioCandidateTrialRequest) => {
      calls.offline += 1;
      order.push("offline");
      asked.push(request);
      const next = offline.shift();
      return typeof next === "function" ? (next as () => unknown)() : next;
    };
  }
  const port = Object.assign(run, members) as unknown as AutomationStudioCandidateTrialPort;
  const reset: AutomationStudioSiteResetTrialReset = {
    admit: () => {
      calls.admits += 1;
      order.push("admit");
      return { kind: "admit" };
    },
    beforeTrial: async () => {
      calls.resets += 1;
      order.push("reset");
      if (refuse) {
        refuse = false;
        return { kind: "refuse", evidence: { ok: false, code: "candidate.trial_reset_required" }, moved: false };
      }
      return { kind: "admit" };
    },
    trialRan: () => {
      calls.ran += 1;
      return [{ act: "act-1", did: "added one" }];
    }
  } as unknown as AutomationStudioSiteResetTrialReset;
  const gate = new AutomationStudioFlowCandidateTrialGate({ latest: () => latest, trial: { candidateId: "candidate.1", port }, reset });
  return { gate, calls, order, asked };
}

const kept = (result: JsonObject, extra: JsonObject = {}) => ({ kind: "kept", result, checked: { matched: 4, recorded: 4 }, ...extra });
const liveNote = (note: JsonObject) => ({ kind: "live", note });

describe("offline first at the whole-candidate trial gate", () => {
  it("keeps a no the recording demonstrates (T18): no admission, hook, reset or left-on-site, the digest closed, one trial counted", async () => {
    const { gate, calls, asked } = gateOf([kept(recordedNo)], []);
    const answered = await gate.test(receipt);
    expect(calls).toEqual({ offline: 1, trials: 0, hooks: 0, admits: 0, resets: 0, ran: 0 });
    expect(asked[0]).toMatchObject({ candidateId: "candidate.1", revision: 1, digest: "d1" });
    expect(asked[0]).not.toHaveProperty("startedWith");
    expect(answered.resultCode).toBe("candidate.trial_no");
    expect(answered.evidence).toMatchObject({ ok: false, verdict: "no", checkedAgainst: "recorded_run", feedback: recordedNo.feedback });
    const evidence = answered.evidence as JsonObject;
    expect(String(evidence.instruction).startsWith(`${WORDS.kept} `)).toBe(true);
    expect(evidence).not.toHaveProperty("leftOnSite");
    expect(evidence).not.toHaveProperty("offlineCheck");
    expect(gate.refuted("d1")).toEqual(recordedNo.feedback);
    expect(gate.standing(latest)?.verdict).toBe("no");
    expect(gate.retestable()).toEqual({ why: "candidate.stall_latest_judged_no" });
    expect(await gate.test(receipt)).toMatchObject({ resultCode: "candidate.trial_unchanged_after_no" });
    expect(gate.completion({ revision: 1, digest: "d1" })).toMatchObject({ ok: false, issueCodes: ["candidate.trial_unchanged_after_no"] });
    expect(calls).toMatchObject({ offline: 1, trials: 0 });
  });

  it("keeps a recorded stop as one trial, then tests the same revision live; the same stop live closes it (D41, D43)", async () => {
    const { gate, calls, order } = gateOf([kept(recordedStop)], [{ verdict: "execution_failed", feedback: stopFeedback }]);
    const first = await gate.test(receipt);
    expect(first).toMatchObject({ resultCode: "candidate.trial_execution_failed", resultReason: "retry_allowed" });
    expect(first.evidence).toMatchObject({ verdict: "execution_failed", checkedAgainst: "recorded_run", retestsLeft: 2 });
    expect(calls).toMatchObject({ offline: 1, trials: 0, hooks: 0, resets: 0 });
    expect(gate.retestable()).toEqual({ revision: 1, digest: "d1", trials: 1 });
    const second = await gate.test(receipt);
    expect(calls).toMatchObject({ offline: 1, trials: 1, hooks: 1, admits: 1, resets: 1, ran: 1 });
    expect(order).toEqual(["offline", "admit", "hook", "reset", "trial"]);
    expect(second.evidence).toMatchObject({ verdict: "execution_failed", failedStep: { step: 2 } });
    expect(second.evidence).not.toHaveProperty("checkedAgainst");
    expect(second.evidence).not.toHaveProperty("offlineCheck");
    expect(await gate.test(receipt)).toMatchObject({ resultCode: "candidate.trial_same_failure" });
  });

  it("runs live after an offline pass: hook and reset after the check, the live answer kept with the note", async () => {
    const { gate, calls, order } = gateOf([liveNote({ outcome: "passed" })], [{ verdict: "yes" }]);
    const answered = await gate.test(receipt);
    expect(order).toEqual(["offline", "admit", "hook", "reset", "trial"]);
    expect(calls).toMatchObject({ offline: 1, trials: 1, ran: 1 });
    expect(answered).toMatchObject({ resultCode: "candidate.trial_yes", evidence: { ok: true, verdict: "yes", offlineCheck: { outcome: "passed", said: WORDS.passed } } });
    expect(answered.evidence).toHaveProperty("leftOnSite");
    expect(gate.completion({ revision: 1, digest: "d1" })).toEqual({ ok: true });
  });

  it("refuses completion after an offline pass and a live no", async () => {
    const { gate } = gateOf([liveNote({ outcome: "passed" })], [{ verdict: "no", feedback: { summary: "wrong rows" } }]);
    const answered = await gate.test(receipt);
    expect(answered.evidence).toMatchObject({ ok: false, verdict: "no", offlineCheck: { outcome: "passed" } });
    expect(gate.completion({ revision: 1, digest: "d1" })).toMatchObject({ ok: false, issueCodes: ["candidate.trial_unchanged_after_no"] });
  });

  it("runs a gap live in the same call with the gap's step, and its retest is live without asking again", async () => {
    const { gate, calls } = gateOf([liveNote({ outcome: "gap", step: 2, why: "missing_transition" })], [{ verdict: "unsure" }, { verdict: "yes" }]);
    const first = await gate.test(receipt);
    expect(calls).toMatchObject({ offline: 1, trials: 1, hooks: 1, resets: 1 });
    expect(first.evidence).toMatchObject({ verdict: "unsure", offlineCheck: { outcome: "gap", step: 2, why: "missing_transition", said: WORDS.gap(2, "missing_transition") } });
    const second = await gate.test(receipt);
    expect(calls).toMatchObject({ offline: 1, trials: 2, hooks: 2, resets: 2 });
    expect(second.evidence).toMatchObject({ ok: true, verdict: "yes" });
    expect(second.evidence).not.toHaveProperty("offlineCheck");
  });

  it("never keeps an offline yes: it runs live, and only the live answer counts", async () => {
    const { gate, calls } = gateOf([kept({ ...recordedNo, verdict: "yes" })], [{ verdict: "no" }]);
    const answered = await gate.test(receipt);
    expect(calls).toMatchObject({ offline: 1, trials: 1, hooks: 1, resets: 1 });
    expect(answered.evidence).toMatchObject({ ok: false, verdict: "no", offlineCheck: { outcome: "inconclusive", why: "offline_kept_yes" } });
    expect(answered.evidence).not.toHaveProperty("checkedAgainst");
    expect(gate.completion({ revision: 1, digest: "d1" })).toMatchObject({ ok: false });
  });

  it("logs a not_tried note but adds no evidence for it (D46)", async () => {
    const { gate, calls } = gateOf([liveNote({ outcome: "not_tried", why: "no_source" })], [{ verdict: "yes" }]);
    const answered = await gate.test(receipt);
    expect(calls).toMatchObject({ offline: 1, trials: 1 });
    expect(answered.evidence).toMatchObject({ ok: true, verdict: "yes" });
    expect(answered.evidence).not.toHaveProperty("offlineCheck");
  });

  it("runs live, inconclusive, when offlineFirst throws, and lets an abort propagate untouched", async () => {
    const thrown = gateOf([() => { throw new Error("recording unreadable: secret page text"); }], [{ verdict: "yes" }]);
    const answered = await thrown.gate.test(receipt);
    expect(thrown.calls).toMatchObject({ offline: 1, trials: 1 });
    expect(answered.evidence).toMatchObject({ ok: true, offlineCheck: { outcome: "inconclusive", said: WORDS.inconclusive } });
    expect(JSON.stringify(answered.evidence)).not.toContain("secret page text");

    const controller = new AbortController();
    const abort = new Error("aborted");
    const aborted = gateOf([() => {
      controller.abort();
      throw abort;
    }], [{ verdict: "yes" }]);
    await expect(aborted.gate.test(receipt, controller.signal)).rejects.toBe(abort);
    expect(aborted.calls).toMatchObject({ offline: 1, trials: 0, hooks: 0, resets: 0 });
  });

  it("asks offline at most once per revision even when the reset refuses the first live trial", async () => {
    const { gate, calls } = gateOf([liveNote({ outcome: "passed" }), liveNote({ outcome: "passed" })], [{ verdict: "yes" }], { refuseResetOnce: true });
    expect(await gate.test(receipt)).toMatchObject({ resultCode: "candidate.trial_reset_required" });
    expect(calls).toMatchObject({ offline: 1, trials: 0 });
    expect(await gate.test(receipt)).toMatchObject({ resultCode: "candidate.trial_yes" });
    expect(calls).toMatchObject({ offline: 1, trials: 1 });
  });

  it("without offlineFirst behaves as before", async () => {
    const { gate, calls, order } = gateOf(undefined, [{ verdict: "yes" }]);
    const answered = await gate.test(receipt);
    expect(order).toEqual(["admit", "hook", "reset", "trial"]);
    expect(calls).toMatchObject({ offline: 0, trials: 1, ran: 1 });
    expect(answered.evidence).not.toHaveProperty("offlineCheck");
    expect(answered.evidence).not.toHaveProperty("checkedAgainst");
  });
});

describe("the offline check in the step log", () => {
  let directory: string | undefined;
  afterEach(() => {
    vi.unstubAllEnvs();
    if (directory) rmSync(directory, { recursive: true, force: true });
    directory = undefined;
  });

  it("writes an NNNN-offline step before the site check, with codes and counts only", async () => {
    directory = mkdtempSync(path.join(tmpdir(), "offline-first-gate-"));
    vi.stubEnv("FLUXIQ_LLM_STEP_LOG_DIR", directory);
    const keptRun = gateOf([kept(recordedNo)], []);
    await keptRun.gate.test(receipt);
    const passRun = gateOf([liveNote({ outcome: "gap", step: 3, why: "argument_mismatch" })], [{ verdict: "yes" }]);
    await passRun.gate.test(receipt);
    expect(readdirSync(directory).filter((name) => name !== "index.md").sort()).toEqual(["0001-offline", "0002-offline", "0003-reset"]);
    const meta = (step: string) => JSON.parse(readFileSync(path.join(directory!, step, "meta.json"), "utf8")) as JsonObject;
    expect(meta("0001-offline")).toMatchObject({ kind: "offline_trial", trialToolId: "core.test_candidate", status: "ok", outcome: "kept_no", matchedOperations: 4, recordedOperations: 4 });
    expect(meta("0002-offline")).toMatchObject({ status: "ok", outcome: "gap", gapStep: 3 });
    expect(JSON.stringify(meta("0001-offline"))).not.toContain("stored rows");
  });
});
