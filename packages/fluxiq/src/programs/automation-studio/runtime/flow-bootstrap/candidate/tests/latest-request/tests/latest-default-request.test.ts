import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../../../core/index.ts";
import { runAutomationStudioFlowCandidateAuthoringLoop } from "../../../index.ts";
import { refusalTestSubmission } from "../../refusal-domain-fixture.ts";

const script = (url: string) => ({ flow: ["flow: Read the notice", "step open: open the notice", "  node: web.browser.navigate", `  url: ${url}`].join("\n") });

describe("a whole-candidate test's latest-default identity", () => {
  it("uses the backend's new proposal even when the target state and model's empty input did not change", async () => {
    const asked: number[] = [];
    const answers = new Map<string, JsonObject>();
    let decides = 0;
    const outcome = await runAutomationStudioFlowCandidateAuthoringLoop({
      submission: refusalTestSubmission(),
      trial: { candidateId: "candidate.latest", port: async request => {
        asked.push(request.revision);
        return { revision: request.revision, digest: request.digest, verdict: asked.length === 1 ? "no" : "yes", feedback: {} };
      } },
      observe: loop => ({ ...loop, executeTool: async call => {
        const answered = await loop.executeTool(call);
        answers.set(call.callId, (answered as { evidence?: JsonObject }).evidence ?? {});
        return answered;
      } }),
      loop: {
        tools: [], maxIterations: 8, maxToolCalls: 8, captureStateDigest: () => "the-same-page", executeTool: async () => ({}),
        decide: async () => {
          switch (++decides) {
            case 1: return { kind: "tool_call", toolId: "core.submit_candidate", callId: "submit-1", input: script("https://notice.test/old") };
            case 2: return { kind: "tool_call", toolId: "core.test_candidate", callId: "test-1", input: {} };
            case 3: return { kind: "tool_call", toolId: "core.submit_candidate", callId: "submit-2", input: script("https://notice.test/fixed") };
            case 4: return { kind: "tool_call", toolId: "core.test_candidate", callId: "test-2", input: {} };
            default: return { kind: "complete", result: { revision: answers.get("submit-2")!.revision!, digest: answers.get("submit-2")!.digest! } };
          }
        }
      }
    });
    expect(outcome.loop.ok, JSON.stringify(outcome.loop)).toBe(true);
    expect(asked).toEqual([1, 2]);
    expect(answers.get("test-2")).toMatchObject({ verdict: "yes", revision: 2 });
  });
});
