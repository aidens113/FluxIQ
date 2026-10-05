// What the judge of a build's test is shown of a replayed press's effect
// (t174-w106, merged with t193 1003 w3 in t264). What the judge is told about
// the page the test ran on is tested beside its prompt
// (`llm/tests/diagnosis-channel.test.ts`); which answers of a changing step are
// sent at all, beside the summary (`./summary.test.ts`, the run-musp4h2f shape).
//
// Live run `run-musp8nz1-dbd3905a` (lane A, Cause 2): the Flow pressed Space
// Grey twice, the replay recorded "t941 "Space Grey" no longer marked" and then
// "now marked", and both judges were shown `replayed` twice.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { automationStudioLlmRequestEvidenceRefusal, type AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import type { AutomationStudioRunResultSummary } from "../../contracts.ts";
import { automationStudioBuildTestChangeLines } from "../change-lines.ts";
import { automationStudioBuildTestResultSummary } from "../summary.ts";
import { DENIED, SITE, navigate, replayed, report, verified, web } from "./draft-steps.ts";

const ITEM = `${SITE}item/1`;
const go = navigate(1);
const unchoose = web(2, "web.output.dom-click", { selector: "#grey", visibleText: "Space Grey" }, ITEM);
const choose = web(3, "web.output.dom-click", { selector: "#grey", visibleText: "Space Grey" }, ITEM);
const add = web(4, "web.output.dom-click", { selector: "#add", visibleText: "Add to cart" }, ITEM);

/** The replay's answers, as the web domain wrote them in the run (0040, 0041). */
const UNCHOSE = { ok: true, code: "core.replay.replayed", said: "the step ran again", changed: [
  "t939 \"Space Grey\" gone",
  "t1109 \"Poland\" no longer disabled",
  "t967 \"186 pieces available\" gone",
  "t1007 \"19,99 €\" gone",
  "t941 \"Space Grey\" no longer marked"
] };
const CHOSE = { ok: true, code: "core.replay.replayed", said: "the step ran again", changed: ["t941 \"Space Grey\" now marked"] };

const summary = () => automationStudioBuildTestResultSummary({
  steps: [go, unchoose, choose, add],
  report: report([replayed(go), replayed(unchoose), replayed(choose), verified(add)], [[unchoose, UNCHOSE], [choose, CHOSE]]),
  nodes: [], instructionText: "Put the Space Grey hub in my cart.", startLocation: SITE, deniedEvidenceKeys: DENIED
});

describe("a replayed press's change lines", () => {
  it("are shown on its row, the lines about the control it pressed first, and at most a few", () => {
    const steps = summary().buildTest!.steps;
    const first = steps.find((step) => step.step === 2)?.observed as JsonObject;
    // The pressed control's lines lead, in the domain's order (the replay knows no handle to tell the two apart), though it wrote the mark last.
    expect((first.changed as string[]).slice(0, 2)).toEqual(["t939 \"Space Grey\" gone", "t941 \"Space Grey\" no longer marked"]);
    expect((first.changed as string[]).length).toBe(3);
    expect(first.changedNotShown).toBe(2);
    // Nothing that only restates the outcome rides along (t193 1003 w3).
    expect(Object.keys(first).sort()).toEqual(["changed", "changedNotShown"]);
    expect(steps.find((step) => step.step === 3)?.observed).toEqual({ changed: ["t941 \"Space Grey\" now marked"] });
  });

  it("are not invented for a step whose replay recorded none, nor for a step the test only checked", () => {
    const steps = summary().buildTest!.steps;
    expect(steps.find((step) => step.step === 1)?.observed).toBeUndefined();
    expect(steps.find((step) => step.step === 4)?.observed).toBeUndefined();
    // A checked step that carries `changed` would be read as the test's own act; the test did not press it.
    const checkedWithLines = automationStudioBuildTestResultSummary({
      steps: [go, add], report: report([replayed(go), verified(add)], [[add, { ok: true, code: "core.replay.verified", said: "not run", changed: ["t885 \"3 Cart\" appeared"] }]]),
      nodes: [], deniedEvidenceKeys: DENIED
    });
    expect(checkedWithLines.buildTest?.steps[1]?.observed).toMatchObject({ code: "core.replay.verified" });
  });

  it("pass the provider's pre-flight", () => {
    expect(automationStudioLlmRequestEvidenceRefusal(verificationRequest(summary()))).toBeUndefined();
  });
});

