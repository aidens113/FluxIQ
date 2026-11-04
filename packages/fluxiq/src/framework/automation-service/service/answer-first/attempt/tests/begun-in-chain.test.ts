// A lasting act is on the persisted record before the attempt's call chain sends it (t870, plan
// D6, item 3). The chain needs no line of its own for this: its act gate begins the act, under
// the witness and over the domain. This holds that order, and what is left when the domain never
// answers.

import { describe, expect, it } from "vitest";
import { AutomationStudioAttemptActRecord, type AutomationStudioAttemptActRecordData } from "../../../../../../runtime/answer-first/act-record/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../../../../../runtime/llm/index.ts";
import { automationStudioAnswerFirstCallChain } from "../call-chain.ts";

type Answer = AutomationStudioLlmEvidenceToolExecutionResult;

function chain(domain: () => Promise<Answer>, persist?: (data: AutomationStudioAttemptActRecordData) => Promise<void>) {
  const events: string[] = [];
  const written: AutomationStudioAttemptActRecordData[] = [];
  const record = new AutomationStudioAttemptActRecord({
    persist: persist ?? (async (data) => {
      events.push("written");
      written.push(data);
    })
  });
  const counts = { stepped: 0 };
  const execute = automationStudioAnswerFirstCallChain({
    domain: async () => {
      events.push("domain");
      return await domain();
    },
    record,
    sink: { fromCall: async () => undefined },
    witnesses: {
      beforeFirstLastingAct: async () => {
        events.push("witness");
        return { kind: "unread", note: { side: "before", code: "answer_first.witness_unread" } };
      }
    },
    readRowsKey: undefined,
    describe: () => ({ target: "Renew the loan" }),
    stepped: () => { counts.stepped += 1; },
    answered: () => undefined
  });
  return { execute, events, written, record, counts };
}

const PRESS = { callId: "press", toolId: "library.press", value: { target: { handle: "t1" }, consequences: ["modify_existing"] } };
const READ = { callId: "read", toolId: "library.read", value: { consequences: [] } };
const pressed: Answer = { kind: "llm_evidence_tool_execution", evidence: { ok: true, pageChanged: true }, effectApplied: true, draft: { effect: "mutate" } };
const SAME = { actionId: "library.press", parameters: { target: { handle: "t1" } }, consequences: ["modify_existing"], stage: "exploration" as const };

describe("the call chain and a lasting act", () => {
  it("reads the witness, writes the act, and only then sends it", async () => {
    const { execute, events } = chain(async () => pressed);
    await execute(PRESS);
    expect(events.slice(0, 3)).toEqual(["witness", "written", "domain"]);
  });

  it("leaves it as may have landed, in a person's words, when the domain never answers", async () => {
    let reached = () => undefined as void;
    const sent = new Promise<void>((resolve) => { reached = resolve; });
    const { execute, written } = chain(() => {
      reached();
      return new Promise<Answer>(() => undefined);
    });
    void execute(PRESS);
    await sent;
    expect(written.at(-1)!.acts).toEqual([expect.objectContaining({ state: "may_have_landed", what: "Renew the loan" })]);
    const fresh = new AutomationStudioAttemptActRecord({ seed: JSON.parse(JSON.stringify(written.at(-1))) as AutomationStudioAttemptActRecordData });
    expect(fresh.admit(SAME).kind).toBe("look_first");
    expect(fresh.acts().map((act) => act.state)).toEqual(["may_have_landed"]);
  });

  it("adds no write for a read", async () => {
    const { execute, written, record } = chain(async () => ({ kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: false, draft: { effect: "observe" } }));
    await execute(READ);
    await record.flushed();
    expect(written).toEqual([]);
  });

  it("sends nothing, and counts no step, when the record cannot be written", async () => {
    const { execute, events, counts } = chain(async () => pressed, async () => { throw new Error("disk full"); });
    await expect(execute(PRESS)).resolves.toMatchObject({ resultCode: "attempt.act_not_recorded", effectApplied: false });
    expect(events).not.toContain("domain");
    expect(counts.stepped).toBe(0);
  });
});
