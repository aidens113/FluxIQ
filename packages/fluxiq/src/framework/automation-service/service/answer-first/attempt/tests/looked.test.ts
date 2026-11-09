// What the chain hands on of a look (`../call-chain.ts`, `looked`): from the call's own answer, only
// once the record holds an act, never a read's rows or a refused look, and the same look once only.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioAttemptActRecord } from "../../../../../../runtime/answer-first/act-record/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../../../../../runtime/llm/index.ts";
import { automationStudioAnswerFirstCallChain } from "../call-chain.ts";

const WHERE = "http://127.0.0.1:5000/saved/folder/2/";
const FOUND = "2 matches for \"maker\"\nt40 img \"First item\" (alt=\"by maker\") at the top";

function execution(evidence: JsonObject, over: Partial<AutomationStudioLlmEvidenceToolExecutionResult> = {}): AutomationStudioLlmEvidenceToolExecutionResult {
  return { kind: "llm_evidence_tool_execution", evidence, effectApplied: false, resultCode: "web.inspect.succeeded", ...over };
}

const ANSWERS: Record<string, AutomationStudioLlmEvidenceToolExecutionResult> = {
  press: execution({ ok: true, location: WHERE }, { effectApplied: true, resultCode: "web.action.succeeded", draft: { effect: "mutate" } }),
  find: execution({ location: WHERE, found: FOUND }),
  look: execution({ location: WHERE, page: `PAGE "Folder"\nURL ~/saved/folder/2/\n${"line\n".repeat(400)}` }, { draft: { effect: "observe" } }),
  read: execution({ ok: true, location: WHERE, page: "PAGE \"Folder\"", read: { extracted: [{ title: "First item" }] } }, { draft: { effect: "observe" } }),
  refused: execution({ ok: false, location: WHERE, found: "0 matches" })
};

function chain(looks: { where: string; found: string }[]) {
  return automationStudioAnswerFirstCallChain({
    domain: async (call) => ANSWERS[call.toolId]!,
    record: new AutomationStudioAttemptActRecord(),
    sink: { fromCall: async () => undefined },
    witnesses: { beforeFirstLastingAct: async () => ({ kind: "unread", note: { side: "before", code: "answer_first.witness_unread" } }) },
    readRowsKey: "read.extracted",
    describe: undefined,
    stepped: () => undefined,
    answered: () => undefined,
    looked: (look) => { looks.push(look); }
  });
}

const call = (toolId: string, value: JsonObject = {}) => ({ callId: `${toolId}.${Math.random()}`, toolId, value });
const PRESS = call("press", { target: { handle: "t1" }, consequences: ["create_new"] });

describe("a look the chain hands on", () => {
  it("hands on nothing before the first lasting act", async () => {
    const looks: { where: string; found: string }[] = [];
    const execute = chain(looks);
    await execute(call("find", { query: "maker" }));
    expect(looks).toEqual([]);
  });

  it("hands on a search's own found lines after it, once only", async () => {
    const looks: { where: string; found: string }[] = [];
    const execute = chain(looks);
    await execute(PRESS);
    await execute(call("find", { query: "maker" }));
    await execute(call("find", { query: "maker" }));
    expect(looks).toEqual([{ where: WHERE, found: FOUND }]);
  });

  it("hands on the start of a page looked at, cut short, and never a read's rows or a refused look", async () => {
    const looks: { where: string; found: string }[] = [];
    const execute = chain(looks);
    await execute(PRESS);
    await execute(call("read"));
    await execute(call("refused", { query: "x" }));
    await execute(call("look"));
    expect(looks).toHaveLength(1);
    expect(looks[0]!.where).toBe(WHERE);
    expect(looks[0]!.found.startsWith("PAGE \"Folder\"")).toBe(true);
    expect([...looks[0]!.found].length).toBeLessThanOrEqual(600);
  });
});
