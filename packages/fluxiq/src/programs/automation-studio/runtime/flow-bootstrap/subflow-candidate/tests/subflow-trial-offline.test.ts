// An offline trial at the subflow trial gate (traces and offline trials,
// Decisions 3 and 6), as at the whole gate: no start hook and no site reset,
// and its yes is evidence only, never the yes that completes the brief.
//
// And an offline-first check (trace plan P6, t769; D40-D46): a port's
// `offlineFirst`, asked once per revision and digest before any site action.
// A failure the recording demonstrates is kept as the trial, with no reset,
// no hook and nothing on the site; anything else runs live in the same call.
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioRunEnvironmentKind } from "../../../environment/index.ts";
import { AUTOMATION_STUDIO_CANDIDATE_OFFLINE_YES_INSTRUCTION, automationStudioCandidateTrialView } from "../../candidate/index.ts";
import type { AutomationStudioLlmEvidenceTool } from "../../../llm/evidence-loop.ts";
import { AUTOMATION_STUDIO_TRIAL_OFFLINE_FIRST_WORDS as WORDS, type AutomationStudioTrialOfflineFirst } from "../../offline-first/index.ts";
import type { AutomationStudioSiteResetTrialReset } from "../../site-reset/index.ts";
import { AutomationStudioSubflowTrialGate, type AutomationStudioSubflowProposal, type AutomationStudioSubflowTrialPreparingPort, type AutomationStudioSubflowTrialRequest, type AutomationStudioSubflowTrialResult, type AutomationStudioSubflowTrialWeighed } from "../index.ts";
import { testScope } from "./subflow-fixture.ts";

const scope = testScope();
const identity = { buildId: scope.buildId, briefId: scope.briefId, planDigest: scope.planDigest, subflowKey: scope.subflowKey };
const proposal: AutomationStudioSubflowProposal = { scope: identity, revision: 2, digest: "d".repeat(64), subflows: [], summary: "Find", changedPaths: [] };
const receipt: JsonObject = { revision: proposal.revision, digest: proposal.digest };

/** A gate whose port answers the verdicts given in turn under `kind`, with a start hook and a reset that count their calls. */
function gateOf(kind: AutomationStudioRunEnvironmentKind | undefined, verdicts: AutomationStudioSubflowTrialResult["verdict"][], whole?: true) {
  const calls = { trials: 0, hooks: 0, resets: 0, ran: 0 };
  const run = async (request: AutomationStudioSubflowTrialRequest): Promise<AutomationStudioSubflowTrialResult> => {
    calls.trials += 1;
    return { partial: true, scope: "subflow", identity: { ...request.proposal.scope }, revision: request.proposal.revision, digest: request.proposal.digest, verdict: verdicts.shift() ?? "yes", feedback: { said: "ok" }, entryPrepared: true };
  };
  const port: AutomationStudioSubflowTrialPreparingPort = Object.assign(run, {
    environmentKind: kind,
    prepareStart: async () => {
      calls.hooks += 1;
      return "reset" as const;
    }
  });
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
  const gate = new AutomationStudioSubflowTrialGate({ scope, latest: () => structuredClone(proposal), port, reset, ...(whole ? { whole } : {}) });
  return { gate, calls };
}

describe("an offline trial at the subflow trial gate", () => {
  it("runs no start hook and no site reset, and records nothing it did as left on the site", async () => {
    const { gate, calls } = gateOf("trace", ["no"]);
    const answered = await gate.test(receipt);
    expect(calls).toEqual({ trials: 1, hooks: 0, resets: 0, ran: 0 });
    expect(answered.evidence).toMatchObject({ verdict: "no", partial: true });
  });

  it("answers its yes as evidence, never keeps it, so the brief cannot complete on it, the judged whole run included", async () => {
    for (const whole of [undefined, true as const]) {
      const { gate } = gateOf("fixture", ["unsure", "yes"], whole);
      await gate.test(receipt);
      expect(gate.standing(proposal)?.verdict).toBe("unsure");
      const answered = await gate.test(receipt);
      expect(answered).toMatchObject({ resultCode: "subflow.trial_offline_yes", resultReason: "retry_allowed" });
      expect(answered.evidence).toMatchObject({ ok: false, verdict: "yes", retestsLeft: 1, instruction: AUTOMATION_STUDIO_CANDIDATE_OFFLINE_YES_INSTRUCTION });
      expect(gate.standing(proposal)).toBeUndefined();
      expect(gate.completion(proposal)).toMatchObject({ ok: false, issueCodes: ["subflow.trial_required"] });
    }
  });

  it("treats a port with no kind, or a live one, as before: hook, reset, and a yes that completes", async () => {
    for (const kind of [undefined, "live" as const]) {
      const { gate, calls } = gateOf(kind, ["yes"]);
      const answered = await gate.test(receipt);
      expect(calls).toEqual({ trials: 1, hooks: 1, resets: 1, ran: 1 });
      expect(answered).toMatchObject({ resultCode: "subflow.trial_yes", evidence: { ok: true, verdict: "yes" } });
      expect(gate.completion(proposal)).toEqual({ ok: true });
    }
  });
});

