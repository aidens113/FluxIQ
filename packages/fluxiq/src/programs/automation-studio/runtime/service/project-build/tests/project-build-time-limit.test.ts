// A project build its time limit stops, through the actual service (t601).
// Everything-store `run-mv8id5vg` reached its time limit and the person read
// "The supervisor ended the build: it could not finish the Flow", though the
// limit ended it and its part had been tested many times. Here the limit is
// shortened, a scripted builder tries its subflow and ends partial on a trial
// that could not be confirmed, the scripted supervisor then waits out the
// clock, and the person is told the time limit, what was tested and what is
// left, in Core's words.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { automationStudioActivityHub } from "../../../activity/index.ts";
import { parseAutomationStudioFlowBootstrapGenerationError } from "../../../flow-bootstrap/index.ts";
import { AutomationStudioService } from "../../../service.ts";
import { blankFixture, caller, judgeReply, mockProvider } from "../../../tests/service-bootstrap/tests/fixtures.ts";

// The build's bound, shortened: its work stops 6 seconds after the supervisor starts.
vi.mock("../../../loop-limits/index.ts", async (original) => ({ ...(await original<object>()), AUTOMATION_STUDIO_PROJECT_BUILD_MAX_DURATION_MS: 8_000, AUTOMATION_STUDIO_PROJECT_BUILD_ENDING_MS: 2_000 }));

vi.setConfig({ testTimeout: 60_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const TASK = "Create a deterministic Start to End Flow.";
const PLAN = {
  taskSpec: { parts: [{ id: "p1", quote: { sourceId: "instruction.build", text: TASK }, goalFacts: ["The Flow runs from its start to its end"], lastingActs: [] }], notAsked: [] },
  subflows: [{ key: "main", name: "Main", parts: ["p1"] }]
};
const BRIEF = { kind: "build", subflowKey: "main", parts: ["p1"], entry: { caseId: "observed-current", predecessors: [] }, allowanceUsd: 0.01, maxIterations: 6 };
const SUBMISSION = {
  summary: "Build the main subflow",
  plan: {
    schemaVersion: "0.1", router: { name: "Main", rules: [], fallback: { kind: "subflow", targetSubflowKey: "main" } },
    subflows: [{
      key: "main", name: "Main", role: "primary",
      nodes: [{ key: "start", definitionId: "builtin.control.start", definitionVersion: "1.0.0" }, { key: "end", definitionId: "builtin.control.end", definitionVersion: "1.0.0" }],
      edges: [{ key: "start_end", source: { nodeKey: "start", portId: "next" }, target: { nodeKey: "end", portId: "in" } }]
    }]
  }
};
const MODEL_REASON = "The trial could not be confirmed, so this brief ends partial.";

type Entry = { callId: string; toolId: string; value: unknown };
const lastOf = (evidence: readonly Entry[], toolId: string) => [...evidence].reverse().find((entry) => entry.toolId === toolId)?.value as JsonObject | undefined;
const decision = (decided: JsonObject) => ({ response: { kind: "evidence_tool_decision", summary: "Scripted", decision: decided }, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.0001 } });

/** A decision that never comes inside the build's bound: the call outlives the work deadline, and is abandoned. */
function outlivingTheBound(): Promise<never> {
  return new Promise((_, reject) => { setTimeout(() => reject(new DOMException("Aborted", "AbortError")), 20_000).unref(); });
}

describe("a project build its time limit stops", () => {
  it("says the time limit, what was tested and what is left, never that the supervisor ended it", async () => {
    let supervisorDecisions = 0;
    const provider = mockProvider(async (request) => {
      if (request.taskKind === "loop_verification") return judgeReply("unknown");
      const loop = request.context.evidenceLoop!;
      const evidence = loop.evidence as Entry[];
      if (loop.tools.some((tool) => tool.toolId === "project.write_plan")) {
        supervisorDecisions += 1;
        if (supervisorDecisions === 1) return decision({ kind: "tool_call", callId: "plan", toolId: "project.write_plan", input: PLAN });
        if (supervisorDecisions === 2) return decision({ kind: "tool_call", callId: "dispatch", toolId: "project.dispatch", input: { reason: "Build the subflow.", briefs: [BRIEF] } });
        // The supervisor is still deciding when its time runs out.
        return await outlivingTheBound();
      }
      const submitted = lastOf(evidence, "core.submit_subflow");
      if (submitted?.ok !== true) return decision({ kind: "tool_call", callId: "submit", toolId: "core.submit_subflow", input: SUBMISSION });
      if (!lastOf(evidence, "core.test_subflow")) return decision({ kind: "tool_call", callId: "test", toolId: "core.test_subflow", input: { revision: submitted.revision as number, digest: submitted.digest as string } });
      return decision({ kind: "complete", result: { ended: "partial", reason: MODEL_REASON } });
    });
    const dataDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-project-build-time-limit-"));
    const service = new AutomationStudioService({
      dataDir, llmProviderResolver: () => ({ provider, maxCallsPerRun: 60, maxEstimatedCostUsd: 0.1 }),
      llmEvidenceRuntime: { domainId: "isolated", deniedEvidenceKeys: [], tools: [{ toolId: "inspect", description: "Inspect", inputSchema: { type: "object" }, effect: "observe" }],
        executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { seen: true }, effectApplied: false, targetsUnchanged: true }) }
    });
    cleanups.push(async () => {
      await service.close();
      await rm(dataDir, { recursive: true, force: true });
    });
    const { project, flow } = await blankFixture(service);
    const seen: ClientGatewayActivity[] = [];
    const unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
    const failure = await service.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, caller: caller(), evidenceGuided: true, authoringMode: "project" })
      .then(() => undefined, (error: unknown) => error).finally(unsubscribe);
    const diagnostic = parseAutomationStudioFlowBootstrapGenerationError(failure);
    // The code every debug and the Lab read stays the build's own.
    expect(diagnostic).toMatchObject({ code: "flow_bootstrap.post_provider_validation_failed", issueCodes: ["project.build_time_limit", "project.build_blocked"] });
    const told = seen.find((event) => event.detail?.title === "The build reached its time limit of 8 seconds before a whole test of the Flow passed.");
    expect(told?.detail, JSON.stringify(seen.map((event) => event.detail?.title).filter(Boolean))).toMatchObject({
      kind: "note", status: "failed",
      text: "Its one part did not pass its own test. Left: a part tested once whose last test could not be confirmed. The whole Flow was not assembled, so it was never tested as one. Nothing this build did is still on the target."
    });
    expect(seen.some((event) => event.detail?.title === "The supervisor ended the build: it could not finish the Flow.")).toBe(false);
    // The time limit's row is Core's words alone; the brief's own return row may quote its builder.
    expect(JSON.stringify(told)).not.toContain(MODEL_REASON);
  });
});