// Live run `run-musp4h2f-72e8ed99` (lane B): the towels' "+" set the quantity
// the instruction asked for. A "+" has no word long enough to quote, so the
// line saying the quantity now reads otherwise must not lose its place to the
// domain's page order.
describe("a quantity a press set", () => {
  const plus = web(2, "web.output.dom-click", { selector: "#qty-plus", accessibleName: "+" }, ITEM);
  const lines = [
    "t880 \"Free delivery over 50 €\" appeared",
    "t881 \"Only 3 left\" appeared",
    "t882 \"Bundle offer\" appeared",
    "t932 \"2\" was \"1\""
  ];

  it("keeps the line saying a value now reads otherwise ahead of the rest", () => {
    const sent = automationStudioBuildTestResultSummary({
      steps: [go, plus],
      report: report([replayed(go), replayed(plus)], [[plus, { ok: true, code: "core.replay.replayed", said: "the step ran again", changed: lines }]]),
      nodes: [], deniedEvidenceKeys: DENIED
    }).buildTest!.steps[1]?.observed as JsonObject;
    expect(sent.changed).toEqual(["t932 \"2\" was \"1\"", "t880 \"Free delivery over 50 €\" appeared", "t881 \"Only 3 left\" appeared"]);
    expect(sent.changedNotShown).toBe(1);
  });

  it("counts the domain's own left-out lines among those not shown, never as a line", () => {
    expect(automationStudioBuildTestChangeLines([lines[3]!, "and 7 more changes"], ["+"]).value).toEqual({ changed: ["t932 \"2\" was \"1\""], changedNotShown: 7 });
  });
});

describe("a change line shaped like a credential", () => {
  it("is dropped and the row marked withheld, the others still sent", () => {
    const bounded = automationStudioBuildTestChangeLines(["t5 \"token sk-live-4f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c\" appeared", "t6 \"Cart (1)\" was \"Cart (0)\""], ["Add to cart"]);
    expect(bounded).toEqual({ value: { changed: ["t6 \"Cart (1)\" was \"Cart (0)\""] }, withheld: true });
  });

  it("leaves an answer with nothing else to say unsent", () => {
    const sent = automationStudioBuildTestResultSummary({
      steps: [go, add],
      report: report([replayed(go), replayed(add)], [[add, { ok: true, code: "core.replay.replayed", changed: ["t5 \"token sk-live-4f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c\" appeared"] }]]),
      nodes: [], deniedEvidenceKeys: DENIED
    });
    expect(sent.buildTest!.steps[1]?.observed).toBeUndefined();
    expect(sent.withheld).toBe(true);
    expect(JSON.stringify(sent)).not.toContain("sk-live");
  });
});

function verificationRequest(sent: AutomationStudioRunResultSummary): AutomationStudioLlmTaskRequest {
  return {
    requestId: "request.one", idempotencyKey: "request.one", timeoutMs: 20_000, estimatedInputTokens: 100,
    taskKind: "loop_verification", promptVersion: "automation-studio.loop-verification.v1", expectedOutput: "diagnosis",
    tokenLimits: { maxInputTokens: 8_000, maxOutputTokens: 2_000, maxTotalTokens: 10_000 }, maxEstimatedCostUsd: 0.25,
    deniedEvidenceKeys: DENIED,
    context: {
      schemaVersion: "0.1", taskKind: "loop_verification", promptVersion: "automation-studio.loop-verification.v1",
      projectId: "project.one", flowId: "flow.one",
      instructions: { instructions: [], instructionIds: [], diagnostics: [], tokenBudget: 8_000, estimatedTokens: 0 },
      resultSummary: sent
    }
  };
}