type OfflineFirst = AutomationStudioTrialOfflineFirst<AutomationStudioSubflowTrialRequest, AutomationStudioSubflowTrialResult>;
/** A port's answer; `checkedAgainst` where the port says it answered from the recording (the single-subflow whole test, P6 D48). */
type LiveAnswer = { verdict: AutomationStudioSubflowTrialResult["verdict"]; feedback?: JsonObject; checkedAgainst?: "recorded_run" };

/** An execution-failed run's feedback: step 3 failed and the run stopped there. */
const STOPPED: JsonObject = { code: "candidate.execution_incomplete", steps: [{ step: 3, definitionId: "web.output.dom-press", label: "open the next page", status: "failed", failureCode: "web.target.not_found", retryable: true }] };

/** A result as the offline-first service keeps it: this brief's subflow, revision and digest, its entry prepared. */
function recorded(verdict: AutomationStudioSubflowTrialResult["verdict"], feedback: JsonObject = { code: "subflow.trial_no", judge: { advice: "keep only the listed rows" } }): AutomationStudioSubflowTrialResult {
  return { partial: true, scope: "subflow", identity: { ...identity }, revision: proposal.revision, digest: proposal.digest, verdict, feedback, entryPrepared: true };
}

/** A gate whose port has `offlineFirst` (when given) and answers the live verdicts in turn, counting each site action. */
function firstGate(offlineFirst: OfflineFirst | undefined, answers: LiveAnswer[]) {
  const calls = { offline: 0, admissions: 0, hooks: 0, resets: 0, trials: 0, ran: 0 };
  const weighed: AutomationStudioSubflowTrialWeighed[] = [];
  const asked: AutomationStudioSubflowTrialRequest[] = [];
  const run = async (request: AutomationStudioSubflowTrialRequest): Promise<AutomationStudioSubflowTrialResult> => {
    calls.trials += 1;
    const next = answers.shift() ?? { verdict: "yes" };
    return { partial: true, scope: "subflow", identity: { ...request.proposal.scope }, revision: request.proposal.revision, digest: request.proposal.digest, verdict: next.verdict, feedback: structuredClone(next.feedback ?? { said: "ok" }), entryPrepared: true, ...(next.checkedAgainst ? { checkedAgainst: next.checkedAgainst } : {}) };
  };
  const port: AutomationStudioSubflowTrialPreparingPort = Object.assign(run, {
    prepareStart: async () => {
      calls.hooks += 1;
      return "reset" as const;
    },
    weighed: (trial: AutomationStudioSubflowTrialWeighed) => {
      weighed.push(trial);
    },
    ...(offlineFirst ? {
      offlineFirst: async (request: AutomationStudioSubflowTrialRequest) => {
        calls.offline += 1;
        asked.push(request);
        return await offlineFirst(request);
      }
    } : {})
  });
  const control = { refuseNext: false };
  const reset: AutomationStudioSiteResetTrialReset = {
    admit: () => {
      calls.admissions += 1;
      return { kind: "admit" };
    },
    beforeTrial: async () => {
      calls.resets += 1;
      if (!control.refuseNext) return { kind: "admit" };
      control.refuseNext = false;
      return { kind: "refuse", evidence: { ok: false, code: "candidate.trial_reset_required" }, moved: false };
    },
    trialRan: () => {
      calls.ran += 1;
      return [];
    }
  };
  const gate = new AutomationStudioSubflowTrialGate({ scope, latest: () => structuredClone(proposal), port, reset });
  return { gate, calls, weighed, asked, reset: control };
}

