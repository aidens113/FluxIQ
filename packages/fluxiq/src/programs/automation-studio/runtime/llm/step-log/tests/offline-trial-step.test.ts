// The step log's offline-trial steps: a build's test call checked against a
// recorded run before the site is touched, written as its own `NNNN-offline`
// folder holding `meta.json` alone, with codes and counts, never trace content.
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { automationStudioActivityRecordedCheck } from "../../../activity/step/index.ts";
import { automationStudioLlmStepLogOfflineTrial, automationStudioLlmStepLogReset, automationStudioLlmStepLogScope } from "../index.ts";

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), "fluxiq-offline-step-"));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

const env = () => ({ FLUXIQ_LLM_STEP_LOG_DIR: directory });
const json = (file: string) => JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;

describe("an offline trial step", () => {
  it("writes only meta.json with the outcome, the gap's step, the counts and the timing", async () => {
    const before = Date.now();
    const answer = await automationStudioLlmStepLogScope.run({ round: 2, phase: "test" }, () => automationStudioLlmStepLogOfflineTrial(
      { trialToolId: "core.test_candidate" },
      async () => ({ verdict: "gap", at: 4 }),
      (result) => ({ outcome: "gap", step: result.at, matchedOperations: 3, recordedOperations: 9 }),
      env()
    ), env());
    const after = Date.now();

    expect(answer).toEqual({ verdict: "gap", at: 4 });
    expect(readdirSync(directory).sort()).toEqual(["0001-offline", "index.md"]);
    expect(readdirSync(path.join(directory, "0001-offline"))).toEqual(["meta.json"]);
    const meta = json(path.join(directory, "0001-offline", "meta.json"));
    expect(meta).toMatchObject({
      step: 1, kind: "offline_trial", trialToolId: "core.test_candidate", callId: null, toolId: null, round: 2, phase: "test",
      status: "ok", outcome: "gap", gapStep: 4, matchedOperations: 3, recordedOperations: 9,
      summary: "Checked against the recorded run (not the site): the recording has no match at step 4"
    });
    const started = Date.parse(String(meta.startedAt)), finished = Date.parse(String(meta.finishedAt));
    expect(started).toBeGreaterThanOrEqual(before);
    expect(finished).toBeGreaterThanOrEqual(started);
    expect(finished).toBeLessThanOrEqual(after);
    expect(readFileSync(path.join(directory, "index.md"), "utf8")).toContain("| 0001 | offline_trial | - | Checked against the recorded run (not the site): the recording has no match at step 4 | - |");
  });

  it("writes no trace id, content or typed value even when the description carries extra fields", async () => {
    // A description object carrying fields the outcome type does not name: the step must whitelist, not copy.
    const withExtras = { outcome: "passed" as const, traceId: "trace-SECRET-1", runId: "run-SECRET-2", page: "price 42.99", typed: "hunter2", matchedOperations: 5, recordedOperations: 5 };
    await automationStudioLlmStepLogOfflineTrial(
      { trialToolId: "core.test_candidate" },
      async () => 1,
      () => withExtras,
      env()
    );
    const text = readFileSync(path.join(directory, "0001-offline", "meta.json"), "utf8");
    for (const secret of ["SECRET", "42.99", "hunter2", "traceId", "runId"]) expect(text).not.toContain(secret);
    expect(json(path.join(directory, "0001-offline", "meta.json"))).toMatchObject({ outcome: "passed", matchedOperations: 5, recordedOperations: 5 });
    expect(readFileSync(path.join(directory, "index.md"), "utf8")).not.toContain("SECRET");
  });

  it("accepts a refusal code and words each outcome plainly", async () => {
    for (const outcome of ["kept_no", "kept_failed", "passed", "inconclusive", "not_tried", "refused:no_trace"]) {
      await automationStudioLlmStepLogOfflineTrial({ trialToolId: "t" }, async () => 0, () => ({ outcome }), env());
    }
    expect(readdirSync(directory).filter((name) => name.endsWith("-offline")).length).toBe(6);
    const last = json(path.join(directory, "0006-offline", "meta.json"));
    expect(last).toMatchObject({ outcome: "refused:no_trace", gapStep: null, matchedOperations: null, recordedOperations: null });
    expect(String(last.summary)).toContain("refused (no_trace)");
    expect(String(json(path.join(directory, "0003-offline", "meta.json")).summary)).toBe("Checked against the recorded run (not the site): it passed");
  });

  it("numbers alongside other steps as a reset does", async () => {
    await automationStudioLlmStepLogReset({ stage: "start_hook" }, async () => 1, String, env());
    await automationStudioLlmStepLogOfflineTrial({ trialToolId: "t" }, async () => 1, () => ({ outcome: "passed" }), env());
    await automationStudioLlmStepLogReset({ stage: "site_check" }, async () => 1, String, env());
    expect(readdirSync(directory).sort()).toEqual(["0001-reset", "0002-offline", "0003-reset", "index.md"]);
  });

  it("records a throw as threw, with no outcome, and rethrows it", async () => {
    const failure = Object.assign(new Error("page said 42.99"), { code: "E_OFF" });
    await expect(automationStudioLlmStepLogOfflineTrial({ trialToolId: "t" }, async () => { throw failure; }, () => ({ outcome: "passed" }), env())).rejects.toBe(failure);
    const meta = json(path.join(directory, "0001-offline", "meta.json"));
    expect(meta).toMatchObject({ kind: "offline_trial", status: "threw", outcome: null });
    expect(JSON.stringify(meta)).not.toContain("42.99");
  });

  it("runs the work untouched and writes nothing when the step log is off", async () => {
    await expect(automationStudioLlmStepLogOfflineTrial({ trialToolId: "t" }, async () => 7, () => ({ outcome: "passed" }), {})).resolves.toBe(7);
    expect(readdirSync(directory)).toEqual([]);
  });

  // t769 b13: the check runs the Flow's steps through Core's executor, whose
  // rows read as testing the Flow on the site; marked, they say they are
  // checked against the recorded run, whether or not the step log is on.
  it.each([["on", env], ["off", () => ({})]] as const)("runs the work as a check against the recorded run, with the step log %s", async (_, environment) => {
    let inside: boolean | undefined;
    await automationStudioLlmStepLogOfflineTrial({ trialToolId: "t" }, async () => {
      await Promise.resolve();
      inside = automationStudioActivityRecordedCheck.active();
    }, () => ({ outcome: "kept_no" }), environment());
    expect(inside).toBe(true);
    expect(automationStudioActivityRecordedCheck.active()).toBe(false);
  });
});
