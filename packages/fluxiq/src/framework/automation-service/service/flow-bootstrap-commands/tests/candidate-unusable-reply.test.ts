// @fluxiq-test-group real-sql
// A candidate build that meets an unusable model reply (t354, lane A round 3,
// `run-muyqgopm-1bfa7054`): after sixteen clean decisions the model wrapped a
// complete `core.submit_candidate` call as `"kind": "callId"`, and that one
// reply ended the build as `flow_bootstrap.unexpected_error` at stage
// `provider_request` ("the model could not be reached"), with no accounting, so
// the Lab's per-build check read $0 for $0.0206. These drive the actual service.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AutomationStudioService } from "../../../service.ts";
import type { AutomationStudioFlowBootstrapCreationSpendStore } from "../../index.ts";
import { automationStudioAnsweringInstructionReading } from "../../../tests/service-bootstrap/tests/instruction-reading.ts";
import { blankFixture, caller, judgeReply, mockProvider, plan } from "../../../tests/service-bootstrap/tests/fixtures.ts";

const DECISION_USD = 0.001;
/** What the build's reading of its instruction at the start costs (t976). */
const READING_USD = DECISION_USD;
/** The build's purse: dollars, never a count of calls (t1056). */
const PURSE_USD = 0.03;
/** The unusable replies in a row that once ended a loop (t1056 removed the backstop). */
const OLD_BACKSTOP = 12;

type Reply = (call: number, latest: { revision?: number; digest?: string } | undefined) => Record<string, unknown>;

/**
 * A whole submission no reader can use: its wrapper says `callId` where `tool_call` belongs and it names no tool.
 * The round 3 reply also carried its `toolId`, which since t445 is read as the tool call it unambiguously is
 * (`../../../llm/tests/decision-kind/tests/inferred-tool-call.test.ts`), so it no longer stands for an unusable one.
 */
const malformedSubmission = { kind: "callId", input: { summary: "complete revision", plan: plan() } };

async function candidateBuild(reply: Reply) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-candidate-unusable-"));
  let calls = 0;
  // The build reads its instruction when it starts (t976, b2ee9ed45): answered apart from the decisions scripted
  // and counted here, and paid for at a decision's price (READING_USD).
  const provider = mockProvider(automationStudioAnsweringInstructionReading(async (request) => {
    if (request.taskKind === "loop_verification") return judgeReply("yes");
    calls++;
    const evidence = request.context.evidenceLoop?.evidence ?? [];
    const latest = [...evidence].reverse().find((entry) => entry.toolId === "core.submit_candidate")?.value as { revision?: number; digest?: string } | undefined;
    return { response: { kind: "evidence_tool_decision", summary: "Scripted candidate authoring", decision: reply(calls, latest) }, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: DECISION_USD } };
  }, { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: READING_USD }));
  const service = new AutomationStudioService({ dataDir, llmProviderResolver: () => ({ provider, maxEstimatedCostUsd: 0.1, maxTotalEstimatedCostUsd: PURSE_USD }),
    llmEvidenceRuntime: { domainId: "isolated", deniedEvidenceKeys: [], tools: [{ toolId: "inspect", description: "Inspect", inputSchema: { type: "object" }, effect: "observe" }],
      executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { area: "item" }, effectApplied: false, targetsUnchanged: true }) } });
  const { project, flow } = await blankFixture(service);
  const settled = await service.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, caller: caller(), evidenceGuided: true, authoringMode: "candidate" })
    .then((result) => ({ ok: true as const, result }), (error: unknown) => ({ ok: false as const, error }));
  const creationSpend = await (service as unknown as { creationSpends: Pick<AutomationStudioFlowBootstrapCreationSpendStore, "get"> }).creationSpends.get(project.id, flow.flowId);
  return { settled, calls: () => calls, creationSpend, close: async () => { await service.close(); await rm(dataDir, { recursive: true, force: true }); } };
}

