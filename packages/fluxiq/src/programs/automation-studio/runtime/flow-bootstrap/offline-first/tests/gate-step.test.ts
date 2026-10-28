import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_TRIAL_OFFLINE_FIRST_WORDS as WORDS, automationStudioTrialOfflineFirstStep, type AutomationStudioTrialOfflineFirst } from "../index.ts";

// t769 P6: the one step both trial gates take over an offline-first answer.
// A failure the recording demonstrates (no, execution_failed) is kept in
// place of a site trial; every other answer runs live, with a note the gate
// adds to that live trial's evidence. Anything invalid, and a kept yes, runs
// live as inconclusive: an offline yes never becomes the gate's answer.

const expected = { revision: 4, digest: "d-4" };
const result = (verdict: string, more: Record<string, unknown> = {}) => ({ revision: 4, digest: "d-4", verdict, feedback: { code: `x.${verdict}`, steps: [{ step: 1 }] }, ...more });
const step = (answer: unknown) => automationStudioTrialOfflineFirstStep(answer, expected);
const inconclusive = (why: string) => ({
  kind: "live",
  note: { outcome: "inconclusive", why, said: WORDS.inconclusive },
  evidence: { offlineCheck: { outcome: "inconclusive", why, said: WORDS.inconclusive } },
  logged: { outcome: "inconclusive" }
});

describe("automationStudioTrialOfflineFirstStep: a kept answer", () => {
  it("keeps a recorded no in place of the site trial, as a copy, with checkedAgainst and the kept words", () => {
    const answered = result("no");
    const outcome = step({ kind: "kept", result: answered, standingNo: { held: true }, checked: { matched: 5, recorded: 7 } });
    expect(outcome).toEqual({
      kind: "keep", result: answered, standingNo: { held: true },
      evidence: { checkedAgainst: "recorded_run" }, said: WORDS.kept,
      logged: { outcome: "kept_no", matchedOperations: 5, recordedOperations: 7 }
    });
    if (outcome.kind !== "keep") throw new Error("expected keep");
    expect(outcome.result).not.toBe(answered);
    answered.feedback.code = "changed";
    expect(outcome.result.feedback.code).toBe("x.no");
  });

  it("keeps a recorded execution_failed, and leaves out standingNo and counts it was not given", () => {
    expect(step({ kind: "kept", result: result("execution_failed") })).toEqual({
      kind: "keep", result: result("execution_failed"), evidence: { checkedAgainst: "recorded_run" }, said: WORDS.kept, logged: { outcome: "kept_failed" }
    });
  });

  it("passes the result's other fields on for the gate's own result checks", () => {
    const subflow = result("no", { partial: true, scope: "subflow", identity: { buildId: "b" }, entryPrepared: true });
    const outcome = step({ kind: "kept", result: subflow });
    expect(outcome.kind === "keep" && outcome.result).toEqual(subflow);
  });

  it("never keeps a yes: it runs live as inconclusive", () => {
    expect(step({ kind: "kept", result: result("yes") })).toEqual(inconclusive("offline_kept_yes"));
  });

  it("never keeps an unsure or not_judged: they run live as an invalid answer", () => {
    for (const verdict of ["unsure", "not_judged", "maybe", undefined]) {
      expect(step({ kind: "kept", result: result(verdict as string) })).toEqual(inconclusive("offline_answer_invalid"));
    }
  });

  it("runs live when the kept result is about another revision or digest", () => {
    expect(step({ kind: "kept", result: { ...result("no"), revision: 3 } })).toEqual(inconclusive("offline_answer_mismatch"));
    expect(step({ kind: "kept", result: { ...result("no"), digest: "d-3" } })).toEqual(inconclusive("offline_answer_mismatch"));
  });

  it("runs live when the kept result or its envelope is malformed", () => {
    const malformed: unknown[] = [
      { kind: "kept" },
      { kind: "kept", result: null },
      { kind: "kept", result: [result("no")] },
      { kind: "kept", result: { ...result("no"), feedback: [] } },
      { kind: "kept", result: { ...result("no"), feedback: "text" } },
      { kind: "kept", result: { ...result("no"), revision: "4" } },
      { kind: "kept", result: result("no"), traceId: "t-1" },
      { kind: "kept", result: result("no"), checked: { matched: 8, recorded: 7 } },
      { kind: "kept", result: result("no"), checked: { matched: -1, recorded: 7 } },
      { kind: "kept", result: result("no"), checked: { matched: 1.5, recorded: 7 } },
      { kind: "kept", result: result("no"), checked: { matched: 1, recorded: 7, traceId: "t" } },
      { kind: "kept", result: { ...result("no"), feedback: { fn: () => 1 } } }
    ];
    for (const answer of malformed) expect(step(answer)).toEqual(inconclusive("offline_answer_invalid"));
  });
});

