// The pre-flight's hold on a build's test (t195-w25): what the test observed is
// checked against the domain's declared keys, and no string anywhere in it may
// be shaped like a locator. The builder drops both first
// (`result-verification/build-test/summary.ts`), so a refusal here is drift.
import { describe, expect, it } from "vitest";
import type { AutomationStudioBuildTestAccount, AutomationStudioRunResultSummary } from "../../../result-verification/index.ts";
import { automationStudioLlmRequestEvidenceRefusal } from "../request-evidence-check.ts";
import type { AutomationStudioLlmTaskRequest } from "../task-request.ts";

const DENIED = ["html", "innerHtml", "outerHtml", "pageSource", "cookies", "headers", "selector"];

function buildTest(steps: AutomationStudioBuildTestAccount["steps"]): AutomationStudioRunResultSummary {
  return {
    schemaVersion: "automation-studio.run-result-summary.v1",
    totalRecordCount: 0, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 0, recordSets: [],
    flowShape: [], withheld: false,
    buildTest: {
      kind: "build_test", test: "ran", steps,
      checklist: [{ id: "a1", verb: "accept", quote: "Accept every friend request from someone with at least five mutual friends", todo: "step_only_reads", step: 4 }],
      missingActs: { acts: [{ id: "a1", reason: "step_only_reads", step: "4" }] }
    }
  };
}

const LISTING = { step: 4, action: "web.input.list-read", target: ["mutual matches /(?:[5-9]|[1-9][0-9]+) mutual/", "name", "mutual"], outcome: "replayed" as const, claims: ["a1"] };

function request(summary: AutomationStudioRunResultSummary): AutomationStudioLlmTaskRequest {
  return {
    requestId: "request.one", idempotencyKey: "request.one", timeoutMs: 20_000, estimatedInputTokens: 100,
    taskKind: "loop_verification", promptVersion: "automation-studio.loop-verification.v1", expectedOutput: "diagnosis",
    tokenLimits: { maxInputTokens: 8_000, maxOutputTokens: 2_000, maxTotalTokens: 10_000 }, maxEstimatedCostUsd: 0.25,
    deniedEvidenceKeys: DENIED,
    context: {
      schemaVersion: "0.1", taskKind: "loop_verification", promptVersion: "automation-studio.loop-verification.v1",
      projectId: "project.one", flowId: "flow.one",
      instructions: { instructions: [], instructionIds: [], diagnostics: [], tokenBudget: 8_000, estimatedTokens: 0 },
      resultSummary: summary
    }
  };
}

describe("a build's test on its way to the judge", () => {
  it("is sent with its steps' words, what a read observed, and the build's own checklist", () => {
    const summary = buildTest([
      { ...LISTING, observed: { rows: [{ name: "Amara Osei", mutual: "23 mutual friends" }] } },
      { step: 5, action: "web.output.dom-click", target: ["Confirm", "Amara Osei23 mutual friendsConfirmDelete"], outcome: "present", withheld: true, runs: { kind: "repeat", over: 4, through: 5 }, explored: { changed: "yes" }, observed: { answer: "present" } }
    ]);
    expect(automationStudioLlmRequestEvidenceRefusal(request(summary))).toBeUndefined();
  });

  it("is refused when a declared key reaches what the test observed", () => {
    const summary = buildTest([{ ...LISTING, observed: { rows: [{ name: "Amara Osei", selector: "div > a" }] } }]);
    expect(automationStudioLlmRequestEvidenceRefusal(request(summary))).toBe("llm.provider_result_summary_invalid");
  });

  it("is refused when a step's words carry a locator", () => {
    const summary = buildTest([{ ...LISTING, target: ["[data-testid=\"confirm\"]"] }]);
    expect(automationStudioLlmRequestEvidenceRefusal(request(summary))).toBe("llm.provider_result_summary_invalid");
  });

  it("is refused when a locator reaches what the test observed, or the build's own findings", () => {
    const observed = buildTest([{ ...LISTING, observed: { rows: [{ name: "Amara Osei", link: "a#friend-17" }] } }]);
    expect(automationStudioLlmRequestEvidenceRefusal(request(observed))).toBe("llm.provider_result_summary_invalid");
    const clean = buildTest([LISTING]);
    const findings = { ...clean, buildTest: { ...clean.buildTest!, missingActs: { acts: [{ id: "a1", step: "div:nth-of-type(4)" }] } } };
    expect(automationStudioLlmRequestEvidenceRefusal(request(findings))).toBe("llm.provider_result_summary_invalid");
  });

  it("leaves a declared key Core's own envelope happens to share alone", () => {
    // `headers` is declared by the domain; here it is a key of a checklist the build wrote, not of anything observed.
    const summary = buildTest([LISTING]);
    const own = { ...summary, buildTest: { ...summary.buildTest!, checklist: [{ id: "a1", headers: "name, mutual" }] } };
    expect(automationStudioLlmRequestEvidenceRefusal(request(own))).toBeUndefined();
  });
});
