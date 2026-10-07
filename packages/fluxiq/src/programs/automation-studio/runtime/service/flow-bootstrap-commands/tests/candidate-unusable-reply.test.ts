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
import { automationStudioFlowBootstrapEvidenceLoopLimits } from "../../../loop-limits/index.ts";
import { automationStudioConversationCallCause } from "../../../conversations/commands/index.ts";
import { blankFixture, caller, judgeReply, mockProvider, plan } from "../../../tests/service-bootstrap/tests/fixtures.ts";

const DECISION_USD = 0.001;
const MAX_CALLS = 12;

type Reply = (call: number, latest: { revision?: number; digest?: string } | undefined) => Record<string, unknown>;

/** The round 3 reply: a whole submission whose wrapper says `callId` where `tool_call` belongs, and no call id. */
const malformedSubmission = { kind: "callId", toolId: "core.submit_candidate", input: { summary: "complete revision", plan: plan() } };

async function candidateBuild(reply: Reply) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-candidate-unusable-"));
  let calls = 0;
  const provider = mockProvider(async (request) => {
    if (request.taskKind === "loop_verification") return judgeReply("yes");
    calls++;
    const evidence = request.context.evidenceLoop?.evidence ?? [];
    const latest = [...evidence].reverse().find((entry) => entry.toolId === "core.submit_candidate")?.value as { revision?: number; digest?: string } | undefined;
    return { response: { kind: "evidence_tool_decision", summary: "Scripted candidate authoring", decision: reply(calls, latest) }, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: DECISION_USD } };
  });
  const service = new AutomationStudioService({ dataDir, llmProviderResolver: () => ({ provider, maxCallsPerRun: MAX_CALLS, maxEstimatedCostUsd: 0.1 }),
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
      // Five decisions, the refused one among them, and the trial's two judge calls at $0.0005.
      expect(build.settled.result).toMatchObject({ status: "proposed", accounting: { estimatedCostUsd: expect.closeTo(5 * DECISION_USD + 0.001, 6) }, candidate: { revision: 1, trial: { verdict: "yes" } } });
      expect(build.calls()).toBe(5);
    } finally { await build.close(); }
  }, 60_000);

  it("unusable replies in a row stop at the bound legacy's loop is given, staged and worded as an unusable answer, with the build's spend", async () => {
    const build = await candidateBuild((call) => call === 1 ? { kind: "tool_call", callId: "look", toolId: "inspect", input: { area: "item" } } : malformedSubmission);
    try {
      if (build.settled.ok) throw new Error(`expected the build to end, got ${build.settled.result.status}`);
      // The shared bound: the same figure the legacy round's `unusableDecisions` is built from.
      const bound = automationStudioFlowBootstrapEvidenceLoopLimits({ maxCallsPerRun: MAX_CALLS }).maxConsecutiveUnusableDecisions;
      expect(build.calls()).toBe(1 + bound);
      const spent = (1 + bound) * DECISION_USD;
      const diagnostic = (build.settled.error as { diagnostic?: Record<string, unknown> }).diagnostic;
      expect(diagnostic).toMatchObject({ code: "flow_bootstrap.evidence_unusable_decision", stage: "provider_output_validation", providerInvocation: "attempted", providerResponse: "received",
        accounting: { estimatedCostUsd: expect.closeTo(spent, 6) }, issueCodes: ["llm_output.invalid_evidence_decision"] });
      // What the chat says: the answer could not be used, never that the model could not be reached.
      const said = automationStudioConversationCallCause("The build", { ok: false, payload: { diagnostic } } as Parameters<typeof automationStudioConversationCallCause>[1]);
      expect(said).toBe("The build failed: the model's answer could not be used");
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
      // The harness's failure keeps the failed request's identity; the spend is the build's, the two paid decisions before it.
      expect(diagnostic).toMatchObject({ code: "flow_bootstrap.provider_transport_unknown", stage: "provider_request", accounting: { requestId: expect.stringMatching(/^llm\.evidence_tool_decision\./u), inputTokens: 20, outputTokens: 10, totalTokens: 30, estimatedCostUsd: expect.closeTo(2 * DECISION_USD, 6) } });
      // The purse settles the call that got no answer at what it held for it, so it counts at least what the failure reports.
      expect(build.creationSpend?.spentUsd).toBeCloseTo(3 * DECISION_USD, 6);
    } finally { await build.close(); }
  }, 60_000);
});
