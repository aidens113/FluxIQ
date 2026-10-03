// What the judge of a build's test is shown of a repeated step (t252 D6): one
// line per pass under its step, naming the row by the label the span's list
// read gave it, never by the row's values.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowDraftReplayOutcome, AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { automationStudioLlmRequestEvidenceRefusal, type AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import type { AutomationStudioRunResultSummary } from "../../contracts.ts";
import { automationStudioBuildTestResultSummary, type AutomationStudioBuildTestReportInput } from "../summary.ts";
import { DENIED, SITE, navigate, replayed } from "./draft-steps.ts";

const LIST = "Read every listing's title and price.";

function step(position: number, actionId: string, effect: "observe" | "mutate", parameters: JsonObject, extra: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep {
  return {
    position, id: `d${position}`, iteration: position, actionId,
    input: { node: actionId, parameters }, ranWith: { node: actionId, parameters },
    effect, ...(effect === "mutate" ? { effectApplied: true } : {}), proposes: true, disposition: "kept",
    replay: { from: { location: SITE } }, ...extra
  };
}

const start = navigate(1);
const list = step(2, "node.read_list", "observe", { list: "listings" });
const open = step(3, "node.read_detail", "observe", { title: { $state: { path: "item.title" } } }, { routing: { kind: "repeat", over: "d2", through: "d4" } });
const save = step(4, "node.save", "mutate", { title: { $state: { path: "item.title" } } }, { consequences: [] } as Partial<AutomationStudioFlowDraftStep>);

/** An outcome with the walker's passes, before its type carries them. */
function withPasses(target: AutomationStudioFlowDraftStep, passes: Array<{ pass: number; status: string; resultCode?: string }>): AutomationStudioFlowDraftReplayOutcome {
  const status = passes.find((item) => item.status !== "replayed")?.status ?? "replayed";
  return { ...replayed(target), status, passes } as AutomationStudioFlowDraftReplayOutcome;
}

function loopReport(): AutomationStudioBuildTestReportInput {
  const detail = (pass: number, said: string) => ({ step: 3, stepId: "d3", pass, of: 3, evidence: { ok: true, said } });
  return {
    verdict: {
      outcomes: [
        replayed(start),
        replayed(list),
        withPasses(open, [{ pass: 1, status: "replayed" }, { pass: 2, status: "replayed" }, { pass: 3, status: "failed", resultCode: "core.replay.failed" }]),
        withPasses(save, [{ pass: 1, status: "replayed" }, { pass: 2, status: "replayed" }, { pass: 3, status: "replayed" }])
      ]
    },
    observations: [
      { step: 2, stepId: "d2", evidence: { ok: true, said: "kept 3 rows", readRows: { rows: [{ title: "Oak desk" }, { password: "Pine shelf" }, { title: "Ash chair" }] } } },
      detail(1, "the detail opened"),
      detail(2, "the detail opened"),
      detail(3, "no detail on this row"),
      { step: 4, stepId: "d4", pass: 1, of: 3, evidence: { ok: true, said: "saved" } }
    ],
    reused: false
  };
}

function judged(steps: AutomationStudioFlowDraftStep[], report: AutomationStudioBuildTestReportInput): AutomationStudioRunResultSummary {
  return automationStudioBuildTestResultSummary({ steps, report, nodes: [], instructionText: LIST, startLocation: SITE, deniedEvidenceKeys: [...DENIED, "password"] });
}

describe("a repeated step's passes", () => {
  const summary = judged([start, list, open, save], loopReport());
  const steps = summary.buildTest!.steps;

  it("are one line each under their step, naming the row by its screened label, with each pass's own outcome and observation", () => {
    expect(steps[2]).toMatchObject({ step: 3, outcome: "failed" });
    expect(steps[2]?.observed).toBeUndefined();
    expect(steps[2]?.passes).toEqual([
      { pass: 1, row: "Oak desk", outcome: "replayed", observed: { ok: true, said: "the detail opened" } },
      { pass: 2, row: "(withheld)", outcome: "replayed", observed: { ok: true, said: "the detail opened" } },
      { pass: 3, row: "Ash chair", outcome: "failed", observed: { ok: true, said: "no detail on this row" } }
    ]);
    expect(summary.withheld).toBe(true);
  });

  it("show a change run again by its row and outcome only, as its step observes nothing", () => {
    expect(steps[3]?.passes).toEqual([
      { pass: 1, row: "Oak desk", outcome: "replayed" },
      { pass: 2, row: "(withheld)", outcome: "replayed" },
      { pass: 3, row: "Ash chair", outcome: "replayed" }
    ]);
    expect(steps[3]?.observed).toBeUndefined();
  });

  it("never carry a row's value from a denied column, and pass the provider's pre-flight", () => {
    expect(JSON.stringify(summary)).not.toContain("Pine shelf");
    expect(automationStudioLlmRequestEvidenceRefusal(verificationRequest(summary))).toBeUndefined();
  });

  it("carry the pass number only when the list named no label for that row", () => {
    const report = loopReport();
    const bare = { ...report, observations: report.observations.map((item) => item.step === 2 ? { ...item, evidence: { ok: true, said: "kept 3 rows" } } : item) };
    expect(judged([start, list, open, save], bare).buildTest!.steps[3]?.passes?.map((pass) => pass.row)).toEqual([undefined, undefined, undefined]);
  });

  it("are absent for a step outside a repeated span, which reads as before", () => {
    expect(steps[0]?.passes).toBeUndefined();
    expect(steps[1]?.passes).toBeUndefined();
    expect(steps[1]?.observed).toMatchObject({ readRows: { rows: ["Oak desk", "(withheld)", "Ash chair"] } });
  });
});

function verificationRequest(summary: AutomationStudioRunResultSummary): AutomationStudioLlmTaskRequest {
  return {
    requestId: "request.one",
    idempotencyKey: "request.one",
    timeoutMs: 20_000,
    estimatedInputTokens: 100,
    taskKind: "loop_verification",
    promptVersion: "automation-studio.loop-verification.v1",
    expectedOutput: "diagnosis",
    tokenLimits: { maxInputTokens: 8_000, maxOutputTokens: 2_000, maxTotalTokens: 10_000 },
    maxEstimatedCostUsd: 0.25,
    deniedEvidenceKeys: [...DENIED, "password"],
    context: {
      schemaVersion: "0.1",
      taskKind: "loop_verification",
      promptVersion: "automation-studio.loop-verification.v1",
      projectId: "project.one",
      flowId: "flow.one",
      instructions: { instructions: [], instructionIds: [], diagnostics: [], tokenBudget: 8_000, estimatedTokens: 0 },
      resultSummary: summary
    }
  };
}
