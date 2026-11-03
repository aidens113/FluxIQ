// The step log's reset steps: the site reset a trial runs before it acts,
// written as its own `NNNN-reset` folder with timing and Core's codes only, so
// the Lab can tell a trial's reset from its replay.
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { automationStudioLlmStepLogReset, automationStudioLlmStepLogScope } from "../index.ts";

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), "fluxiq-reset-step-"));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

const env = () => ({ FLUXIQ_LLM_STEP_LOG_DIR: directory });
const json = (file: string) => JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;

describe("a reset step", () => {
  it("writes only meta.json, with the stage, the trial tool, the outcome code and the timing around the work", async () => {
    const before = Date.now();
    const answer = await automationStudioLlmStepLogScope.run({ round: 3, phase: "explore" }, () => automationStudioLlmStepLogReset(
      { stage: "site_check", trialToolId: "core.test_candidate" },
      async () => ({ kind: "admit" as const, evidence: { page: "secret row 42.99" } }),
      (decision) => decision.kind,
      env()
    ), env());
    const after = Date.now();

    expect(answer).toEqual({ kind: "admit", evidence: { page: "secret row 42.99" } });
    expect(readdirSync(directory).sort()).toEqual(["0001-reset", "index.md"]);
    expect(readdirSync(path.join(directory, "0001-reset"))).toEqual(["meta.json"]);
    const meta = json(path.join(directory, "0001-reset", "meta.json"));
    expect(meta).toMatchObject({ step: 1, kind: "reset", stage: "site_check", trialToolId: "core.test_candidate", callId: null, toolId: null, round: 3, phase: "explore", status: "ok", outcome: "admit" });
    const started = Date.parse(String(meta.startedAt)), finished = Date.parse(String(meta.finishedAt));
    expect(started).toBeGreaterThanOrEqual(before);
    expect(finished).toBeGreaterThanOrEqual(started);
    expect(finished).toBeLessThanOrEqual(after);
    // What the reset saw never reaches the step: no page, no values.
    expect(readFileSync(path.join(directory, "0001-reset", "meta.json"), "utf8")).not.toContain("42.99");
    expect(readFileSync(path.join(directory, "index.md"), "utf8")).toContain("| 0001 | reset | - | site_check admit in core.test_candidate | - |");
  });

  it("writes a start hook with no trial tool and its own phase outside every scope", async () => {
    await automationStudioLlmStepLogReset({ stage: "start_hook" }, async () => ({ status: "reset" }), (start) => start.status, env());
    expect(json(path.join(directory, "0001-reset", "meta.json"))).toMatchObject({ kind: "reset", stage: "start_hook", trialToolId: null, phase: "reset", outcome: "reset" });
  });

  it("records a throw as threw, with no outcome, and rethrows it", async () => {
    const failure = Object.assign(new Error("the page said 42.99"), { code: "E_RESET" });
    await expect(automationStudioLlmStepLogReset({ stage: "site_check", trialToolId: "core.test_subflow" }, async () => { throw failure; }, () => "never", env())).rejects.toBe(failure);
    const meta = json(path.join(directory, "0001-reset", "meta.json"));
    expect(meta).toMatchObject({ kind: "reset", status: "threw", outcome: null });
    expect(JSON.stringify(meta)).not.toContain("42.99");
  });

  it("runs the work untouched and writes nothing when the step log is off", async () => {
    await expect(automationStudioLlmStepLogReset({ stage: "start_hook" }, async () => 7, String, {})).resolves.toBe(7);
    expect(readdirSync(directory)).toEqual([]);
  });
});
