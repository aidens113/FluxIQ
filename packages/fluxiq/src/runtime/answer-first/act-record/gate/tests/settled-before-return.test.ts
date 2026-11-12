import { describe, expect, it } from "vitest";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../../../llm/index.ts";
import type { AutomationStudioAttemptActRecordData } from "../../contracts.ts";
import { AutomationStudioAttemptActRecord } from "../../record.ts";
import { automationStudioAttemptActGate } from "../act-gate.ts";

const call = { callId: "save", toolId: "core.run_node", value: { node: "domain.save", parameters: { selector: "#save", element: { text: "Save" } }, consequences: ["modify_existing"] } };
const answer: AutomationStudioLlmEvidenceToolExecutionResult = { kind: "llm_evidence_tool_execution", evidence: { ok: true, pageChanged: true }, effectApplied: true, draft: { actionId: "domain.save", effect: "mutate", proposes: true } };

describe("settlement durability before tool evidence returns", () => {
  it("holds a known-landed answer until its scoped persistence has committed", async () => {
    let landed = (): void => undefined;
    let commit = (): void => undefined;
    const reached = new Promise<void>((resolve) => { landed = resolve; });
    const allowed = new Promise<void>((resolve) => { commit = resolve; });
    let durable: AutomationStudioAttemptActRecordData | undefined;
    const record = new AutomationStudioAttemptActRecord({ persist: async (data) => {
      if (data.acts[0]?.state === "landed") {
        landed();
        await allowed;
      }
      durable = data;
    } });
    const execute = automationStudioAttemptActGate({ record, executeTool: async () => answer });
    let returned = false;
    const running = execute(call).then(() => { returned = true; });
    await reached;
    await Promise.resolve();
    const beforeCommit = returned;
    commit();
    await running;
    expect(beforeCommit).toBe(false);
    expect(durable?.acts[0]?.state).toBe("landed");
  });

  it("preserves dispatch and uncertain-record write failures together", async () => {
    const dispatch = new Error("dispatch answer lost");
    const storage = new Error("uncertain record write failed");
    let writes = 0;
    const record = new AutomationStudioAttemptActRecord({ persist: async () => { if (++writes > 1) throw storage; } });
    const execute = automationStudioAttemptActGate({ record, executeTool: async (): Promise<typeof answer> => { throw dispatch; } });
    const failure = await execute(call).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors).toEqual([dispatch, storage]);
  });

  it("propagates a failed withdrawal write before exposing an observation", async () => {
    const storage = new Error("withdrawal write failed");
    const record = new AutomationStudioAttemptActRecord({ persist: async (data) => { if (data.acts.length === 0) throw storage; } });
    const observed: typeof answer = { ...answer, effectApplied: false, draft: { ...answer.draft!, effect: "observe" } };
    const execute = automationStudioAttemptActGate({ record, executeTool: async () => observed });
    await expect(execute(call)).rejects.toBe(storage);
  });
});
