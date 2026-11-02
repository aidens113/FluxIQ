// @fluxiq-test-group real-sql
import { describe, expect, it, vi } from "vitest";
import { sqlAdmissionFixture } from "../../../../storage/project/execution-admission/tests/fixture.ts";
import { runAutomationStudioFlowCandidateAuthoringLoop, type AutomationStudioCandidateTrialPort } from "../../../flow-bootstrap/candidate/index.ts";
import { AutomationStudioSiteResetLedger } from "../../../flow-bootstrap/site-reset/index.ts";
import type { AutomationStudioLlmEvidenceLoopDecision } from "../../../llm/evidence-loop/index.ts";
import * as recovery from "../../../llm/stall-recovery/index.ts";
import { isCandidateTrialJsonObject } from "../../contracts/index.ts";
import { candidateAdmissionFixture } from "./fixture.ts";

describe("normal and stall candidate entrances share safety admission", () => {
  it.each(["normal", "stall"] as const)("makes zero second committing calls through the real %s authoring entrance", async entrance => sqlAdmissionFixture(async ({ store }) => {
    let counter = 0;
    let resets = 0;
    let recovered = 0;
    const original = recovery.createAutomationStudioStallRecoveryEntry;
    vi.spyOn(recovery, "createAutomationStudioStallRecoveryEntry").mockImplementation(input => {
      const actual = original(input);
      return async (iteration, call) => {
        recovered += 1;
        return await actual(iteration, call);
      };
    });
    const port: AutomationStudioCandidateTrialPort = async () => {
      counter += 1;
      port.prepareStart = async () => {
        resets += 1;
        return "reset";
      };
      throw new Error("synthetic committed callback lost its reply");
    };
    try {
      const actual = await candidateAdmissionFixture({ persistence: store, port });
      let receipt: { revision: number; digest: string } | undefined;
      const result = await runAutomationStudioFlowCandidateAuthoringLoop({ submission: actual.submission, trial: actual.trial,
        siteReset: new AutomationStudioSiteResetLedger(), siteResetSettleMs: 0,
        loop: { tools: [{ toolId: "controlled.find", effect: "observe", description: "Inspect fixture state", inputSchema: { type: "object" } }],
          maxIterations: 15, maxToolCalls: 15,
          unusableDecisions: { maxConsecutive: 15, maxInARow: 15, stalled: () => new Error("controlled stalled loop") },
          executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { matches: [] }, effectApplied: false, stateDigests: { before: "world.actual", after: "world.actual" } }),
          decide: async ({ iteration, evidence }): Promise<AutomationStudioLlmEvidenceLoopDecision> => {
            const submitted = [...evidence].reverse().find(entry => entry.toolId === "core.submit_candidate")?.value;
            if (isCandidateTrialJsonObject(submitted) && typeof submitted.revision === "number" && typeof submitted.digest === "string") receipt = { revision: submitted.revision, digest: submitted.digest };
            if (iteration === 1) return { kind: "tool_call", callId: "look.initial", toolId: "controlled.find", input: { query: "initial" } };
            if (iteration === 2) return { kind: "tool_call", callId: "submit.actual", toolId: "core.submit_candidate", input: actual.draft() };
            if (!receipt) throw new Error("The real loop did not submit its candidate.");
            if (iteration === 3 || entrance === "normal" && iteration === 4) return { kind: "tool_call", callId: `test.${iteration}`, toolId: "core.test_candidate", input: receipt };
            if (entrance === "stall" && iteration <= 11) return { kind: "tool_call", callId: `look.${iteration}`, toolId: "controlled.find", input: { query: `query.${iteration}` } };
            return { kind: "complete", result: receipt };
          }
        }
      });
      expect(result.loop.ok).toBe(false);
      expect(counter).toBe(1);
      expect(resets).toBe(0);
      if (entrance === "stall") expect(recovered).toBeGreaterThan(0);
      expect((await actual.assembly.consumer.inspect(actual.scope)).state).toBe("pending");
    } finally { vi.restoreAllMocks(); }
  }));
});
