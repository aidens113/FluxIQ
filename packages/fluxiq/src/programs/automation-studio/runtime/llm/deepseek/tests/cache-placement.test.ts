// Two consecutive decisions of one build, as the bytes DeepSeek receives: the
// later request must begin with the earlier one through the end of the last
// window entry the earlier one was shown (t484).
//
// Measured on `run-mv62icw0-070f88ad` (round 12, D build 1):
// - W1. The 28,779-character output schema sat behind the window. It never
//   changed across 19 decisions, yet it followed the window's newest entry and
//   so was read uncached on every one: about $0.039 of the build's $0.067.
// - W3. After the trial, a new situation (`core.route_state.9`) was put in the
//   middle of the window, after `core.route_state.8` and before entries the
//   previous decision had already been sent. Its call was the trial's own step,
//   which no window entry names, so it followed the situation before it.
//   Decision 0041 lost the cache at 57%.
//
// This drives the same shape: an exploration call, a submit, then a trial whose
// own step moves the page and is not a window entry, with Core's history and
// budget notes rewritten at the end of each window, as `../../decision-context/shown.ts` writes them.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioNodeRegistry } from "../../../../nodes/index.ts";
import { buildAutomationStudioFlowBootstrapContext } from "../../../flow-bootstrap/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../../flow-bootstrap/plan/tests/index.ts";
import { AUTOMATION_STUDIO_ROUTE_STATE_TOOL_ID, startAutomationStudioBuildRouting, type AutomationStudioBuildRouting } from "../../../route-state/index.ts";
import { buildAutomationStudioLlmEvidenceLoopDecisionSchema } from "../../evidence-loop.ts";
import type { AutomationStudioLlmTaskRequest } from "../../harness.ts";
import { buildAutomationStudioDeepSeekRequestBody } from "../request-body.ts";

const registry = new AutomationStudioNodeRegistry(webDomainNodeDefinitionsFixture());
const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
const catalogContext = buildAutomationStudioFlowBootstrapContext({ registry, resolution, startLocation: "https://shop.example.test/" });
const tools = [
  { toolId: "core.run_node", description: "Run one node.", inputSchema: { type: "object" } },
  { toolId: "core.test_candidate", description: "Test the submitted Flow.", inputSchema: { type: "object" } }
];
const completionSchema = { type: "object" };

type Entry = { callId: string; toolId: string; value: JsonObject };
const call = (callId: string, toolId = "core.run_node"): Entry => ({ callId, toolId, value: { ok: true, did: callId } });
const history = (decisions: number): Entry => ({ callId: "core.evidence_history", toolId: "core.evidence_history", value: { decisions } });
const budget = (iteration: number): Entry => ({ callId: `core.budget.${iteration}`, toolId: "core.budget", value: { left: 20 - iteration } });

describe("where a build's request puts what does not change", () => {
  it("begins the decision after a trial with every byte of the decision before it, through its last window entry", async () => {
    const { routing, execute, decide } = await routed();
    await decide();
    await execute("explore-1");
    await decide();
    const earlierEvidence = [call("explore-1"), call("submit-1", "core.submit_candidate"), history(2), budget(2)];
    const earlier = requestBody(routing, earlierEvidence, 2);

    // The trial runs the Flow's own steps: they move the page, and no window entry names them.
    await execute("trial.step-1");
    await decide();
    const laterEvidence = [call("explore-1"), call("submit-1", "core.submit_candidate"), call("test-1", "core.test_candidate"), history(3), budget(3)];
    const later = requestBody(routing, laterEvidence, 3);

    const lastShared = JSON.stringify(earlierEvidence[1]);
    const through = earlier.indexOf(lastShared) + lastShared.length;
    expect(earlier.indexOf(lastShared)).toBeGreaterThan(0);
    expect(commonPrefixLength(earlier, later), "the later request rewrites bytes the earlier one sent").toBeGreaterThanOrEqual(through);
    // The schema, the tools and the catalog are inside that prefix, in front of the window.
    for (const key of ['"outputSchema"', '"nodeCatalog"', '"tools"']) expect(earlier.indexOf(key), key).toBeLessThan(earlier.indexOf('"evidence"'));

    // The situation the trial left follows the trial, after everything already sent.
    const shown = evidenceOf(later).map((entry) => entry.callId);
    expect(shown).toEqual([
      "core.route_state.1", "explore-1", "core.route_state.2", "submit-1", "test-1", "core.route_state.3", "core.evidence_history", "core.budget.3"
    ]);
    expect(evidenceOf(later)[5]).toMatchObject({ toolId: AUTOMATION_STUDIO_ROUTE_STATE_TOOL_ID, value: { state: { "state.page.path": "/trial.step-1" } } });
  });

  it("keeps a situation where it was first shown on every later decision", async () => {
    const { routing, execute, decide } = await routed();
    await decide();
    await execute("explore-1");
    await decide();
    requestBody(routing, [call("explore-1"), call("submit-1", "core.submit_candidate"), history(2), budget(2)], 2);
    await execute("trial.step-1");
    await decide();
    const second = requestBody(routing, [call("explore-1"), call("submit-1", "core.submit_candidate"), call("test-1", "core.test_candidate"), history(3), budget(3)], 3);
    await execute("explore-2");
    await decide();
    const third = requestBody(routing, [call("explore-1"), call("submit-1", "core.submit_candidate"), call("test-1", "core.test_candidate"), call("explore-2"), history(4), budget(4)], 4);

    const settled = JSON.stringify(evidenceOf(second)[5]);
    expect(second.indexOf(settled)).toBeGreaterThan(0);
    expect(commonPrefixLength(second, third)).toBeGreaterThanOrEqual(second.indexOf(settled) + settled.length);
    expect(evidenceOf(third).map((entry) => entry.callId)).toEqual([
      "core.route_state.1", "explore-1", "core.route_state.2", "submit-1", "test-1", "core.route_state.3", "explore-2", "core.route_state.4", "core.evidence_history", "core.budget.4"
    ]);
  });

  it("never puts a new situation before an entry an earlier decision was sent, even when its call is earlier", async () => {
    const { routing, execute, decide } = await routed();
    await decide();
    await execute("explore-1");
    await decide();
    // A note of Core's own answering the call, already sent with it.
    const earlierEvidence = [call("explore-1"), { callId: "core.rerun_check.1", toolId: "core.rerun_check", value: { ok: true } }, history(2), budget(2)];
    const earlier = requestBody(routing, earlierEvidence, 2);
    // Call ids repeat across rounds: a step named like an earlier call moves the page.
    await execute("explore-1");
    await decide();
    const later = requestBody(routing, [...earlierEvidence.slice(0, 2), history(3), budget(3)], 3);

    const lastShared = JSON.stringify(earlierEvidence[1]);
    expect(earlier.indexOf(lastShared)).toBeGreaterThan(0);
    expect(commonPrefixLength(earlier, later)).toBeGreaterThanOrEqual(earlier.indexOf(lastShared) + lastShared.length);
    expect(evidenceOf(later).map((entry) => entry.callId)).toEqual([
      "core.route_state.1", "explore-1", "core.route_state.2", "core.rerun_check.1", "core.route_state.3", "core.evidence_history", "core.budget.3"
    ]);
  });
});