describe("automationStudioTrialOfflineFirstStep: a live answer", () => {
  it("runs live after an offline pass, with the passed note and its counts logged", () => {
    expect(step({ kind: "live", note: { outcome: "passed" }, checked: { matched: 7, recorded: 7 } })).toEqual({
      kind: "live",
      note: { outcome: "passed", said: WORDS.passed },
      evidence: { offlineCheck: { outcome: "passed", said: WORDS.passed } },
      logged: { outcome: "passed", matchedOperations: 7, recordedOperations: 7 }
    });
  });

  it("runs live over a gap, naming the step and why in plain words", () => {
    const said = WORDS.gap(3, "argument_mismatch");
    expect(step({ kind: "live", note: { outcome: "gap", step: 3, why: "argument_mismatch" }, checked: { matched: 2, recorded: 7 } })).toEqual({
      kind: "live",
      note: { outcome: "gap", step: 3, why: "argument_mismatch", said },
      evidence: { offlineCheck: { outcome: "gap", step: 3, why: "argument_mismatch", said } },
      logged: { outcome: "gap", step: 3, matchedOperations: 2, recordedOperations: 7 }
    });
  });

  it("runs live when the offline check was inconclusive, with or without a why", () => {
    expect(step({ kind: "live", note: { outcome: "inconclusive", why: "judge_unsure" } })).toEqual(inconclusive("judge_unsure"));
    expect(step({ kind: "live", note: { outcome: "inconclusive" } })).toEqual({
      kind: "live", note: { outcome: "inconclusive", said: WORDS.inconclusive }, evidence: { offlineCheck: { outcome: "inconclusive", said: WORDS.inconclusive } }, logged: { outcome: "inconclusive" }
    });
  });

  it("runs live when the offline check was not tried, logging the refusal code", () => {
    expect(step({ kind: "live", note: { outcome: "not_tried", why: "no_source" } })).toEqual({
      kind: "live",
      note: { outcome: "not_tried", why: "no_source", said: WORDS.notTried },
      evidence: { offlineCheck: { outcome: "not_tried", why: "no_source", said: WORDS.notTried } },
      logged: { outcome: "refused:no_source" }
    });
  });

  it("runs live as inconclusive when a note is malformed", () => {
    const malformed: unknown[] = [
      { kind: "live" },
      { kind: "live", note: null },
      { kind: "live", note: { outcome: "skipped" } },
      { kind: "live", note: { outcome: "passed", why: "x" } },
      { kind: "live", note: { outcome: "passed", traceId: "t-1" } },
      { kind: "live", note: { outcome: "gap", why: "argument_mismatch" } },
      { kind: "live", note: { outcome: "gap", step: 0, why: "argument_mismatch" } },
      { kind: "live", note: { outcome: "gap", step: 2.5, why: "argument_mismatch" } },
      { kind: "live", note: { outcome: "gap", step: 2 } },
      { kind: "live", note: { outcome: "gap", step: 2, why: "Argument Mismatch at https://x" } },
      { kind: "live", note: { outcome: "gap", step: 2, why: "a".repeat(61) } },
      { kind: "live", note: { outcome: "not_tried" } },
      { kind: "live", note: { outcome: "not_tried", why: "" } },
      { kind: "live", note: { outcome: "inconclusive", why: 5 } },
      { kind: "live", note: { outcome: "passed" }, result: result("no") },
      { kind: "live", note: { outcome: "passed" }, checked: { matched: 3 } }
    ];
    for (const answer of malformed) expect(step(answer)).toEqual(inconclusive("offline_answer_invalid"));
  });
});

describe("automationStudioTrialOfflineFirstStep: anything else", () => {
  it("runs live as inconclusive for no answer, a non-object, or an unknown kind", () => {
    for (const answer of [undefined, null, "kept", 1, [], { kind: "offline" }, { kind: "keep", result: result("no") }]) {
      expect(step(answer)).toEqual(inconclusive("offline_answer_invalid"));
    }
  });

  it("never answers keep for any verdict but no and execution_failed", () => {
    for (const verdict of ["yes", "no", "unsure", "not_judged", "execution_failed"]) {
      expect(step({ kind: "kept", result: result(verdict) }).kind).toBe(verdict === "no" || verdict === "execution_failed" ? "keep" : "live");
    }
  });
});

describe("the offline-first contract, as the gates use it", () => {
  it("gives evidence the gate spreads into its own JSON evidence, and a member typed over the gate's request and result", async () => {
    type Result = { revision: number; digest: string; verdict: "yes" | "no" | "execution_failed"; feedback: JsonObject; trialRunId?: string };
    const offlineFirst: AutomationStudioTrialOfflineFirst<{ revision: number; digest: string }, Result> = async (request) =>
      ({ kind: "kept", result: { revision: request.revision, digest: request.digest, verdict: "no", feedback: { code: "x" } }, checked: { matched: 1, recorded: 2 } });
    const kept = automationStudioTrialOfflineFirstStep<Result>(await offlineFirst(expected), expected);
    const live = step({ kind: "live", note: { outcome: "inconclusive" } });
    const keptEvidence: JsonObject = { ok: false, ...kept.evidence };
    const liveEvidence: JsonObject = { ok: false, ...live.evidence };
    expect(keptEvidence).toEqual({ ok: false, checkedAgainst: "recorded_run" });
    expect(liveEvidence).toEqual({ ok: false, offlineCheck: { outcome: "inconclusive", said: WORDS.inconclusive } });
    if (kept.kind === "keep") expect(kept.result.verdict).toBe("no");
  });
});
