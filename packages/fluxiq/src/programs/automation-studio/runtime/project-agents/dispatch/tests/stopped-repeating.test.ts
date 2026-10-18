// A builder stopped for repeating itself (live lane 1 fix 1,
// `run-mvcx8na6-9554a3f1`). Its return is marked `stoppedRepeating` from the
// loop's own code, whether its loop returned the guard's stop or threw Core's
// build failure for it, and never for any other ending; and a brief carrying
// the earlier attempt shows it to its builder at the opening look, in words
// that name no site, task or control. The real builder loop runs on a scripted
// model, on the dispatcher's garden catalogue.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioFlowBootstrapGenerationError } from "../../../flow-bootstrap/generation-failure/index.ts";
import { runAutomationStudioSubflowBuilderLoop, type AutomationStudioSubflowBuilderOutcome } from "../../../flow-bootstrap/subflow-candidate/index.ts";
import { testSubmission } from "../../../flow-bootstrap/subflow-candidate/tests/subflow-fixture.ts";
import type { AutomationStudioLlmEvidenceTool } from "../../../llm/evidence-loop.ts";
import { automationStudioProjectBuilderReturn, type AutomationStudioProjectEarlierAttempt } from "../../contracts/index.ts";
import { automationStudioProjectDispatchEnding as ending } from "../ending.ts";
import type { AutomationStudioProjectBuilderPorts } from "../index.ts";
import { gardenBrief, gardenBuild, REF } from "./dispatch-fixture.ts";

const brief = gardenBrief("b-read", "list_seeds");
const spend = { allowance: undefined, trials: [] };
const STOPPED_ON = [
  { toolId: "core.run_node", iteration: 1, nodeId: "web.browser.navigate", resultCode: "web.action.succeeded" },
  { toolId: "core.run_node", iteration: 2, nodeId: "web.browser.navigate", resultCode: "web.action.succeeded" }
];

function stopped(code: string): AutomationStudioSubflowBuilderOutcome {
  const loop = { ok: false, code, trace: [], steps: [], accounting: {} };
  return { loop: loop as unknown as AutomationStudioSubflowBuilderOutcome["loop"], proposal: undefined, trial: undefined, promotionAllowed: false };
}

function buildFailure(code: string): AutomationStudioFlowBootstrapGenerationError {
  return new AutomationStudioFlowBootstrapGenerationError({
    code, stage: "provider_output_validation", retryable: false, providerInvocation: "attempted", providerResponse: "received",
    issueCodes: ["llm_evidence_loop.repeat_refused"],
    evidenceLoop: { iterationCount: 2, decisionCount: 2, toolCallCount: 2, evidenceBytes: 10, steps: STOPPED_ON }
  });
}

describe("a return whose builder the no-progress guard stopped", () => {
  it("is marked stoppedRepeating from a returned loop's code, and reads back from the record's shape", () => {
    const returned = ending.built(brief, stopped("llm_evidence_loop.repeat_without_progress"), spend);
    expect(returned).toMatchObject({ outcome: "blocked", stoppedRepeating: true });
    const parsed = automationStudioProjectBuilderReturn.parse(JSON.parse(JSON.stringify(returned)));
    expect(parsed).toMatchObject({ status: "valid", value: { stoppedRepeating: true } });
    expect(automationStudioProjectBuilderReturn.issues(returned, brief)).toEqual([]);
  });

  it("is marked from Core's build failure for the guard's stop, read structurally, and the reason still names the calls it stopped on", () => {
    const returned = ending.thrown(brief, buildFailure("flow_bootstrap.evidence_repeat_without_progress"), false, spend);
    expect(returned).toMatchObject({ outcome: "blocked", stoppedRepeating: true });
    expect(returned.reason).toContain("The calls it stopped on, latest first: core.run_node on web.browser.navigate answered web.action.succeeded (2 in a row).");
  });

  it("is not marked for any other ending: another loop code, another build failure, a plain throw, a stopped build, or the guard's words in a plain error", () => {
    expect(ending.built(brief, stopped("llm_evidence_loop.iteration_limit"), spend)).not.toHaveProperty("stoppedRepeating");
    expect(ending.thrown(brief, buildFailure("flow_bootstrap.evidence_unusable_decision"), false, spend)).not.toHaveProperty("stoppedRepeating");
    expect(ending.thrown(brief, new Error("Flow Bootstrap generation failed (flow_bootstrap.evidence_repeat_without_progress)."), false, spend)).not.toHaveProperty("stoppedRepeating");
    expect(ending.thrown(brief, buildFailure("flow_bootstrap.evidence_repeat_without_progress"), true, spend)).not.toHaveProperty("stoppedRepeating");
  });

  it("is refused as an answer when it says done", () => {
    const done = { briefId: brief.briefId, outcome: "done" as const, reason: "Done.", proposal: { subflowKey: "list_seeds", revision: 1, digest: "c".repeat(64) }, trials: [], spentUsd: 0, calls: 1, stoppedRepeating: true as const };
    expect(automationStudioProjectBuilderReturn.issues(done, brief)).toContainEqual({ code: "project.return_stopped_repeating", path: "return.stoppedRepeating" });
  });
});

