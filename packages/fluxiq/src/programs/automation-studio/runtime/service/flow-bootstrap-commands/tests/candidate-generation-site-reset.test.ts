import { describe, expect, it, vi } from "vitest";
import { AutomationStudioSiteResetLedger } from "../../../flow-bootstrap/site-reset/index.ts";
import type { generateAutomationStudioFlowCandidateDraft as Generate } from "../candidate-generation.ts";

type Input = Parameters<typeof Generate>[0];

// The build's ledger of its own lasting acts reaches the authoring loop
// (t462), which alone decides what it does with it. The loop is replaced by a
// spy that records its input and stops the build.

const handed: unknown[] = [];
vi.mock("../../../flow-bootstrap/candidate/index.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../flow-bootstrap/candidate/index.ts")>();
  const runAutomationStudioFlowCandidateAuthoringLoop = async (input: unknown) => {
    handed.push(input);
    throw new Error("stop.after_handing");
  };
  return { ...original, runAutomationStudioFlowCandidateAuthoringLoop };
});
const { generateAutomationStudioFlowCandidateDraft } = await import("../candidate-generation.ts");

function build(extra: Record<string, unknown>) {
  const usage = { calls: 0, estimatedInputTokens: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 };
  return generateAutomationStudioFlowCandidateDraft({
    submission: { projectId: "p", flowId: "f", baseDependencyDigest: "b" } as unknown as Input["submission"],
    loop: { tools: [], executeTool: async () => ({}), maxIterations: 2, maxToolCalls: 2 } as unknown as Input["loop"],
    maxConsecutiveUnusableDecisions: 2,
    harness: { provider: { metadata: { provider: "test", model: "m" } } } as unknown as Input["harness"],
    runHarness: async () => { throw new Error("never asked"); },
    wrapDecision: (decide) => decide, beforeDecision: () => undefined, progress: () => undefined, ending: () => undefined,
    authorityUsage: usage as unknown as Input["authorityUsage"], sourceInstructionIds: [], baseSettingsRevision: 1,
    currentBinding: async () => ({ executionDigest: "b", settingsRevision: 1 }), store: { save: async (record) => record },
    ...extra
  });
}

describe("candidate generation hands the site reset ledger to the loop", () => {
  it("passes the ledger it is given, beside the trial", async () => {
    handed.length = 0;
    const siteReset = new AutomationStudioSiteResetLedger();
    await expect(build({ siteReset, candidateId: "candidate.1", trial: async () => { throw new Error("never run"); } })).rejects.toThrow();
    expect(handed).toHaveLength(1);
    expect((handed[0] as { siteReset?: unknown }).siteReset).toBe(siteReset);
    expect((handed[0] as { trial?: { candidateId: string } }).trial?.candidateId).toBe("candidate.1");
  });

  it("passes none when it is given none", async () => {
    handed.length = 0;
    await expect(build({})).rejects.toThrow();
    expect(handed).toHaveLength(1);
    expect(Object.hasOwn(handed[0] as object, "siteReset")).toBe(false);
  });
});
