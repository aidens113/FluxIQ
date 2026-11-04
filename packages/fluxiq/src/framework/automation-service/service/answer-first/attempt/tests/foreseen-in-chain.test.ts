// What the domain says of a call reaches the act gate before anything is sent, and an answer that
// throws or has another shape is no answer and stops nothing (t870).

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioAttemptActRecord } from "../../../../../../runtime/answer-first/act-record/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../../../../../runtime/llm/index.ts";
import { automationStudioAnswerFirstCallChain } from "../call-chain.ts";

type Answer = AutomationStudioLlmEvidenceToolExecutionResult;
type Describe = Parameters<typeof automationStudioAnswerFirstCallChain>[0]["describe"];

const FROZEN = { selector: "#renew-card", element: { label: "Renew card" } };
const pressed = (value: JsonObject): Answer => ({ kind: "llm_evidence_tool_execution", evidence: { ok: true, pageChanged: true }, effectApplied: true, draft: { actionId: "library.press", effect: "mutate", proposes: true, ranWith: { node: "library.press", parameters: value.parameters as JsonObject } } });
const call = (callId: string, parameters: JsonObject) => ({ callId, toolId: "core.run_node", value: { node: "library.press", parameters, consequences: ["modify_existing"] } });

function chain(describe: Describe) {
  const sent: string[] = [];
  const record = new AutomationStudioAttemptActRecord();
  const execute = automationStudioAnswerFirstCallChain({
    domain: async (asked) => {
      sent.push(asked.callId);
      return pressed(asked.value);
    },
    record,
    sink: { fromCall: async () => undefined },
    witnesses: { beforeFirstLastingAct: async () => ({ kind: "unread", note: { side: "before", code: "answer_first.witness_unread" } }) },
    readRowsKey: undefined,
    describe,
    stepped: () => undefined,
    answered: () => undefined
  });
  return { execute, sent, record };
}

describe("what the domain says of a call", () => {
  it("refuses a press by a new handle on what already landed, with nothing sent", async () => {
    const { execute, sent } = chain((asked) => (asked.value.parameters as { target?: unknown }).target ? { target: "Renew card", wouldRunWith: FROZEN } : undefined);
    await execute(call("first", FROZEN));
    const again = await execute(call("again", { target: { handle: "t7" } })) as Answer;
    expect(again.resultCode).toBe("attempt.act_already_done");
    expect(sent).toEqual(["first"]);
  });

  it("a throw is no answer: the call goes as it did, and the record is written", async () => {
    const { execute, sent, record } = chain(() => { throw new Error("No packets."); });
    const answer = await execute(call("first", { target: { handle: "t7" } })) as Answer;
    expect(answer.effectApplied).toBe(true);
    expect(sent).toEqual(["first"]);
    expect(record.acts()).toEqual([expect.objectContaining({ state: "landed" })]);
  });

  it("another shape is no answer", async () => {
    for (const odd of [7, "words", { target: 7, wouldRunWith: ["not", "an", "object"] }, { wouldRunWith: "#renew" }]) {
      const { execute, sent } = chain(() => odd as unknown as ReturnType<NonNullable<Describe>>);
      await execute(call("first", FROZEN));
      const other = await execute(call("other", { target: { handle: "t7" } })) as Answer;
      expect(other.effectApplied).toBe(true);
      expect(sent).toEqual(["first", "other"]);
    }
  });

  it("sends the call as it was written: what it says changes nothing that goes out", async () => {
    const seen: JsonObject[] = [];
    const record = new AutomationStudioAttemptActRecord();
    const execute = automationStudioAnswerFirstCallChain({
      domain: async (asked) => {
        seen.push(structuredClone(asked.value));
        return pressed(asked.value);
      },
      record,
      sink: { fromCall: async () => undefined },
      witnesses: { beforeFirstLastingAct: async () => ({ kind: "unread", note: { side: "before", code: "answer_first.witness_unread" } }) },
      readRowsKey: undefined,
      describe: () => ({ target: "Renew card", wouldRunWith: FROZEN }),
      stepped: () => undefined,
      answered: () => undefined
    });
    const asked = call("first", { target: { handle: "t7" } });
    await execute(asked);
    expect(seen).toEqual([{ node: "library.press", parameters: { target: { handle: "t7" } }, consequences: ["modify_existing"] }]);
  });
});
