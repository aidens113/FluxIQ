// A builder's decide, answered by Core where a receipt is ready (t811,
// `../builder-auto-complete.ts`): only where completion is offered, at most once
// for a revision and digest, so a completion its check refused goes back to the
// model rather than round again, and with the line the chat shows as Core's.
import { describe, expect, it } from "vitest";
import { automationStudioActivityDecisionReason, automationStudioActivityReasonText } from "../../../activity/index.ts";
import type { AutomationStudioLlmEvidenceLoopInput } from "../../../llm/index.ts";
import { automationStudioSubflowBuilderAutoComplete } from "../index.ts";

type Request = Parameters<AutomationStudioLlmEvidenceLoopInput["decide"]>[0];

const request = (iteration: number, canComplete: boolean): Request => ({ iteration, tools: [], evidence: [], decisionSchema: {}, canComplete });

describe("a builder's decide answered by Core (t811)", () => {
  it("makes its decision once for a revision, and only where completion is offered", async () => {
    const asked: number[] = [];
    const decide: AutomationStudioLlmEvidenceLoopInput["decide"] = async ({ iteration }) => {
      asked.push(iteration);
      return { kind: "complete", result: { ended: "partial", reason: "model" } };
    };
    const receipt = { subflowKey: "find_listing", revision: 2, digest: "d".repeat(64) };
    const wrapped = automationStudioSubflowBuilderAutoComplete(decide, () => receipt);
    expect(await wrapped(request(1, false))).toMatchObject({ result: { reason: "model" } });
    const made = await wrapped(request(2, true));
    expect(made).toEqual({ kind: "complete", result: receipt });
    expect(automationStudioActivityDecisionReason.isCoreWritten(made)).toBe(true);
    const line = "Core finished this part of the task because the latest version passed its test, so nothing was left to decide.";
    expect(automationStudioActivityDecisionReason.of(made)).toBe(line);
    // The chat says it whole: the observer screens a decision's reason this way (`../../../activity/observer.ts`).
    expect(automationStudioActivityReasonText(line, undefined, { decision: true })).toBe(line);
    // Refused once, the same receipt is the model's to send again or not.
    expect(await wrapped(request(3, true))).toMatchObject({ result: { reason: "model" } });
    expect(asked).toEqual([1, 3]);
  });

  it("asks the model where no receipt is ready, and makes a new revision's decision once it is", async () => {
    let ready: { subflowKey: string; revision: number; digest: string } | undefined;
    let asked = 0;
    const wrapped = automationStudioSubflowBuilderAutoComplete(async () => {
      asked += 1;
      return { kind: "tool_call", toolId: "core.run_node", callId: `c${asked}`, input: {} };
    }, () => ready);
    expect(await wrapped(request(1, true))).toMatchObject({ kind: "tool_call" });
    ready = { subflowKey: "find_listing", revision: 1, digest: "a".repeat(64) };
    expect(await wrapped(request(2, true))).toMatchObject({ kind: "complete", result: { revision: 1 } });
    ready = { subflowKey: "find_listing", revision: 2, digest: "b".repeat(64) };
    expect(await wrapped(request(3, true))).toMatchObject({ kind: "complete", result: { revision: 2 } });
    expect(asked).toBe(1);
  });
});