type Entry = { callId: string; toolId: string; value: unknown };
const LOOK: AutomationStudioLlmEvidenceTool = { toolId: "web.page.read", description: "Read the page", effect: "observe", inputSchema: { type: "object" }, initialObservation: { input: {} } };
const opening = (evidence: readonly Entry[]) => evidence.find((entry) => entry.callId.startsWith("initial."))?.value as JsonObject | undefined;

/** Builder ports whose model ends every brief blocked, each brief's first request's evidence kept by its brief id. */
function endingBlocked(seen: Map<string, Entry[]>): (request: { brief: { briefId: string } }) => AutomationStudioProjectBuilderPorts {
  return (request) => ({
    loop: {
      tools: [LOOK], maxToolCalls: 6,
      unusableDecisions: { maxConsecutive: 3, maxInARow: 3, stalled: () => new Error("stalled") },
      executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { ok: true, page: "The seed catalogue." }, effectApplied: false, targetsUnchanged: true }),
      decide: async ({ evidence }) => {
        if (!seen.has(request.brief.briefId)) seen.set(request.brief.briefId, evidence.map((entry) => ({ ...entry })));
        return { kind: "complete", result: { ended: "blocked", reason: "Nothing to do here." } };
      }
    },
    submission: testSubmission(),
    deniedEvidenceKeys: []
  });
}

describe("a brief carrying an earlier attempt", () => {
  const earlier: AutomationStudioProjectEarlierAttempt = {
    briefId: "b-first", kind: "build",
    reason: "The builder failed: Flow Bootstrap generation failed (flow_bootstrap.evidence_repeat_without_progress). It was stopped by llm_evidence_loop.repeat_refused. The calls it stopped on, latest first: core.run_node on web.browser.navigate answered web.action.succeeded (4 in a row).",
    lastingActs: [{ act: "act-1", did: "press the add control on the first packet" }]
  };

  it("shows it to its builder at the opening look, in generic words to take another path, and a brief without one shows none", async () => {
    const seen = new Map<string, Entry[]>();
    const again = gardenBrief("b-again", "list_seeds", [], (sent) => {
      sent.earlierAttempt = structuredClone(earlier);
    });
    const build = await gardenBuild({ capacity: 1, briefs: [gardenBrief("b-plain", "list_seeds"), again], ports: { builder: endingBlocked(seen) } });
    build.dispatcherInput.runBuilder = runAutomationStudioSubflowBuilderLoop;
    const returns = (await build.run()).returns;
    expect(returns.map((returned) => returned.outcome)).toEqual(["blocked", "blocked"]);
    expect(opening(seen.get("b-plain")!)).not.toHaveProperty("earlierAttempt");
    const shown = opening(seen.get("b-again")!)!.earlierAttempt as JsonObject;
    expect(shown).toMatchObject({ briefId: "b-first", kind: "build", reason: earlier.reason, lastingActs: earlier.lastingActs });
    for (const words of ["stopped before it finished, for repeating calls that made no progress", "the calls it stopped on", "still on the target", "Do not take the same path again", "try a different way"]) expect(String(shown.note)).toContain(words);
    // The record holds the brief with it, so a supervisor started again reads the same brief.
    const view = await build.store.read(REF);
    expect(view!.record.briefs.find((entry) => entry.brief.briefId === "b-again")!.brief.earlierAttempt).toEqual(earlier);
  });
});