/** `body` with the step log written to a fresh directory, which it is handed. */
async function withStepLog(body: (directory: string) => Promise<void>): Promise<void> {
  const directory = mkdtempSync(path.join(tmpdir(), "fluxiq-subflow-offline-first-"));
  const before = process.env.FLUXIQ_LLM_STEP_LOG_DIR;
  process.env.FLUXIQ_LLM_STEP_LOG_DIR = directory;
  try {
    await body(directory);
  } finally {
    if (before === undefined) delete process.env.FLUXIQ_LLM_STEP_LOG_DIR;
    else process.env.FLUXIQ_LLM_STEP_LOG_DIR = before;
    rmSync(directory, { recursive: true, force: true });
  }
}

function meta(directory: string, folder: string): JsonObject {
  return JSON.parse(readFileSync(path.join(directory, folder, "meta.json"), "utf8")) as JsonObject;
}

/** `text` as a regular expression that matches it literally. */
function literal(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

describe("an offline-first check at the subflow trial gate", () => {
  it("keeps a no the recording demonstrates as the trial: no admission, hook, reset or site trial, its digest closed, said as checked against the recording", async () => {
    await withStepLog(async (directory) => {
      const { gate, calls, weighed } = firstGate(async () => ({ kind: "kept", result: recorded("no"), checked: { matched: 4, recorded: 4 } }), []);
      const answered = await gate.test(receipt);
      expect(calls).toEqual({ offline: 1, admissions: 0, hooks: 0, resets: 0, trials: 0, ran: 0 });
      expect(answered).toMatchObject({ resultCode: "subflow.trial_no", effectApplied: true, evidence: { ok: false, verdict: "no", entryPrepared: true, checkedAgainst: "recorded_run" } });
      const evidence = answered.evidence as JsonObject;
      expect(String(evidence.instruction)).toMatch(new RegExp(`^${literal(WORDS.kept)} The judge found this subflow did not do what its parts ask`, "u"));
      expect(evidence).not.toHaveProperty("offlineCheck");
      expect(evidence).not.toHaveProperty("leftOnSite");
      expect(evidence).not.toHaveProperty("retestsLeft");
      expect(weighed.map((trial) => trial.answer.verdict)).toEqual(["no"]);
      expect(gate.refuted(proposal.digest)).toMatchObject({ code: "subflow.trial_no" });
      expect((await gate.test(receipt)).evidence).toMatchObject({ ok: false, code: "subflow.trial_unchanged_after_no" });
      expect(gate.completion(proposal)).toMatchObject({ ok: false, issueCodes: ["subflow.trial_unchanged_after_no"] });
      expect(calls.offline).toBe(1);
      // The offline step is the only step: no reset step was written.
      expect(readdirSync(directory).sort()).toEqual(["0001-offline", "index.md"]);
      expect(meta(directory, "0001-offline")).toMatchObject({ kind: "offline_trial", trialToolId: "core.test_subflow", status: "ok", outcome: "kept_no", matchedOperations: 4, recordedOperations: 4 });
    });
  });

  it("after an offline pass, puts the site back and runs live, and keeps the live answer with the note", async () => {
    const { gate, calls, asked } = firstGate(async () => ({ kind: "live", note: { outcome: "passed" } }), [{ verdict: "yes" }]);
    const answered = await gate.test(receipt);
    expect(calls).toEqual({ offline: 1, admissions: 1, hooks: 1, resets: 1, trials: 1, ran: 1 });
    expect(asked[0]).toMatchObject({ proposal: { revision: proposal.revision, digest: proposal.digest } });
    expect(asked[0]).not.toHaveProperty("startedWith");
    expect(answered).toMatchObject({ resultCode: "subflow.trial_yes", evidence: { ok: true, verdict: "yes", offlineCheck: { outcome: "passed", said: WORDS.passed } } });
    expect(answered.evidence).not.toHaveProperty("checkedAgainst");
    expect(gate.completion(proposal)).toEqual({ ok: true });
  });

  it("over a gap, runs live in the same call with the gap's step in the note, and every retest of that revision is live", async () => {
    await withStepLog(async (directory) => {
      const { gate, calls } = firstGate(async () => ({ kind: "live", note: { outcome: "gap", step: 3, why: "missing_transition" } }), [{ verdict: "unsure" }, { verdict: "yes" }]);
      const first = await gate.test(receipt);
      expect(calls).toMatchObject({ offline: 1, hooks: 1, resets: 1, trials: 1, ran: 1 });
      expect(first.evidence).toMatchObject({ verdict: "unsure", offlineCheck: { outcome: "gap", step: 3, why: "missing_transition", said: WORDS.gap(3, "missing_transition") } });
      // The offline step is timed before the site's reset step.
      expect(readdirSync(directory).sort()).toEqual(["0001-offline", "0002-reset", "index.md"]);
      expect(meta(directory, "0001-offline")).toMatchObject({ outcome: "gap", gapStep: 3 });
      const second = await gate.test(receipt);
      expect(calls).toMatchObject({ offline: 1, hooks: 2, resets: 2, trials: 2 });
      expect(second).toMatchObject({ resultCode: "subflow.trial_yes" });
      expect(second.evidence).not.toHaveProperty("offlineCheck");
    });
  });

  it("counts a recorded stop as one trial, retests live, and closes the revision when the live trial stops the same way", async () => {
    const { gate, calls } = firstGate(async () => ({ kind: "kept", result: recorded("execution_failed", structuredClone(STOPPED)) }), [{ verdict: "execution_failed", feedback: STOPPED }]);
    const first = await gate.test(receipt);
    expect(calls).toMatchObject({ offline: 1, hooks: 0, resets: 0, trials: 0, ran: 0 });
    expect(first).toMatchObject({ resultCode: "subflow.trial_execution_failed", resultReason: "retry_allowed", evidence: { checkedAgainst: "recorded_run", retestsLeft: 2, feedback: { stoppedBy: { kind: "step", step: 3 } } } });
    expect(String((first.evidence as JsonObject).instruction)).toMatch(new RegExp(`^${literal(WORDS.kept)} The subflow did not run to its end`, "u"));
    const second = await gate.test(receipt);
    expect(calls).toMatchObject({ offline: 1, hooks: 1, resets: 1, trials: 1, ran: 1 });
    expect(second.evidence).toMatchObject({ verdict: "execution_failed", retestsLeft: 0, failedStep: { kind: "step", step: 3 } });
    expect(second.evidence).not.toHaveProperty("checkedAgainst");
    expect((await gate.test(receipt)).evidence).toMatchObject({ ok: false, code: "subflow.trial_same_failure" });
    expect(calls.trials).toBe(1);
  });

  it("never keeps a recorded yes, nor a kept result about another subflow: both run live, said inconclusive", async () => {
    const other: AutomationStudioSubflowTrialResult = { ...recorded("no"), identity: { ...identity, subflowKey: "checkout" } };
    for (const result of [recorded("yes"), other]) {
      const { gate, calls } = firstGate(async () => ({ kind: "kept", result: structuredClone(result) }), [{ verdict: "no" }]);
      const answered = await gate.test(receipt);
      expect(calls).toMatchObject({ offline: 1, hooks: 1, resets: 1, trials: 1, ran: 1 });
      expect(answered.evidence).toMatchObject({ verdict: "no", offlineCheck: { outcome: "inconclusive", said: WORDS.inconclusive } });
      expect(answered.evidence).not.toHaveProperty("checkedAgainst");
    }
  });

  it("logs a check not tried but adds nothing to the evidence (D46), and runs live after an offline check that threw", async () => {
    await withStepLog(async (directory) => {
      const { gate } = firstGate(async () => ({ kind: "live", note: { outcome: "not_tried", why: "no_source" } }), [{ verdict: "yes" }]);
      const answered = await gate.test(receipt);
      expect(answered).toMatchObject({ resultCode: "subflow.trial_yes" });
      expect(answered.evidence).not.toHaveProperty("offlineCheck");
      expect(meta(directory, "0001-offline")).toMatchObject({ outcome: "refused:no_source" });
    });
    const threw = firstGate(async () => {
      throw new TypeError("secret recorded page text");
    }, [{ verdict: "no" }]);
    const answered = await threw.gate.test(receipt);
    expect(threw.calls).toMatchObject({ offline: 1, hooks: 1, trials: 1 });
    expect(answered.evidence).toMatchObject({ verdict: "no", offlineCheck: { outcome: "inconclusive", said: WORDS.inconclusive } });
    expect(JSON.stringify(answered)).not.toContain("secret recorded page text");
  });

  it("lets an abort during the offline check propagate, with nothing done on the site", async () => {
    const controller = new AbortController();
    const { gate, calls } = firstGate(async () => {
      controller.abort();
      throw new Error("aborted");
    }, []);
    await expect(gate.test(receipt, controller.signal)).rejects.toThrow();
    expect(calls).toEqual({ offline: 1, admissions: 0, hooks: 0, resets: 0, trials: 0, ran: 0 });
  });

  it("asks once per revision and digest, even when the reset refused the first test and nothing was counted", async () => {
    const { gate, calls, reset } = firstGate(async () => ({ kind: "live", note: { outcome: "passed" } }), [{ verdict: "yes" }]);
    reset.refuseNext = true;
    expect((await gate.test(receipt)).evidence).toMatchObject({ code: "candidate.trial_reset_required" });
    const answered = await gate.test(receipt);
    expect(calls).toMatchObject({ offline: 1, resets: 2, trials: 1 });
    expect(answered).toMatchObject({ resultCode: "subflow.trial_yes" });
  });

  it("asks nothing of a port without offlineFirst: today's live trial", async () => {
    const { gate, calls } = firstGate(undefined, [{ verdict: "yes" }]);
    const answered = await gate.test(receipt);
    expect(calls).toEqual({ offline: 0, admissions: 1, hooks: 1, resets: 1, trials: 1, ran: 1 });
    expect(answered.evidence).not.toHaveProperty("offlineCheck");
    expect(answered.evidence).not.toHaveProperty("checkedAgainst");
  });
});

/** The builder loop's after-trial page look (`../builder-loop.ts`, `automationStudioCandidateTrialView`). */
const LOOK: AutomationStudioLlmEvidenceTool = { toolId: "core.run_node", description: "Run a node", inputSchema: { type: "object" }, effect: "mutate", perCallEffect: true, initialObservation: { input: { node: "web.inspect" } } };

/** How many page looks the builder loop sends after `answered`. */
async function looksAfter(answered: Awaited<ReturnType<AutomationStudioSubflowTrialGate["test"]>>): Promise<number> {
  const executeTool = vi.fn(async () => ({ kind: "llm_evidence_tool_execution" as const, evidence: { page: "a page" }, effectApplied: false }));
  await automationStudioCandidateTrialView({ answer: answered, tools: [LOOK], executeTool, callId: "call.1" });
  return executeTool.mock.calls.length;
}

describe("a port's answer from the recording (the single-subflow whole test kept it, P6 D48)", () => {
  it("is said and kept as the gate's own kept answer: checkedAgainst on top, the recording's words first, nothing left on the site, no page look", async () => {
    const { gate, calls, weighed } = firstGate(undefined, [{ verdict: "no", feedback: { code: "subflow.trial_no" }, checkedAgainst: "recorded_run" }]);
    const answered = await gate.test(receipt);
    // The hook and reset before the port's call still run (t775 owns them); nothing after it is recorded as on the site.
    expect(calls).toEqual({ offline: 0, admissions: 1, hooks: 1, resets: 1, trials: 1, ran: 0 });
    expect(answered).toMatchObject({ resultCode: "subflow.trial_no", evidence: { ok: false, verdict: "no", entryPrepared: true, checkedAgainst: "recorded_run" } });
    const evidence = answered.evidence as JsonObject;
    expect(String(evidence.instruction)).toMatch(new RegExp(`^${literal(WORDS.kept)} The judge found this subflow did not do what its parts ask`, "u"));
    expect(evidence).not.toHaveProperty("leftOnSite");
    expect(evidence).not.toHaveProperty("offlineCheck");
    expect(weighed.map((trial) => trial.answer.verdict)).toEqual(["no"]);
    expect(gate.refuted(proposal.digest)).toMatchObject({ code: "subflow.trial_no" });
    expect(await looksAfter(answered)).toBe(0);
  });

  it("never keeps a yes the port says the recording gave as the yes that completes", async () => {
    const { gate, calls } = firstGate(undefined, [{ verdict: "yes", checkedAgainst: "recorded_run" }]);
    const answered = await gate.test(receipt);
    expect(calls).toMatchObject({ trials: 1, ran: 0 });
    expect(answered).toMatchObject({ resultCode: "subflow.trial_offline_yes", evidence: { ok: false, verdict: "yes", checkedAgainst: "recorded_run" } });
    expect(gate.completion(proposal)).toMatchObject({ ok: false, issueCodes: ["subflow.trial_required"] });
  });

  it("leaves a live answer of the same port as it was: recorded as left on the site, no recording's words, and the page looked at", async () => {
    const { gate, calls } = firstGate(undefined, [{ verdict: "no", feedback: { code: "subflow.trial_no" } }]);
    const answered = await gate.test(receipt);
    expect(calls).toEqual({ offline: 0, admissions: 1, hooks: 1, resets: 1, trials: 1, ran: 1 });
    expect(answered.evidence).not.toHaveProperty("checkedAgainst");
    expect(String((answered.evidence as JsonObject).instruction).startsWith(WORDS.kept)).toBe(false);
    expect(await looksAfter(answered)).toBe(1);
  });
});
