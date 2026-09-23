// The recovery context reaching the model.
//
// Phase 2.1 built the context -- eleven sections in a fixed priority order, a
// byte budget, and an explicit record of what was withheld and why -- and then
// nothing carried it anywhere, because the packet had no slot to put it in. The
// context was built, summarized and persisted on the run while the model went
// on being told almost nothing about what had gone wrong. These tests are about
// the slot: what fills it, what must never fill it, and what the run records
// about it afterwards.

import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowInstruction } from "../../../model/index.ts";
import type { AutomationStudioRuntimeRecoveryContext } from "../../recovery/index.ts";
import { createAutomationStudioDeepSeekProvider } from "../deepseek/index.ts";
import { packAutomationStudioLlmContext, runAutomationStudioLlmHarness } from "../harness.ts";

const base = { projectId: "project.llm", flowId: "flow.checkout", instructions: [] as AutomationStudioFlowInstruction[] };

const recoveryContext: AutomationStudioRuntimeRecoveryContext = {
  schemaVersion: "automation-studio.recovery-context.v1",
  sections: {
    failure: { category: "target_not_found", nodeId: "submit", definitionId: "web.dom.click" },
    state_diff: { changedStateIds: ["cart.total"] }
  },
  included: [{ section: "failure", byteCount: 92 }, { section: "state_diff", byteCount: 44 }],
  omitted: [
    { section: "failed_target", reason: "withheld", byteCount: 0 },
    { section: "recent_nodes", reason: "byte_budget", byteCount: 310 },
    { section: "subflow", reason: "absent", byteCount: 0 }
  ],
  byteCount: 1_204,
  byteBudget: 4_000
};

function diagnosisProvider() {
  return {
    metadata: { provider: "mock", model: "recovery-context" },
    runTask: async () => ({ response: { kind: "diagnosis" as const, summary: "The target is gone." } })
  };
}

describe("Automation Studio LLM recovery context packet slot", () => {
  it("carries the recovery context to a runtime task and to no other task", () => {
    for (const taskKind of ["runtime_diagnosis", "runtime_patch"] as const) {
      expect(packAutomationStudioLlmContext({ ...base, taskKind, recoveryContext }).recoveryContext).toEqual(recoveryContext);
    }
    // The same rule the failure evidence beside it is held to. A Flow that has
    // never run has no failure to describe, so a bootstrap packet that carried
    // one would be describing another Flow's run.
    expect(packAutomationStudioLlmContext({ ...base, taskKind: "flow_bootstrap", recoveryContext }).recoveryContext).toBeUndefined();
    expect(packAutomationStudioLlmContext({ ...base, taskKind: "evidence_tool_decision", recoveryContext }).recoveryContext).toBeUndefined();
    // Absent is absent: no empty object, so a reader cannot mistake "no context
    // was built" for "the context was empty".
    expect(packAutomationStudioLlmContext({ ...base, taskKind: "runtime_diagnosis" })).not.toHaveProperty("recoveryContext");
  });

  it("puts the context in the outbound request a provider actually sends", async () => {
    // The point of the whole phase, asserted where it can be observed: the
    // sections leave the process. Everything before this test could pass with
    // the context sitting in a packet nobody sent.
    let outbound = "";
    const provider = createAutomationStudioDeepSeekProvider({
      secretReference: { kind: "secret_reference", id: "secret:deepseek" },
      resolveSecret: async (input) => { outbound = input.outboundBody; return "test-secret"; },
      fetchImpl: (async () => new Response(JSON.stringify({
        choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ kind: "diagnosis", summary: "The target is gone." }) } }],
        usage: { prompt_tokens: 12, completion_tokens: 5, total_tokens: 17 }
      }), { status: 200, headers: { "content-type": "application/json; charset=utf-8" } })) as typeof fetch
    });
    const prepared = await runAutomationStudioLlmHarness({ ...base, taskKind: "runtime_diagnosis", recoveryContext, provider: diagnosisProvider() });
    await provider.runTask(prepared.request);
    const user = JSON.parse((JSON.parse(outbound) as { messages: Array<{ role: string; content: string }> }).messages.find((message) => message.role === "user")!.content) as { context: { recoveryContext?: AutomationStudioRuntimeRecoveryContext } };
    expect(user.context.recoveryContext).toEqual(recoveryContext);
    expect(outbound).toContain("target_not_found");
  });

  it("keeps the context out of the run record, which holds counts and reasons instead", async () => {
    // The intervention records provenance, not evidence: the coordinator writes
    // `summarizeAutomationStudioRuntimeRecoveryContext(...)` onto the run's
    // `llmGate` metadata, so the counts-only account exists once and the run
    // never holds a second copy of whatever the sections were built from.
    //
    // The harness must not summarize it here, and the reason is mechanical
    // rather than stylistic. runtime/recovery imports the evidence loop out of
    // runtime/llm, so a value import the other way closes a module cycle: the
    // DeepSeek provider's schema constants then evaluate before runtime/llm has
    // finished initializing and arrive undefined, silently dropping the opaque
    // handle's pattern and length bound from the schema the model is sent. The
    // absence asserted below is what keeps that from coming back.
    const result = await runAutomationStudioLlmHarness({ ...base, taskKind: "runtime_diagnosis", recoveryContext, provider: diagnosisProvider() });
    expect(result.ok).toBe(true);
    expect(result.intervention.contextSummary).not.toHaveProperty("recoveryContext");
    const recorded = JSON.stringify(result.intervention);
    expect(recorded).not.toContain("web.dom.click");
    expect(recorded).not.toContain("cart.total");
  });
});
