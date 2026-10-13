// After a trial, the model's next decision sees the page the trial left
// (`../trial-view.ts`, t477; lane C round 10, `run-mv5uu9g1-9d80deea`: the
// trial moved the browser to a filtered page and the model held only handles
// from the page before it).
import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioLlmEvidenceTool, AutomationStudioLlmEvidenceToolExecutionResult } from "../../../llm/evidence-loop.ts";
import { automationStudioCandidateTrialView } from "../index.ts";

const look: AutomationStudioLlmEvidenceTool = { toolId: "core.run_node", description: "Run a node", inputSchema: { type: "object" }, effect: "mutate", perCallEffect: true, initialObservation: { input: { node: "web.inspect" }, arrival: { node: "web.navigate" } } };
const others: AutomationStudioLlmEvidenceTool[] = [{ toolId: "web.find_on_page", description: "Find", inputSchema: { type: "object" }, effect: "observe" }];
const trial = (effectApplied: boolean): AutomationStudioLlmEvidenceToolExecutionResult => ({ kind: "llm_evidence_tool_execution", evidence: { ok: false, verdict: "unsure", retestsLeft: 2 }, effectApplied, targetsUnchanged: !effectApplied, resultCode: "candidate.trial_unsure", resultReason: "retry_allowed" });

describe("the page a trial left", () => {
  it("is looked at once with the domain's own look and put on the trial's answer, the answer otherwise as it was", async () => {
    const executeTool = vi.fn(async () => ({ kind: "llm_evidence_tool_execution", evidence: { page: "filtered results", handles: ["t901"] }, effectApplied: false }));
    const answered = await automationStudioCandidateTrialView({ answer: trial(true), tools: [...others, look], executeTool, callId: "test.1" });

    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(executeTool).toHaveBeenCalledWith({ callId: "test.1.page", toolId: "core.run_node", value: { node: "web.inspect" } });
    expect(answered).toMatchObject({ effectApplied: true, resultCode: "candidate.trial_unsure", resultReason: "retry_allowed" });
    expect(answered.evidence).toMatchObject({ verdict: "unsure", retestsLeft: 2, pageAfterTrial: { page: "filtered results", handles: ["t901"] } });
    expect(String((answered.evidence as { pageAfterTrialNote: string }).pageAfterTrialNote)).toContain("handles to use now");
  });

  it("is not looked at when nothing ran on the target, or when no tool declares a look", async () => {
    const executeTool = vi.fn();
    expect(await automationStudioCandidateTrialView({ answer: trial(false), tools: [look], executeTool, callId: "test.2" })).toEqual(trial(false));
    expect(await automationStudioCandidateTrialView({ answer: trial(true), tools: others, executeTool, callId: "test.3" })).toEqual(trial(true));
    expect(executeTool).not.toHaveBeenCalled();
  });

  it("says to look again when the look failed or was refused, and lets the build's stop through", async () => {
    const threw = await automationStudioCandidateTrialView({ answer: trial(true), tools: [look], executeTool: async () => { throw new Error("capture failed"); }, callId: "test.4" });
    expect(threw.evidence).not.toHaveProperty("pageAfterTrial");
    expect(String((threw.evidence as { pageAfterTrialNote: string }).pageAfterTrialNote)).toContain("look at it again");
    const refused = await automationStudioCandidateTrialView({ answer: trial(true), tools: [look], executeTool: async () => ({ ok: false, code: "page_unreadable" }), callId: "test.5" });
    expect(refused.evidence).not.toHaveProperty("pageAfterTrial");

    const stop = new AbortController();
    stop.abort();
    await expect(automationStudioCandidateTrialView({ answer: trial(true), tools: [look], executeTool: async () => { throw new Error("aborted"); }, callId: "test.6", signal: stop.signal })).rejects.toThrow("aborted");
  });
});
