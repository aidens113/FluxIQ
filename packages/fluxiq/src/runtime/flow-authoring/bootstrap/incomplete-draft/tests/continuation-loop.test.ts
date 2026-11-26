// The whole round trip through the real evidence loop: a build runs out, keeps
// its draft, and the next build starts from it, is told what it owes, and
// appends to it rather than starting over.
import { describe, expect, it, vi } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_RESUMED_TOOL_ID } from "../../../../llm/evidence-loop/index.ts";
import { runAutomationStudioLlmEvidenceLoop } from "../../../../llm/index.ts";
import { automationStudioFlowBootstrapIncompleteDraftKeeper, type AutomationStudioFlowBootstrapIncompleteDraft } from "../index.ts";

const library = [{ toolId: "run_node", description: "Run one node.", inputSchema: { type: "object" }, effect: "mutate" as const, perCallEffect: true as const }];

/**
 * A model that presses a new control every decision, so only the allowance ends the build: its tokens, the one count of
 * decisions left a budget names (t1056: no count of turns ends a loop). Each decision is held at 1,000 tokens, one more is
 * held back, and the last three are the wrap-up, which runs no press: `presses` land, then the tokens run out.
 */
const tokensFor = (presses: number) => ({ maxTotalTokens: (presses + 4) * 1_000, maxTokensPerDecision: 1_000 });
function pressesOnward(prefix: string) {
  let call = 0;
  return vi.fn(async (_input: { evidence: ReadonlyArray<{ toolId: string; value: JsonValue }> }) => {
    call += 1;
    return { kind: "tool_call", callId: `${prefix}.${call}`, toolId: "run_node", input: { press: `${prefix}${call}` }, add: true };
  });
}

/** Every press works and shows something new. */
function executeTool() {
  let call = 0;
  return vi.fn(async () => {
    call += 1;
    return { kind: "llm_evidence_tool_execution" as const, evidence: { ok: true, seen: call }, effectApplied: true };
  });
}

describe("a build that runs out, and the build that continues it", () => {
  it("keeps the first build's steps and hands them to the second, which appends to them", async () => {
    let stored: AutomationStudioFlowBootstrapIncompleteDraft | undefined;
    const store = { save: async (record: AutomationStudioFlowBootstrapIncompleteDraft) => { stored = structuredClone(record); }, discard: async () => { stored = undefined; } };
    const build = { projectId: "p1", flowId: "f1", baseDependencyDigest: "digest-1", sourceInstructionIds: ["i1"] };

    const first = automationStudioFlowBootstrapIncompleteDraftKeeper({ enabled: true, stored, ...build, ...store });
    expect(first.draft).toBeUndefined();
    const ran = await first.settle(runAutomationStudioLlmEvidenceLoop({ tools: library, decide: pressesOnward("a"), executeTool: executeTool(), budget: tokensFor(3) }));
    expect(ran).toMatchObject({ ok: false, code: "llm_evidence_loop.iteration_limit" });
    if (ran.ok) return;
    expect(await first.exhausted(ran, (kept) => kept)).toEqual({ revision: 1, steps: 3 });
    expect(stored?.steps.map((step) => [step.id, step.input])).toEqual([["d1", { press: "a1" }], ["d2", { press: "a2" }], ["d3", { press: "a3" }]]);

    const second = automationStudioFlowBootstrapIncompleteDraftKeeper({ enabled: true, stored, ...build, ...store });
    expect(second.draft).toBeDefined();
    const decide = pressesOnward("b");
    const continued = await second.settle(runAutomationStudioLlmEvidenceLoop({ tools: library, decide, executeTool: executeTool(), budget: tokensFor(2), draft: second.draft! }));

    // Told before its first decision that it continues a build, and how much it holds.
    const firstLook = decide.mock.calls[0]![0].evidence.find((entry) => entry.toolId === AUTOMATION_STUDIO_LLM_EVIDENCE_RESUMED_TOOL_ID)?.value as JsonObject | undefined;
    expect(firstLook).toMatchObject({ code: "llm_evidence_loop.resumed", revision: 1, stopped: "budget", draftSteps: 3, proposableSteps: 3 });

    // The draft carries on from where the first left it, with ids that never clash: the first build's three, then the
    // second's own presses, as many as its tokens paid for (no count of turns says how many, t1056).
    const ids = continued.steps.map((step) => step.id);
    expect(ids.length).toBeGreaterThan(3);
    expect(ids).toEqual(ids.map((_id, index) => `d${index + 1}`));
    expect(continued.steps.slice(3).every((step) => String((step.input as JsonObject).press).startsWith("b"))).toBe(true);
    if (continued.ok) return;
    // What it keeps is what can be proposed: at least the first build's three and the second's first presses.
    const kept = await second.exhausted(continued, (record) => record);
    expect(kept).toEqual({ revision: 2, steps: expect.any(Number) });
    expect(kept!.steps).toBeGreaterThanOrEqual(5);
    expect(stored?.revision).toBe(2);

    // A build that proposes a Flow clears the record: there is nothing left to continue.
    const third = automationStudioFlowBootstrapIncompleteDraftKeeper({ enabled: true, stored, ...build, ...store });
    await third.finished();
    expect(stored).toBeUndefined();
  });
});
