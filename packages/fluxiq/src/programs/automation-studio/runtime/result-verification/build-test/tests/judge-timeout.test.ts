// The build's judge runs under the build's own per-call timeout, and a judge
// call that timed out is asked again (t473). Live run `run-mv5q4j5c-49bfb5e2`:
// the judge got the harness's 20 s default, was cut off at 19,985 ms in a window
// where the build's 45 s decisions took 35 s and answered, was never asked
// again, and its finished 84-second trial was run again only to be judged.
// No model is called: the provider is scripted, and time is faked.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AutomationStudioFlowInstruction } from "../../../../model/index.ts";
import { AUTOMATION_STUDIO_LLM_DEFAULT_TIMEOUT_MS, AUTOMATION_STUDIO_LLM_MAX_TIMEOUT_MS, type AutomationStudioLlmProvider, type AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import { automationStudioBuildTestJudge } from "../judge.ts";
import { automationStudioBuildTestResultSummary } from "../summary.ts";
import { PICKUP_CART, RUN_40_CLAIMS, RUN_40_STEPS, run40 } from "./live-run-drafts.ts";
import { DENIED, SITE, replayed, report, verified } from "./draft-steps.ts";

const USAGE = { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.001 };
const NO = { answersRequest: "no", observed: "No step adds the napkins.", changed: "Add the napkins." };

const instruction: AutomationStudioFlowInstruction = {
  schemaVersion: "0.1", instructionId: "instruction.flow.goal", title: "Goal", body: PICKUP_CART,
  scope: { kind: "flow", projectId: "project-1", flowId: "flow-1" }, priority: 1, status: "active", requirement: "required", createdAt: 1, updatedAt: 1
};

const summary = () => automationStudioBuildTestResultSummary({
  steps: RUN_40_STEPS, report: report([...RUN_40_STEPS.slice(0, -1).map(replayed), verified(run40.towelsAdd)]), nodes: [],
  instructionText: PICKUP_CART, result: { summary: "Added.", acts: RUN_40_CLAIMS }, startLocation: SITE, deniedEvidenceKeys: DENIED
});

/**
 * A provider whose call `n` takes `slowMs[n]` milliseconds (0 when absent) and
 * then answers no, unless its deadline cut it off first; `never` calls never
 * answer. Each call's start and end on the (faked) clock are kept.
 */
function slow(slowMs: readonly number[], never: ReadonlySet<number> = new Set()) {
  const seen: AutomationStudioLlmTaskRequest[] = [];
  const spans: Array<{ start: number; end?: number }> = [];
  const provider: AutomationStudioLlmProvider = {
    metadata: { provider: "mock", model: "debug-model" },
    runTask: async (request, options) => {
      const call = seen.length, span: { start: number; end?: number } = { start: Date.now() };
      seen.push(request);
      spans.push(span);
      options?.signal?.addEventListener("abort", () => { span.end = Date.now(); }, { once: true });
      if (never.has(call)) return await new Promise<never>(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, slowMs[call] ?? 0));
      // A call its deadline already cut off keeps the moment it was cut off.
      span.end ??= Date.now();
      return { response: { kind: "diagnosis", summary: "Judged.", diagnosis: NO }, usage: USAGE } as Awaited<ReturnType<AutomationStudioLlmProvider["runTask"]>>;
    }
  };
  return { provider, seen, spans };
}

const judge = (provider: AutomationStudioLlmProvider, timeoutMs?: number) =>
  automationStudioBuildTestJudge({ provider, instructions: [instruction], deniedEvidenceKeys: DENIED, projectId: "project-1", flowId: "flow-1", ...(timeoutMs !== undefined ? { timeoutMs } : {}) });

/** Runs `pending` to its end on faked time. */
async function settled<T>(pending: Promise<T>): Promise<T> {
  let done = false;
  void pending.then(() => { done = true; }, () => { done = true; });
  for (let step = 0; step < 100 && !done; step += 1) await vi.advanceTimersByTimeAsync(5_000);
  return await pending;
}

afterEach(() => { vi.useRealTimers(); });

describe("the build's judge and its per-call timeout", () => {
  it("sends each call with the timeout it was given; without one, the harness's 20 s default applied (the live run's cause)", async () => {
    const given = slow([]);
    await judge(given.provider, AUTOMATION_STUDIO_LLM_MAX_TIMEOUT_MS)({ summary: summary() });
    expect(given.seen.map((request) => request.timeoutMs)).toEqual([45_000, 45_000]);

    const unset = slow([]);
    await judge(unset.provider)({ summary: summary() });
    expect(unset.seen[0]?.timeoutMs).toBe(AUTOMATION_STUDIO_LLM_DEFAULT_TIMEOUT_MS);
    expect(AUTOMATION_STUDIO_LLM_DEFAULT_TIMEOUT_MS).toBe(20_000);
  });

  it("a 30 s answer in a slow window is judged under the build's 45 s, where the default cut it off near 19,985 ms and asked again", async () => {
    vi.useFakeTimers();
    const underBuild = slow([30_000]);
    const verdict = await settled(judge(underBuild.provider, AUTOMATION_STUDIO_LLM_MAX_TIMEOUT_MS)({ summary: summary() }));
    expect(verdict).toMatchObject({ verdict: "no", spent: { calls: 2 } });
    expect(underBuild.spans[0]!.end! - underBuild.spans[0]!.start).toBe(30_000);

    // The live run's shape: the default deadline ends the first call at 20 s (measured there as 19,985 ms) ...
    const underDefault = slow([30_000]);
    const asked = await settled(judge(underDefault.provider)({ summary: summary() }));
    expect(underDefault.spans[0]!.end! - underDefault.spans[0]!.start).toBe(20_000);
    // ... and it is now asked again on the same evidence, and its answer is the verdict: no trial is run again for it.
    expect(underDefault.seen).toHaveLength(3);
    expect(underDefault.seen[1]?.context.resultSummary).toEqual(underDefault.seen[0]?.context.resultSummary);
    expect(asked).toMatchObject({ verdict: "no", observed: NO.observed, spent: { calls: 3 } });
  });

  it("a judge that still cannot answer is not judged, with the cause, never a no or an unsure verdict", async () => {
    vi.useFakeTimers();
    const silent = slow([], new Set([0, 1, 2, 3]));
    const verdict = await settled(judge(silent.provider, AUTOMATION_STUDIO_LLM_MAX_TIMEOUT_MS)({ summary: summary() }));
    // Asked twice, each cut off at the build's 45 s, inside the judgement's deadline (4 x 45 s + 30 s).
    expect(silent.seen).toHaveLength(2);
    expect(silent.spans.map((span) => span.end! - span.start)).toEqual([45_000, 45_000]);
    expect(verdict).toMatchObject({ verdict: "not_judged", spent: { calls: 2 } });
    if (verdict.verdict !== "not_judged") return;
    // The cause first, then how often it was asked, and that it is no finding against the Flow.
    expect(verdict.why).toMatch(/^The run's result was never judged: the judge ran out of time before it answered\./u);
    expect(verdict.why).toContain("asked 2 times with the same evidence and could not answer");
    expect(verdict.why).toContain("not a finding about the Flow");
  });
});
