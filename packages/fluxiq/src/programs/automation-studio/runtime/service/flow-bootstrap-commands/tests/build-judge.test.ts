// What a build's judge is told beside its test (t195-w28a): what the completion
// check found the accepted Flow cannot do, and each observation without the
// domain's view. The completion check is the real one; the provider is scripted
// and only captures what it would have been sent.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowInstruction } from "../../../../model/index.ts";
import { AutomationStudioNodeRegistry, canonicalBuiltinAutomationNodeDefinitions } from "../../../../nodes/index.ts";
import { automationStudioFlowBootstrapJudgeFinished, automationStudioFlowBootstrapRepairingJudgedSaid } from "../../../flow-bootstrap/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../../flow-bootstrap/plan/tests/index.ts";
import { automationStudioFlowDraftFlowSignature, type AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { checkAutomationStudioFlowBootstrapCompletion, type AutomationStudioFlowDraftTestReport, type AutomationStudioLlmProvider, type AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import { automationStudioFlowBootstrapBuildJudge } from "../build-judge.ts";

const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
const registry = new AutomationStudioNodeRegistry([...canonicalBuiltinAutomationNodeDefinitions, ...webDomainNodeDefinitionsFixture()]);
const ASKS_FOR_A_TABLE = "Scrape every product the search returns as a table with columns name and price.";
const DENIED = ["html", "selector"];

const instruction: AutomationStudioFlowInstruction = {
  schemaVersion: "0.1", instructionId: "instruction.flow.goal", title: "Goal", body: ASKS_FOR_A_TABLE,
  scope: { kind: "flow", projectId: "project.1", flowId: "flow.1" }, priority: 1, status: "active", requirement: "required", createdAt: 1, updatedAt: 1
};

/** A Flow that reads one value where the instruction asks for a table. */
const readsOneValue: JsonObject = {
  schemaVersion: "0.1",
  router: { name: "Read", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } },
  subflows: [{ key: "primary", name: "Primary", role: "primary", nodes: [{ key: "read", definitionId: "web.output.dom-extract", definitionVersion: "1.0.0", outputActionId: "web.dom.extract", parameters: { selector: ".price" } }], edges: [] }]
};
const read: AutomationStudioFlowDraftStep = {
  position: 1, id: "d1", iteration: 1, actionId: "web.output.dom-extract", toolId: "core.run_node",
  input: { node: "web.output.dom-extract", parameters: { field: "price" } }, effect: "observe", proposes: true, disposition: "kept"
};

function scripted(): { provider: AutomationStudioLlmProvider; seen: AutomationStudioLlmTaskRequest[] } {
  const seen: AutomationStudioLlmTaskRequest[] = [];
  return {
    seen,
    provider: {
      metadata: { provider: "mock", model: "debug-model" },
      runTask: async (request: AutomationStudioLlmTaskRequest) => {
        seen.push(request);
        return { response: { kind: "diagnosis", summary: "Judged.", diagnosis: { answersRequest: "no", observed: "No step reads a table." } }, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0 } };
      }
    }
  };
}

