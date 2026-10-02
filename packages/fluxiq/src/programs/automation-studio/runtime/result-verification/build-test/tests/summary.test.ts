// What the judge of a build's test is shown (t195-w25, section 4.5): each
// step's own words, how the test answered it, what it observed, and the
// build's own reading of the acts as information.
import { describe, expect, it } from "vitest";
import { automationStudioFlowDraftReplayable } from "../../../flow-draft/index.ts";
import { automationStudioLlmRequestEvidenceRefusal, type AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import type { AutomationStudioRunResultSummary } from "../../contracts.ts";
import { automationStudioBuildTestResultSummary, automationStudioBuildTestUntestedCarried } from "../summary.ts";
import {
  ACCEPT_FRIENDS, FRIENDS, PICKUP_CART, RUN_36_READ, RUN_36_STEPS, RUN_40_CLAIMS, RUN_40_STEPS,
  run36, run36Report, run40, run41Steps
} from "./live-run-drafts.ts";
import { DENIED, SITE, present, replayed, report, verified, web } from "./draft-steps.ts";

const run40Summary = () => automationStudioBuildTestResultSummary({
  steps: RUN_40_STEPS,
  report: report([...RUN_40_STEPS.slice(0, -1).map(replayed), verified(run40.towelsAdd)]),
  nodes: [],
  instructionText: PICKUP_CART,
  result: { summary: "Added the towels and the napkins.", acts: RUN_40_CLAIMS },
  startLocation: SITE,
  deniedEvidenceKeys: DENIED
});

describe("the run 36 packet: an act claimed on a listing", () => {
  const summary = automationStudioBuildTestResultSummary({
    steps: RUN_36_STEPS, report: run36Report(), nodes: [], instructionText: ACCEPT_FRIENDS,
    result: { summary: "Accepted the requests.", acts: [{ action: "a1", step: "4" }] }, startLocation: FRIENDS, deniedEvidenceKeys: DENIED
  });
  const steps = summary.buildTest!.steps;

  it("is a test, not a finished run: no record set, so Core's counts settle nothing", () => {
    expect(summary).toMatchObject({ recordSetCount: 0, recordSets: [], totalRecordCount: 0, buildTest: { kind: "build_test", test: "ran" } });
    expect(steps.map((step) => step.step)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("gives each Confirm its own card's words, present and withheld, with what the build saw it change", () => {
    const confirms = steps.slice(4);
    expect(confirms.map((step) => step.target?.find((word) => /mutual/u.test(word)))).toEqual([
      "Amara Osei23 mutual friendsConfirmDelete",
      "Priya Nair4 mutual friendsConfirmDelete",
      "Jonas WeberAisha Khan and 4 other mutual friendsConfirmDelete"
    ]);
    for (const confirm of confirms) {
      expect(confirm).toMatchObject({ outcome: "present", withheld: true, explored: { changed: "yes" }, observed: { answer: "present" } });
    }
    expect(steps[6]?.runs).toEqual({ kind: "repeat", over: 4, through: 7 });
    expect(steps[1]?.runs).toEqual({ kind: "optional" });
  });

  it("puts the listing's one-row read on the listing, and only the claim beside it", () => {
    expect(steps[3]).toMatchObject({ step: 4, outcome: "replayed", observed: RUN_36_READ, claims: ["a1"] });
    expect(steps[3]?.withheld).toBeUndefined();
    // A step that changes something and was run again observes nothing for the judge.
    expect(steps[2]?.observed).toBeUndefined();
    expect(steps[5]?.claims).toEqual(["a1"]);
  });
});

describe("the run 40 packet: the napkins claimed on the towels' Search press", () => {
  const summary = run40Summary();
  const steps = summary.buildTest!.steps;

  it("names no napkins in any step's own words, and the towels in theirs", () => {
    const words = steps.flatMap((step) => step.target ?? []);
    expect(words.join(" ").toLowerCase()).not.toContain("napkins");
    expect(steps[3]?.target).toContain("ValueRidge Select-A-Size Paper Towels");
    expect(steps[5]?.target).toContain("ValueRidge Essentials Select-A-Size Paper Towels, 6 Double Rolls");
    expect(steps[6]?.target).toContain("12 Double Rolls$16.47");
    expect(steps[7]).toMatchObject({ action: "web.output.dom-click", outcome: "verified", withheld: true, explored: { changed: "yes", resultCode: "web.clicked", stateChanged: true }, target: expect.arrayContaining(["Add to cart"]) });
  });

  it("carries no selector, no handle and no node name as a step's words", () => {
    const words = JSON.stringify(steps.map((step) => step.target));
    for (const leaked of ["data-testid", "nth-of-type", "body > div", "onetrust", "\"e3\"", "web.output", "modify_existing"]) expect(words).not.toContain(leaked);
  });

  it("shows the claim on the Search press as the build's own finding, not as the judge's", () => {
    expect(steps[4]?.claims).toEqual(["a3"]);
    const missing = (summary.buildTest!.missingActs!.acts as Array<Record<string, unknown>>).find((act) => act.id === "a3");
    expect(missing).toMatchObject({ reason: "step_acts_on_another_object", step: "5", actsOn: "a2" });
    expect(summary.buildTest!.checklist?.map((item) => item.id)).toEqual(["a1", "a2", "a3"]);
  });

  it("is what the provider's pre-flight lets through", () => {
    expect(automationStudioLlmRequestEvidenceRefusal(verificationRequest(summary))).toBeUndefined();
  });
});

describe("the run 41 shape: steps carried from the earlier Flow", () => {
  it("says the test did not run, marks every carried step, and names them as untested", () => {
    const steps = run41Steps();
    // The seeds carry no replay, so the draft is not testable and nothing ran.
    expect(automationStudioFlowDraftReplayable(steps)).toBe(false);
    const summary = automationStudioBuildTestResultSummary({ steps, nodes: [], instructionText: PICKUP_CART, result: { summary: "Extended the Flow." }, startLocation: SITE, deniedEvidenceKeys: DENIED });
    expect(summary.buildTest?.test).toBe("not_run");
    expect(summary.buildTest?.steps.map((step) => [step.step, step.outcome, step.carried ?? false])).toEqual([
      [1, "not_run", false], [2, "not_run", false], [3, "not_run", false], [4, "not_run", false],
      [5, "not_run", true], [6, "not_run", true], [7, "not_run", true], [8, "not_run", true], [9, "not_run", true]
    ]);
    expect(automationStudioBuildTestUntestedCarried(summary.buildTest)).toEqual([5, 6, 7, 8, 9]);
    expect(summary.buildTest?.steps[8]?.target).toEqual(["Add to cart"]);
  });
});

describe("the lane B shape: the size claimed on the Add press", () => {
  it("shows choice_is_the_act_step on the checklist as information, and the swatch step's own words", () => {
    const steps = [...RUN_40_STEPS.slice(0, -1), { ...run40.towelsAdd, acts: ["a2", "a2.size"] }];
    const summary = automationStudioBuildTestResultSummary({
      steps, report: report([...steps.slice(0, -1).map(replayed), verified(run40.towelsAdd)]), nodes: [],
      instructionText: PICKUP_CART, result: { summary: "Added." }, startLocation: SITE, deniedEvidenceKeys: DENIED
    });
    const towels = summary.buildTest!.checklist!.find((item) => item.id === "a2") as { choices?: Array<Record<string, unknown>> };
    expect(towels.choices?.find((choice) => choice.id === "a2.size")).toMatchObject({ todo: "choice_is_the_act_step", step: 8 });
    expect(summary.buildTest!.steps[6]?.target).toContain("12 Double Rolls$16.47");
    expect(summary.buildTest!.steps[7]).toMatchObject({ claims: ["a2", "a2.size"], withheld: true, outcome: "verified" });
  });
});

describe("screening what the test observed and each step's words", () => {
  const leaky = { ...web(3, "web.output.dom-click", { selector: "#go", accessibleName: "Go" }, SITE), effect: "observe" as const, proposes: true, ranWith: { label: "[data-testid=\"go\"]", caption: "Go now" } };
  const summary = automationStudioBuildTestResultSummary({
    steps: [run40.navigate, leaky],
    report: report([replayed(run40.navigate), replayed(leaky)], [[leaky, { rows: [{ name: "Go", selector: "a.go", html: "<a>" }] }]]),
    nodes: [], instructionText: "Read the go list.", startLocation: SITE, deniedEvidenceKeys: DENIED
  });

  it("drops a denied key from what was observed and a locator from a step's words, and says something was withheld", () => {
    expect(summary.buildTest?.steps[1]?.observed).toEqual({ rows: [{ name: "Go" }] });
    expect(summary.buildTest?.steps[1]?.target).toEqual(["Go now"]);
    expect(summary.withheld).toBe(true);
    expect(automationStudioLlmRequestEvidenceRefusal(verificationRequest(summary))).toBeUndefined();
  });

  it("sends no word or observation of the domain's without a declaration", () => {
    const undeclared = automationStudioBuildTestResultSummary({ steps: [run40.navigate, leaky], report: report([replayed(run40.navigate), replayed(leaky)], [[leaky, { rows: [] }]]), nodes: [] });
    expect(undeclared.buildTest?.steps.every((step) => step.target === undefined && step.observed === undefined)).toBe(true);
    expect(undeclared.withheld).toBe(true);
  });

  it("is refused by the pre-flight when a denied key or a selector reaches it anyway", () => {
    const steps = summary.buildTest!.steps;
    const deniedKey = { ...summary, buildTest: { ...summary.buildTest!, steps: [steps[0]!, { ...steps[1]!, observed: { rows: [{ name: "Go", selector: "a.go" }] } }] } };
    const located = { ...summary, buildTest: { ...summary.buildTest!, steps: [steps[0]!, { ...steps[1]!, target: ["[data-testid=\"go\"]"] }] } };
    expect(automationStudioLlmRequestEvidenceRefusal(verificationRequest(deniedKey))).toBe("llm.provider_result_summary_invalid");
    expect(automationStudioLlmRequestEvidenceRefusal(verificationRequest(located))).toBe("llm.provider_result_summary_invalid");
  });
});

it("reads a present step's answer as present, not as a step done again", () => {
  const summary = automationStudioBuildTestResultSummary({ steps: [run36.amara], report: report([present(run36.amara)]), nodes: [], deniedEvidenceKeys: DENIED });
  expect(summary.buildTest?.steps[0]).toMatchObject({ outcome: "present", withheld: true });
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
    deniedEvidenceKeys: DENIED,
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
