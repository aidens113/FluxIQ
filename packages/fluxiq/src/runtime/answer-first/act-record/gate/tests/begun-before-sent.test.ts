// A lasting act on the persisted record before the act gate sends it (t870, plan D6, item 3): a
// dispatch killed mid-way leaves it as may have landed, and a record seeded from what was written
// refuses it until a look and never says it landed. A read writes nothing.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../../../llm/index.ts";
import { AutomationStudioAttemptActRecord, automationStudioAttemptActGate, parseAutomationStudioAttemptActRecordData, type AutomationStudioAttemptActRecordData } from "../../index.ts";

const PRESS = "library.press";
type Call = { callId: string; toolId: string; value: JsonObject };
type Answer = AutomationStudioLlmEvidenceToolExecutionResult;

const pressCall = (callId = "c1", consequences: string[] = ["modify_existing"]): Call => ({ callId, toolId: "core.run_node", value: { node: PRESS, parameters: { selector: ".renew", element: { text: "Renew" } }, consequences } });
const lookCall = (over: JsonObject = {}): Call => ({ callId: "look", toolId: "core.run_node", value: { node: "library.look", parameters: {}, consequences: [], ...over } });
const pressed: Answer = { kind: "llm_evidence_tool_execution", evidence: { ok: true, pageChanged: true }, effectApplied: true, draft: { actionId: PRESS, effect: "mutate", proposes: true } };
const looked: Answer = { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: false, draft: { actionId: "library.look", effect: "observe", proposes: false } };

function chain(send: (call: Call, written: AutomationStudioAttemptActRecordData[]) => Promise<Answer>) {
  const written: AutomationStudioAttemptActRecordData[] = [];
  const record = new AutomationStudioAttemptActRecord({ persist: async (data) => { written.push(data); } });
  const sent: string[] = [];
  const execute = automationStudioAttemptActGate({
    record,
    executeTool: async (call: Call) => {
      sent.push(call.callId);
      return await send(call, written);
    }
  });
  return { record, written, sent, execute };
}

/** What a process that restarts reads: the last thing written, as a file gives it back. */
function restarted(written: readonly AutomationStudioAttemptActRecordData[]): AutomationStudioAttemptActRecord {
  const read = parseAutomationStudioAttemptActRecordData(JSON.parse(JSON.stringify(written.at(-1))));
  if (!read.ok) throw new Error(read.issues.join(", "));
  return new AutomationStudioAttemptActRecord({ seed: read.data });
}

const SAME_PRESS = { actionId: PRESS, parameters: { selector: ".renew", element: { text: "Renew" } }, consequences: ["modify_existing"], stage: "exploration" as const };

describe("a press whose process dies", () => {
  it("is on what was written before the press is sent", async () => {
    let onRecord: AutomationStudioAttemptActRecordData | undefined;
    const { execute } = chain(async (_call, written) => {
      onRecord = written.at(-1);
      return pressed;
    });
    await execute(pressCall());
    expect(onRecord?.acts).toEqual([expect.objectContaining({ state: "may_have_landed", classes: ["modify_existing"] })]);
  });

  it("whose dispatch never returns leaves it as may have landed, and a new record refuses it until a look", async () => {
    let reached = () => undefined as void;
    const sending = new Promise<void>((resolve) => { reached = resolve; });
    const { written, execute, sent } = chain(() => {
      reached();
      return new Promise<Answer>(() => undefined);
    });
    void execute(pressCall());
    await sending;
    expect(sent).toEqual(["c1"]);
    expect(written.at(-1)!.acts).toEqual([expect.objectContaining({ state: "may_have_landed" })]);

    const fresh = restarted(written);
    expect(fresh.admit(SAME_PRESS).kind).toBe("look_first");
    expect(fresh.acts().map((act) => act.state)).toEqual(["may_have_landed"]);
    expect(fresh.acts().some((act) => act.state === "landed")).toBe(false);
    fresh.looked();
    expect(fresh.admit(SAME_PRESS).kind).toBe("run");
    expect(fresh.acts().map((act) => act.state)).toEqual(["may_have_landed"]);
  });

  it("whose dispatch throws an error no domain made leaves it as may have landed, and the error goes on", async () => {
    const { written, record, execute } = chain(async () => {
      throw new TypeError("the socket went away");
    });
    await expect(execute(pressCall())).rejects.toThrow("the socket went away");
    await record.flushed();
    expect(written.at(-1)!.acts).toEqual([expect.objectContaining({ state: "may_have_landed" })]);
    const fresh = restarted(written);
    expect(fresh.admit(SAME_PRESS).kind).toBe("look_first");
    expect(fresh.acts().map((act) => act.state)).toEqual(["may_have_landed"]);
  });

  it("is settled by an answer that does come, as landed, and the write says so", async () => {
    const { written, record, execute } = chain(async () => pressed);
    await execute(pressCall());
    await record.flushed();
    expect(written.at(-1)!.acts).toEqual([expect.objectContaining({ state: "landed" })]);
    expect(restarted(written).admit(SAME_PRESS).kind).toBe("already_done");
  });
});

describe("what is never written", () => {
  it("a read that declares nothing adds no write", async () => {
    const { written, record, execute, sent } = chain(async () => looked);
    await execute(lookCall());
    await execute(lookCall({ replay: "verify" }));
    await record.flushed();
    expect(sent).toHaveLength(2);
    expect(written).toEqual([]);
  });

  it("an undeclared press adds no write before it is sent", async () => {
    let before = -1;
    const { execute } = chain(async (_call, written) => {
      before = written.length;
      return pressed;
    });
    await execute(pressCall("c1", []));
    expect(before).toBe(0);
  });

  it("a read that declared a class comes back off the record: the gate cannot know until it answers, and says nothing of it after", async () => {
    const { written, record, execute } = chain(async () => looked);
    await execute(lookCall({ consequences: ["modify_existing"] }));
    await record.flushed();
    expect(written.at(-1)!.acts).toEqual([]);
    expect(record.acts()).toEqual([]);
  });

  it("a press the page refused comes back off the record, and may run again", async () => {
    const refused: Answer = { kind: "llm_evidence_tool_execution", evidence: { ok: false, reason: "target_not_found" }, effectApplied: false };
    const { written, record, execute, sent } = chain(async () => refused);
    await execute(pressCall());
    await execute(pressCall("c2"));
    await record.flushed();
    expect(sent).toEqual(["c1", "c2"]);
    expect(written.at(-1)!.acts).toEqual([]);
  });
});

describe("a record that cannot be written", () => {
  it("sends nothing, and says so as an answer the call may try again", async () => {
    let failing = true;
    const record = new AutomationStudioAttemptActRecord({ persist: async () => { if (failing) throw new Error("disk full"); } });
    const sent: string[] = [];
    const execute = automationStudioAttemptActGate({
      record,
      executeTool: async (call: Call) => {
        sent.push(call.callId);
        return pressed;
      }
    });
    const answer = await execute(pressCall()) as Answer;
    expect(sent).toEqual([]);
    expect(answer).toMatchObject({ effectApplied: false, targetsUnchanged: true, resultCode: "attempt.act_not_recorded", evidence: { ok: false } });
    expect(record.acts()).toEqual([]);
    failing = false;
    await execute(pressCall("c2"));
    expect(sent).toEqual(["c2"]);
    expect(record.acts()).toEqual([expect.objectContaining({ state: "landed" })]);
  });
});