describe("a build's judge", () => {
  it("is told what the completion check found an accepted Flow cannot do, and reads each observation without its view", async () => {
    const verdict = await checkAutomationStudioFlowBootstrapCompletion({
      result: { summary: "Read the price", plan: readsOneValue }, projectId: "project.1", flowId: "flow.1", registry, resolution, instructionText: ASKS_FOR_A_TABLE
    });
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    const { provider, seen } = scripted();
    const judge = automationStudioFlowBootstrapBuildJudge({
      provider, instructions: [instruction], deniedEvidenceKeys: DENIED, projectId: "project.1", flowId: "flow.1",
      instructionText: ASKS_FOR_A_TABLE, plan: () => verdict.buildPlan.plan, notes: () => verdict.notes, observedStateKeys: ["page"]
    });
    judge.roundStarted();
    judge.observeTest({
      verdict: { attempt: 1, reset: "ok", outcomes: [{ step: 1, stepId: "d1", actionId: read.actionId, status: "replayed" }], providerCalls: 0, ok: true },
      observations: [{ step: 1, stepId: "d1", evidence: { ok: true, page: "PAGE \"Shop\"\nt1 heading \"Products\"", read: { value: "$4.99" } } }],
      reused: false,
      signature: automationStudioFlowDraftFlowSignature([read])
    } satisfies AutomationStudioFlowDraftTestReport);

    const judged = await judge.judge({ round: 1, loop: { ok: true, result: { summary: "Read the price" }, trace: [], steps: [read], accounting: {} }, budget: { maxCostUsd: 1 } } as never);

    expect(judged).toMatchObject({ verdict: "no", observed: "No step reads a table." });
    const buildTest = seen[0]?.context.resultSummary?.buildTest;
    expect(buildTest?.notes).toEqual([{
      code: "bootstrap.cannot_answer_instruction",
      said: "The instruction asks for a set of records and no step of this Flow produces or saves one, so no run of it could answer.",
      columns: ["name", "price"]
    }]);
    expect(buildTest?.steps[0]?.observed).toEqual({ ok: true, read: { value: "$4.99" } });
  });

  // Live run run-murwcaj0-40e56557 (J1): a repeated press's template row is not the row it acts on, and which argument
  // key holds that row is the domain's declaration (`rowContextKeys`), carried here to the judge's packet.
  it("leaves the domain's declared row keys out of a repeated step's words, and only those", async () => {
    const press: AutomationStudioFlowDraftStep = {
      position: 2, id: "d2", iteration: 2, actionId: "web.output.dom-click", toolId: "core.run_node", effect: "mutate", proposes: true, disposition: "kept",
      input: { node: "web.output.dom-click", parameters: { element: { accessibleName: "Confirm", context: { row: { text: "Tom Becker1 mutual friend" } } } } },
      routing: { kind: "repeat", over: "d1", through: "d2" }
    };
    const targets: unknown[] = [];
    for (const rowContextKeys of [["row"], undefined]) {
      const { provider, seen } = scripted();
      const judge = automationStudioFlowBootstrapBuildJudge({
        provider, instructions: [instruction], deniedEvidenceKeys: DENIED, projectId: "project.1", flowId: "flow.1",
        instructionText: ASKS_FOR_A_TABLE, plan: () => undefined, rowContextKeys
      });
      await judge.judge({ round: 1, loop: { ok: true, result: {}, trace: [], steps: [read, press], accounting: {} }, budget: { maxCostUsd: 1 } } as never);
      targets.push(seen[0]?.context.resultSummary?.buildTest?.steps[1]?.target);
    }
    expect(targets).toEqual([["Confirm", "in each row step 1 keeps"], ["Confirm", "Tom Becker1 mutual friend", "in each row step 1 keeps"]]);
  });

  it("is told nothing beside the test when the check found nothing", async () => {
    const { provider, seen } = scripted();
    const judge = automationStudioFlowBootstrapBuildJudge({
      provider, instructions: [instruction], deniedEvidenceKeys: DENIED, projectId: "project.1", flowId: "flow.1",
      instructionText: ASKS_FOR_A_TABLE, plan: () => undefined, notes: () => undefined
    });
    await judge.judge({ round: 1, loop: { ok: true, result: {}, trace: [], steps: [read], accounting: {} }, budget: { maxCostUsd: 1 } } as never);
    expect(seen[0]?.context.resultSummary?.buildTest).not.toHaveProperty("notes");
  });

  // The judge's provider calls are calls outside the loop: the build counts them
  // with the authority's (`additionalProviderCallCount`), so the count agrees with
  // the accounting, which has their spend (t195-w28b's finding).
  it("counts every provider call its judgements made, across rounds", async () => {
    const { provider, seen } = scripted();
    const judge = automationStudioFlowBootstrapBuildJudge({
      provider, instructions: [instruction], deniedEvidenceKeys: DENIED, projectId: "project.1", flowId: "flow.1",
      instructionText: ASKS_FOR_A_TABLE, plan: () => undefined
    });
    expect(judge.calls()).toBe(0);
    const round = { round: 1, loop: { ok: true, result: {}, trace: [], steps: [read], accounting: {} }, budget: { maxCostUsd: 1 } } as never;
    // A no is asked twice (`result-verification/verify.ts`).
    await judge.judge(round);
    expect(judge.calls()).toBe(2);
    await judge.judge(round);
    expect(judge.calls()).toBe(4);
    expect(judge.calls()).toBe(seen.length);
    // No cost left: nobody is asked, and nothing is counted.
    await judge.judge({ round: 2, loop: { ok: true, result: {}, trace: [], steps: [read], accounting: {} }, budget: { maxCostUsd: 0 } } as never);
    expect(judge.calls()).toBe(4);
  });

  // The user's rule (2026-10-02): a build finishes only on a yes about a test of
  // the Flow as it finally stands. Each verdict says which Flow it judged: the
  // signature of this round's observed test, and none where no test was
  // observed this round (`../../../flow-bootstrap/unfinished-build/phases.ts`).
  it("stamps every verdict with the Flow signature of this round's observed test", async () => {
    const { provider } = scripted();
    const judge = automationStudioFlowBootstrapBuildJudge({
      provider, instructions: [instruction], deniedEvidenceKeys: DENIED, projectId: "project.1", flowId: "flow.1",
      instructionText: ASKS_FOR_A_TABLE, plan: () => undefined
    });
    const signature = automationStudioFlowDraftFlowSignature([read]);
    judge.roundStarted();
    judge.observeTest(passed(signature));
    const round = { round: 0, loop: { ok: true, result: {}, trace: [], steps: [read], accounting: {} }, budget: { maxCostUsd: 1 } } as never;
    expect(await judge.judge(round)).toMatchObject({ verdict: "no", flowSignature: signature });
    // Not judged for want of cost: still about that test.
    expect(await judge.judge({ round: 0, loop: { ok: true, result: {}, trace: [], steps: [read], accounting: {} }, budget: { maxCostUsd: 0 } } as never)).toMatchObject({ verdict: "not_judged", flowSignature: signature });
  });

  it("stamps no signature when no test was observed this round, even where an earlier round's was", async () => {
    const { provider } = scripted();
    const judge = automationStudioFlowBootstrapBuildJudge({
      provider, instructions: [instruction], deniedEvidenceKeys: DENIED, projectId: "project.1", flowId: "flow.1",
      instructionText: ASKS_FOR_A_TABLE, plan: () => undefined
    });
    judge.roundStarted();
    judge.observeTest(passed(automationStudioFlowDraftFlowSignature([read])));
    judge.roundStarted();
    const judged = await judge.judge({ round: 1, loop: { ok: true, result: {}, trace: [], steps: [read], accounting: {} }, budget: { maxCostUsd: 1 } } as never);
    expect(judged.verdict).toBe("no");
    expect(judged).not.toHaveProperty("flowSignature");
    const unjudged = await judge.judge({ round: 1, loop: { ok: true, result: {}, trace: [], steps: [read], accounting: {} }, budget: { maxCostUsd: 0 } } as never);
    expect(unjudged).not.toHaveProperty("flowSignature");
  });

  // Live run muqk713g (screenshot 00013): a judge reply the harness could not
  // read put "(llm_output.invalid_diagnosis_text)" into the chat. The chat says
  // what happened in words; the code stays on the verification record.
  it("says a judge reply it could not read in words, with no diagnostic code in the chat", async () => {
    const provider: AutomationStudioLlmProvider = {
      metadata: { provider: "mock", model: "debug-model" },
      runTask: async () => ({ response: { kind: "diagnosis", summary: "Judged.", diagnosis: { answersRequest: "no", observed: 42 } }, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0 } }) as never
    };
    const judge = automationStudioFlowBootstrapBuildJudge({
      provider, instructions: [instruction], deniedEvidenceKeys: DENIED, projectId: "project.1", flowId: "flow.1",
      instructionText: ASKS_FOR_A_TABLE, plan: () => undefined
    });
    const judged = await judge.judge({ round: 1, loop: { ok: true, result: {}, trace: [], steps: [read], accounting: {} }, budget: { maxCostUsd: 1 } } as never);
    expect(judged.verdict).toBe("unknown");
    // A build no longer finishes unverified (t244): an unsure verdict opens a
    // repair round, and that round's announcement is what the chat says.
    if (judged.verdict === "yes") throw new Error("expected an unsure verdict");
    const { judgement } = automationStudioFlowBootstrapJudgeFinished({ round: 1, steps: [read], verdict: judged, checklist: () => undefined });
    const text = automationStudioFlowBootstrapRepairingJudgedSaid(judgement.judge!);
    expect(text).toContain("the judge's reply could not be read");
    expect(text).not.toContain("llm_output.");
    expect(text).not.toMatch(/\b[a-z_]+\.[a-z_.]+\b/);
  });

  // Run `run-murwd8le-79e735a8` (t174-w87 Cause 7, wired by t174-w89): the
  // judges of its tests (0046, 0047) never saw `Cart (3)`, the coupon's
  // "Collected" or the quantity field. The test captures the page it ended on
  // and the judge is shown it; a test that captured none is judged without.
  it("is shown the page the test ended on when the test captured one", async () => {
    const { provider, seen } = scripted();
    const judge = automationStudioFlowBootstrapBuildJudge({
      provider, instructions: [instruction], deniedEvidenceKeys: DENIED, projectId: "project.1", flowId: "flow.1",
      instructionText: ASKS_FOR_A_TABLE, plan: () => undefined, observedStateKeys: ["page"]
    });
    const page = ["PAGE \"Voltbay USB C Hub\"", "t885 link \"3 Cart\" ~/cart", "t965 field \"Quantity\" =\"3\"", "t970 \"Collected\""].join("\n");
    judge.roundStarted();
    judge.observeTest({ ...passed(automationStudioFlowDraftFlowSignature([read])), endView: { after: 1, view: { page } } });
    await judge.judge({ round: 1, loop: { ok: true, result: {}, trace: [], steps: [read], accounting: {} }, budget: { maxCostUsd: 1 } } as never);
    expect(seen[0]?.context.resultSummary?.endView).toEqual({ after: 1, view: { page } });
  });

  it("is judged without a page when the test captured none", async () => {
    const { provider, seen } = scripted();
    const judge = automationStudioFlowBootstrapBuildJudge({
      provider, instructions: [instruction], deniedEvidenceKeys: DENIED, projectId: "project.1", flowId: "flow.1",
      instructionText: ASKS_FOR_A_TABLE, plan: () => undefined, observedStateKeys: ["page"]
    });
    judge.roundStarted();
    judge.observeTest(passed(automationStudioFlowDraftFlowSignature([read])));
    const judged = await judge.judge({ round: 1, loop: { ok: true, result: {}, trace: [], steps: [read], accounting: {} }, budget: { maxCostUsd: 1 } } as never);
    expect(judged.verdict).toBe("no");
    expect(seen[0]?.context.resultSummary).not.toHaveProperty("endView");
  });

  it("gives the test its look at the page through the build's executor, and none where the domain has no free look", async () => {
    const { provider } = scripted();
    const look = { node: "web.output.dom-capture_snapshot", parameters: {}, consequences: [] };
    const executeTool = async (call: { callId: string; toolId: string; value: JsonObject }) => ({ kind: "llm_evidence_tool_execution" as const, evidence: { page: `seen by ${call.callId} through ${call.toolId}`, handles: 2 }, effectApplied: false });
    const judge = automationStudioFlowBootstrapBuildJudge({
      provider, instructions: [instruction], deniedEvidenceKeys: DENIED, projectId: "project.1", flowId: "flow.1",
      instructionText: ASKS_FOR_A_TABLE, plan: () => undefined, observedStateKeys: ["page"],
      look: { tools: [{ toolId: "core.run_node", initialObservation: { input: look } }], executeTool }
    });
    expect(await judge.testEndView?.({ callId: "core.dry_run.1.end_view", after: 2 })).toEqual({ after: 2, view: { page: "seen by core.dry_run.1.end_view through core.run_node" } });
    const blind = automationStudioFlowBootstrapBuildJudge({
      provider, instructions: [instruction], deniedEvidenceKeys: DENIED, projectId: "project.1", flowId: "flow.1",
      instructionText: ASKS_FOR_A_TABLE, plan: () => undefined, observedStateKeys: ["page"], look: { tools: [{ toolId: "press" }], executeTool }
    });
    expect(blind.testEndView).toBeUndefined();
  });
});

/** A passing test of the one-step Flow, under `signature`. */
function passed(signature: string): AutomationStudioFlowDraftTestReport {
  return {
    verdict: { attempt: 1, reset: "ok", outcomes: [{ step: 1, stepId: "d1", actionId: read.actionId, status: "replayed" }], providerCalls: 0, ok: true },
    observations: [{ step: 1, stepId: "d1", evidence: { ok: true, read: { value: "$4.99" } } }],
    reused: false,
    signature
  };
}