/** A build's routing over a page whose path is the id of the last call that ran. */
async function routed() {
  let page = "/start";
  const routing = await startAutomationStudioBuildRouting({
    hostRuntime: { capabilities: [], observeRouteState: () => ({ page: { path: page } }) },
    projectId: "p1", flowId: "f1", flowInputs: []
  });
  const executeTool = routing.recording(async (input: { callId: string; toolId: string }) => {
    page = `/${input.callId}${page.startsWith(`/${input.callId}`) ? "+" : ""}`;
    return { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true, routeState: { page: { path: page } } };
  });
  const decideTool = routing.observing(async (input: { signal?: AbortSignal }) => input);
  return { routing, execute: (callId: string) => executeTool({ callId, toolId: "core.run_node" }), decide: () => decideTool({}) };
}

/**
 * One decision as the provider reads it -- its system and user messages, in
 * order, decoded from the wire body -- shown its window through the build's
 * routing as the service shows it. The body escapes the user message as a JSON
 * string, deterministically, so a prefix of this is a prefix of the body.
 */
function requestBody(routing: AutomationStudioBuildRouting, evidence: readonly Entry[], iteration: number): string {
  const shown = routing.shown(evidence, []);
  const promptVersion = "automation-studio.evidence-tool-decision.v1";
  const request = {
    requestId: `request.${iteration}`,
    idempotencyKey: `request.${iteration}`,
    timeoutMs: 20_000,
    estimatedInputTokens: 100,
    taskKind: "evidence_tool_decision",
    promptVersion,
    expectedOutput: "evidence_tool_decision",
    tokenLimits: { maxInputTokens: 480_000, maxOutputTokens: 4_000, maxTotalTokens: 520_000 },
    maxEstimatedCostUsd: 0.25,
    deniedEvidenceKeys: [],
    context: {
      schemaVersion: "0.1",
      taskKind: "evidence_tool_decision",
      promptVersion,
      projectId: "project.one",
      flowId: "flow.one",
      instructions: { instructions: [], instructionIds: [], diagnostics: [], tokenBudget: 8_000, estimatedTokens: 0 },
      flowBootstrap: { ...catalogContext, routing: shown.context },
      evidenceLoop: {
        iteration,
        tools,
        evidence: shown.evidence.map((entry) => ({ ...entry })),
        decisionSchema: buildAutomationStudioLlmEvidenceLoopDecisionSchema(tools, completionSchema),
        completionSchema,
        canComplete: true
      }
    }
  } as unknown as AutomationStudioLlmTaskRequest;
  const body = JSON.parse(buildAutomationStudioDeepSeekRequestBody(request, "deepseek-flash")) as { messages: Array<{ content: string }> };
  return body.messages.map((message) => message.content).join("\n");
}

/** The window the user message carried; that message is JSON, so it holds no raw newline and is the prompt's last line. */
function evidenceOf(prompt: string): Entry[] {
  const user = prompt.slice(prompt.lastIndexOf("\n") + 1);
  return (JSON.parse(user) as { context: { evidenceLoop: { evidence: Entry[] } } }).context.evidenceLoop.evidence;
}

function commonPrefixLength(left: string, right: string): number {
  let index = 0;
  while (index < left.length && index < right.length && left[index] === right[index]) index += 1;
  return index;
}
