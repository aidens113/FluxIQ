// A scoped opening call is still the opening call to the candidate authoring
// loop (`../../candidate/authoring-loop.ts`), which a subflow builder's loop
// is built beside: the site reset reads the build's start right after the
// opening, not before it, whether or not the opening carries a brief's scope
// (`../../../llm/evidence-loop/call-id.ts`). Kept here, with the scope's other
// tests, because the candidate directory's tests are another task's.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceTool } from "../../../llm/index.ts";
import { runAutomationStudioFlowCandidateAuthoringLoop } from "../../candidate/index.ts";
import { AutomationStudioSiteResetLedger } from "../../site-reset/index.ts";
import { testSubmission } from "./subflow-fixture.ts";

const look: AutomationStudioLlmEvidenceTool = {
  toolId: "core.run_node", description: "Run a node.", effect: "mutate", perCallEffect: true,
  inputSchema: { type: "object" }, initialObservation: { input: { node: "demo.look", parameters: {}, consequences: [] } }
};

async function opening(callScope?: string) {
  const executed: string[] = [];
  const readAfter: number[] = [];
  const binding = {
    startState: async () => {
      readAfter.push(executed.length);
      return { state: { lines: 0 }, differs: [] };
    }
  };
  await runAutomationStudioFlowCandidateAuthoringLoop({
    submission: { ...testSubmission(), binding: { ...testSubmission().binding, ...binding } },
    trial: { candidateId: "candidate.scoped", port: async (request) => ({ revision: request.revision, digest: request.digest, verdict: "yes", feedback: {} }) },
    siteReset: new AutomationStudioSiteResetLedger(), siteResetSettleMs: 0,
    loop: {
      ...(callScope === undefined ? {} : { callScope }),
      tools: [look], maxIterations: 1, maxToolCalls: 2,
      executeTool: async (call) => {
        executed.push(call.callId);
        return { kind: "llm_evidence_tool_execution", evidence: { ok: true } as JsonObject, effectApplied: false, targetsUnchanged: true };
      },
      decide: async () => ({ kind: "tool_call", toolId: "core.run_node", callId: "look.1", input: { node: "demo.look", parameters: {}, consequences: [] } })
    }
  }).catch((error: unknown) => error);
  return { executed, readAfter };
}

describe("the opening call, scoped or not, to the candidate authoring loop", () => {
  it("keeps the unscoped id and reads the start right after it", async () => {
    const { executed, readAfter } = await opening();
    expect(executed[0]).toBe("initial.core.run_node");
    expect(readAfter[0]).toBe(1);
  });

  it("suffixes a scoped id and still reads the start right after it", async () => {
    const { executed, readAfter } = await opening("brief-1");
    expect(executed[0]).toBe("initial.core.run_node.brief-1");
    expect(readAfter[0]).toBe(1);
  });
});