describe("a candidate build survives an unusable reply and accounts for its spend", () => {
  it("one malformed reply is refused, asked again, and the next valid submission continues the build to a proposal", async () => {
    const build = await candidateBuild((call, latest) => call === 1 ? { kind: "tool_call", callId: "look", toolId: "inspect", input: { area: "item" } }
      : call === 2 ? malformedSubmission
      : call === 3 ? { kind: "tool_call", callId: "submit", toolId: "core.submit_candidate", input: { summary: "complete revision", plan: plan() } }
      : call === 4 ? { kind: "tool_call", callId: "test", toolId: "core.test_candidate", input: { revision: latest?.revision, digest: latest?.digest } }
      : { kind: "complete", result: { revision: latest?.revision, digest: latest?.digest } });
    try {
      if (!build.settled.ok) throw build.settled.error;
      // Five decisions, the refused one among them, the trial's two judge calls at $0.0005, and the start's reading (t976).
      expect(build.settled.result).toMatchObject({ status: "proposed", accounting: { estimatedCostUsd: expect.closeTo(5 * DECISION_USD + 0.001 + READING_USD, 6) }, candidate: { revision: 1, trial: { verdict: "yes" } } });
      expect(build.calls()).toBe(5);
    } finally { await build.close(); }
  }, 60_000);

  // No count of unusable replies in a row ends the loop (t1056; it was twelve): each is asked again on the same model
  // and paid for, and the purse ends a build that never gets a usable one.
  it("unusable replies in a row are each asked again far past the old backstop, until the purse ends the build, with its spend", async () => {
    const build = await candidateBuild((call) => call === 1 ? { kind: "tool_call", callId: "look", toolId: "inspect", input: { area: "item" } } : malformedSubmission);
    try {
      if (build.settled.ok) throw new Error(`expected the build to end, got ${build.settled.result.status}`);
      expect(build.calls()).toBeGreaterThan(1 + OLD_BACKSTOP);
      // The decisions and the start's reading (t976).
      const spent = build.calls() * DECISION_USD + READING_USD;
      const diagnostic = (build.settled.error as { diagnostic?: Record<string, unknown> }).diagnostic;
      expect(diagnostic).toMatchObject({ code: "flow_bootstrap.evidence_iteration_limit", providerInvocation: "attempted", accounting: { estimatedCostUsd: expect.closeTo(spent, 6) },
        evidenceLoop: { exhausted: { bound: "budget", budgetBound: "cost" } } });
      // The creation's purse, the per-build ceiling, holds the same spend the failure reports.
      expect(build.creationSpend?.spentUsd).toBeCloseTo(spent, 6);
    } finally { await build.close(); }
  }, 60_000);

  it("a candidate build a provider throw ends still reports what it spent before the throw", async () => {
    const build = await candidateBuild((call) => {
      if (call >= 3) throw new Error("synthetic provider failure");
      return { kind: "tool_call", callId: `look-${call}`, toolId: "inspect", input: { area: `item-${call}` } };
    });
    try {
      if (build.settled.ok) throw new Error(`expected the build to end, got ${build.settled.result.status}`);
      const diagnostic = (build.settled.error as { diagnostic?: Record<string, unknown> }).diagnostic;
      // The harness's failure keeps the failed request's identity; the spend is the build's: the start's reading (t976) and the two paid decisions before the throw.
      expect(diagnostic).toMatchObject({ code: "flow_bootstrap.provider_transport_unknown", stage: "provider_request", accounting: { requestId: expect.stringMatching(/^llm\.evidence_tool_decision\./u), inputTokens: 30, outputTokens: 15, totalTokens: 45, estimatedCostUsd: expect.closeTo(2 * DECISION_USD + READING_USD, 6) } });
      // The call that got no answer reported no usage, so the purse settles it at zero, never at its hold (t966, 89e40b545):
      // the purse holds exactly what the failure reports.
      expect(build.creationSpend?.spentUsd).toBeCloseTo(2 * DECISION_USD + READING_USD, 6);
    } finally { await build.close(); }
  }, 60_000);
});
