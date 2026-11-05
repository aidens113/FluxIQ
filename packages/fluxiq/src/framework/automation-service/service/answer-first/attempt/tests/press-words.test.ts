// What a person reads for a press by hand (t869's report): a press naming no handle the build was
// shown has no description before it is sent, so what it pressed comes from its own answer rather
// than the line for its class.

import { describe, expect, it } from "vitest";
import { AutomationStudioAttemptActRecord } from "../../../../../../runtime/answer-first/act-record/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../../../../../runtime/llm/index.ts";
import { automationStudioAnswerFirstCallChain } from "../call-chain.ts";

const press = { callId: "press", toolId: "core.run_node", value: { node: "domain.library.renew_card", parameters: {}, consequences: ["modify_existing"] } };

async function actAfter(describe: () => { target?: string } | undefined, control: string | undefined) {
  const record = new AutomationStudioAttemptActRecord();
  const answer: AutomationStudioLlmEvidenceToolExecutionResult = { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true, ...(control ? { draft: { actionId: "domain.library.renew_card", effect: "mutate", input: press.value, proposes: true, control } } : {}) };
  const execute = automationStudioAnswerFirstCallChain({
    domain: async () => answer, record, sink: { fromCall: async () => undefined },
    witnesses: { beforeFirstLastingAct: async () => ({ kind: "unread", note: { side: "before", code: "answer_first.witness_unread" } }) },
    readRowsKey: undefined, describe, stepped: () => undefined, answered: () => undefined
  });
  await execute(press);
  return record.acts()[0];
}

describe("the words of a press by hand", () => {
  it("are what its own answer says it pressed, when nothing could describe it first", async () => {
    expect((await actAfter(() => undefined, "Renew card"))?.what).toBe("Renew card");
  });
  it("stay what the description named, when there was one", async () => {
    expect((await actAfter(() => ({ target: "Renew the card" }), "Renew card"))?.what).toBe("Renew the card");
  });
  it("fall back to the line for its class only with neither", async () => {
    expect((await actAfter(() => undefined, undefined))?.what).toBe("Changed something that was already there");
  });
});
