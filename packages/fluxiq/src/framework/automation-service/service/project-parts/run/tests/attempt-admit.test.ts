// @fluxiq-test-group real-sql
// A part run inside a task's attempt asks the attempt's act record before each lasting step, and a part
// handed no row says why. The real record, runner, store, executor and frames; a host and a domain of
// plain functions. Asserted: what reached the domain, and what a model is answered.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RunProjectPartResponse } from "../../../../../../api-contracts/automation.ts";
import type { JsonObject } from "../../../../../../core/index.ts";
import { createBlankAutomationStudioFlowArtifact, type AutomationStudioFlowArtifact } from "../../../../../../flows/authoring/model/index.ts";
import { AutomationStudioAttemptActRecord, type AutomationStudioAttemptActCall } from "../../../../../../runtime/answer-first/act-record/index.ts";
import { AUTOMATION_STUDIO_LLM_RUN_PART_TOOL_ID, type AutomationStudioHarnessOptionLoopBinding, type AutomationStudioLlmEvidenceToolExecutionResult } from "../../../../../../runtime/llm/index.ts";
import type { AutomationStudioKnownParts } from "../../../../../../runtime/project-parts/index.ts";
import { automationStudioAnswerFirstKnownParts } from "../../known-parts.ts";
import type { AutomationStudioGraphExecutionOptions } from "../../../../executor/index.ts";
import type { ProjectPartAdmit } from "../index.ts";
import { projectPartSettledCalls } from "../settled-calls.ts";
import { actionGraph, openRowsHarness, PROJECT, rowGraph, siteGraph, type RowsHarness } from "./part-rows-harness.ts";

const FLOW = "flow.attempt";
const PRESS = { actionId: "custom.press", parameters: { target: { selector: "#press" } }, consequences: ["create_new"], stage: "exploration" } satisfies AutomationStudioAttemptActCall;
const WORDS = { what: "", where: "" };
const FIRST = { key: "a", words: "first" };
const SECOND = { key: "b", words: "second" };

type Offered = Parameters<typeof automationStudioAnswerFirstKnownParts>[0];

/** A part of one press with no row: it asks the page once, and its act is the same act every time. */
function pressOnce(key: string): AutomationStudioFlowArtifact {
  const blank = createBlankAutomationStudioFlowArtifact({ flowId: `graph.${key}`, projectId: PROJECT, name: key, now: 1, metadata: { parentFlowId: "flow.source", parentSubflowId: `subflow.${key}`, subflowGraph: true } });
  return {
    ...blank,
    nodes: [
      { id: `${key}.start`, definitionId: "builtin.control.start", definitionVersion: "1.0.0", label: "Start" },
      { id: `${key}.press`, definitionId: "custom.press", definitionVersion: "1.0.0", label: "Press it", parameterValues: { target: { selector: "#press" } }, metadata: { declaredConsequences: ["create_new"] } }
    ],
    edges: [{ id: `${key}.1`, sourceNodeId: `${key}.start`, sourcePortId: "success", targetNodeId: `${key}.press`, targetPortId: "in" }]
  };
}

describe("a part in an attempt asks the act record", () => {
  let harness: RowsHarness;
  beforeEach(async () => {
    harness = await openRowsHarness();
  });
  afterEach(async () => {
    await harness.close();
  });

  const admitOf = (record: AutomationStudioAttemptActRecord): ProjectPartAdmit => (call) => record.admit({ ...call, stage: "exploration" }).kind;
  const ranIn = async (partId: string, record: AutomationStudioAttemptActRecord): Promise<RunProjectPartResponse> => {
    const ran = await harness.parts.runAs({ projectId: PROJECT, partId, inputs: {}, caller: "build", permittedConsequences: ["create_new"], permission: async () => ({ permitted: true, missing: [], requestId: null }), admit: admitOf(record), settled: (call, outcome) => {
      record.settled({ ...call, stage: "exploration" }, { ...outcome, words: WORDS });
    } });
    if ("ok" in ran) throw new Error(ran.code);
    return ran.response;
  };

  it("an act done by hand on a row, then through a part: refused at that row, nothing pressed", async () => {
    const record = new AutomationStudioAttemptActRecord();
    record.settled({ ...PRESS, row: FIRST }, { effectApplied: true, words: WORDS });
    const answer = await ranIn(await harness.save([rowGraph("loop")]), record);
    expect(answer).toMatchObject({ status: "stopped", stoppedAt: { reason: expect.stringContaining("already done") } });
    expect(harness.domain.pressed).toEqual([]);
  });

  it("across a call too, and the rows before it are done: the row done by hand stops the part there, and the one after is not tried", async () => {
    const record = new AutomationStudioAttemptActRecord();
    record.settled({ ...PRESS, row: SECOND }, { effectApplied: true, words: WORDS });
    const answer = await ranIn(await harness.save([actionGraph("act"), siteGraph("site", { subflowId: "subflow.act" })]), record);
    expect(answer.status).toBe("stopped");
    expect(harness.domain.pressed).toEqual(["a"]);
  });

  it("one that may have landed stops it too, and an observation since lets it go, as the record says", async () => {
    const partId = await harness.save([rowGraph("loop")]);
    const record = new AutomationStudioAttemptActRecord();
    record.settled({ ...PRESS, row: FIRST }, { effectApplied: false, uncertain: true, words: WORDS });
    expect((await ranIn(partId, record))).toMatchObject({ status: "stopped", stoppedAt: { reason: expect.stringContaining("may already have happened") } });
    expect(harness.domain.pressed).toEqual([]);
    record.looked();
    expect((await ranIn(partId, record)).status).toBe("succeeded");
    expect(harness.domain.pressed).toEqual(["a", "b", "c"]);
  });

  it("a part with no act on the record presses every row, each told to the record once, and a press that surely did nothing is tried again", async () => {
    harness.page.pressAnswer = (key, tries) => (key === "a" && tries === 1 ? "unacted" : "landed");
    const record = new AutomationStudioAttemptActRecord();
    expect((await ranIn(await harness.save([rowGraph("loop")]), record)).status).toBe("succeeded");
    expect(harness.domain.pressed).toEqual(["a", "a", "b", "c"]);
    expect(record.acts().map((act) => act.state)).toEqual(["landed", "landed", "landed"]);
  });

  it("the second run in one attempt finds its own first run's acts", async () => {
    const partId = await harness.save([rowGraph("loop")]);
    const record = new AutomationStudioAttemptActRecord();
    await ranIn(partId, record);
    harness.domain.pressed.length = 0;
    expect((await ranIn(partId, record)).status).toBe("stopped");
    expect(harness.domain.pressed).toEqual([]);
  });

  describe("an act with no row", () => {
    beforeEach(() => {
      harness.page.rows = [{ key: "only", words: "the one" }];
    });

    it("the same control by hand, then through a part: refused, nothing pressed", async () => {
      const record = new AutomationStudioAttemptActRecord();
      record.settled(PRESS, { effectApplied: true, words: WORDS });
      expect((await ranIn(await harness.save([pressOnce("once")]), record))).toMatchObject({ status: "stopped", stoppedAt: { reason: expect.stringContaining("already done") } });
      expect(harness.domain.pressed).toEqual([]);
    });

    it("the count the person asked for still applies: the third of three runs, the fourth does not", async () => {
      const partId = await harness.save([pressOnce("once")]);
      const record = new AutomationStudioAttemptActRecord({ asked: () => 3 });
      record.settled(PRESS, { effectApplied: true, words: WORDS });
      record.settled(PRESS, { effectApplied: true, words: WORDS });
      expect((await ranIn(partId, record)).status).toBe("succeeded");
      expect(harness.domain.pressed).toEqual(["none"]);
      expect((await ranIn(partId, record)).status).toBe("stopped");
      expect(harness.domain.pressed, "the fourth was not pressed").toEqual(["none"]);
    });
  });

  it("a person's own run, outside an attempt, is not asked: the same acts press, as they did", async () => {
    const record = new AutomationStudioAttemptActRecord();
    record.settled({ ...PRESS, row: FIRST }, { effectApplied: true, words: WORDS });
    const answer = await harness.parts.run({ projectId: PROJECT, partId: await harness.save([rowGraph("loop")]), inputs: {}, permittedConsequences: ["create_new"], acknowledgedRepeat: true }) as RunProjectPartResponse;
    expect(answer.status).toBe("succeeded");
    expect(harness.domain.pressed).toEqual(["a", "b", "c"]);
  });
});

describe("what the record is told and asked", () => {
  const asDoors = (metadata: JsonObject | undefined, parameterValues: JsonObject) => {
    const record = new AutomationStudioAttemptActRecord();
    let ran = 0;
    const held: string[] = [];
    const doors = projectPartSettledCalls({
      nativeNodeExecutor: async () => {
        ran += 1;
        return { result: { status: "success", route: "success", outputs: {} } };
      }
    } as AutomationStudioGraphExecutionOptions, {
      classesOf: () => ({ lasting: true, classes: [] }),
      settled: (call, outcome) => {
        record.settled({ ...call, stage: "exploration" }, { ...outcome, words: WORDS });
      },
      admit: (call) => record.admit({ ...call, stage: "exploration" }).kind,
      held: (_node, answer) => {
        held.push(answer);
      }
    });
    const send = async () => await doors.nativeNodeExecutor!({ node: { id: "step", definitionId: "custom.type", definitionVersion: "1.0.0", ...(metadata ? { metadata } : {}), parameterValues }, inputs: {} } as unknown as Parameters<NonNullable<AutomationStudioGraphExecutionOptions["nativeNodeExecutor"]>>[0]);
    return { record, send, ran: () => ran, held };
  };

  it("a step that says it causes nothing lasting claims no act: a search is sent again, and a first real run would send it too", async () => {
    const parameters = { target: { selector: "#search" }, text: "words" };
    const { record, send, ran, held } = asDoors({ declaredConsequences: [] }, parameters);
    await send();
    await send();
    expect(ran()).toBe(2);
    expect(held).toEqual([]);
    expect(record.acts(), "not an act a result reports").toEqual([]);
    expect(record.carried({ actionId: "custom.type", parameters }), "not an act a real run skips").toBeUndefined();
  });

  it("a step that declared nothing at all still claims one: the second is held", async () => {
    const parameters = { target: { selector: "#search" }, text: "words" };
    const { record, send, ran, held } = asDoors(undefined, parameters);
    await send();
    const second = await send();
    expect(ran()).toBe(1);
    expect(held).toEqual(["already_done"]);
    expect(second?.result).toMatchObject({ status: "failed", failure: { effect: "unacted", retryable: false } });
    expect(record.acts()).toHaveLength(1);
  });

  it("the record compares the step as it ran: the same control with other values is another act", async () => {
    const parameters = (text: string) => ({ target: { selector: "#search" }, text });
    const record = new AutomationStudioAttemptActRecord();
    record.settled({ ...PRESS, actionId: "custom.type", parameters: parameters("one") }, { effectApplied: true, words: WORDS });
    const doors = projectPartSettledCalls({ nativeNodeExecutor: async () => ({ result: { status: "success", route: "success", outputs: {} } }) } as AutomationStudioGraphExecutionOptions, {
      classesOf: () => ({ lasting: true, classes: ["create_new"] }),
      admit: (call) => record.admit({ ...call, stage: "exploration" }).kind
    });
    const send = async (text: string) => await doors.nativeNodeExecutor!({ node: { id: "step", definitionId: "custom.type", definitionVersion: "1.0.0", parameterValues: parameters(text) }, inputs: {} } as unknown as Parameters<NonNullable<AutomationStudioGraphExecutionOptions["nativeNodeExecutor"]>>[0]);
    expect((await send("one"))?.result.status).toBe("failed");
    expect((await send("two"))?.result.status).toBe("success");
  });
});

describe("through the tool's executor", () => {
  let harness: RowsHarness;
  beforeEach(async () => {
    harness = await openRowsHarness();
  });
  afterEach(async () => {
    await harness.close();
  });

  const offered = async (partIds: readonly string[], record = new AutomationStudioAttemptActRecord()) => {
    const base = (): AutomationStudioHarnessOptionLoopBinding => ({ tools: [], executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: false, targetsUnchanged: true }) });
    const known = { note: "n", parts: partIds.map((partId) => ({ partId, version: 1 })) } as unknown as AutomationStudioKnownParts;
    const offer: Offered = await automationStudioAnswerFirstKnownParts<Offered>({
      projectId: PROJECT, flowId: FLOW, instructionText: "do what a person asked", startLocation: undefined, resolution: { scope: { kind: "global" } },
      parts: { shortlist: async () => known, runAs: (input) => harness.parts.runAs(input) }, permissionGround: { permittedConsequences: ["create_new"] }, harnessOptions: base(), continuingOptions: base
    });
    offer.partActs!.use(record);
    return async (partId: string) => await offer.harnessOptions.executeTool({ callId: `call.${partId}`, toolId: AUTOMATION_STUDIO_LLM_RUN_PART_TOOL_ID, value: { partId } as JsonObject }) as AutomationStudioLlmEvidenceToolExecutionResult;
  };

  it("an attempt's own record is asked: an act done by hand stops the part, as an ordinary answer", async () => {
    const record = new AutomationStudioAttemptActRecord();
    record.settled({ ...PRESS, row: FIRST }, { effectApplied: true, words: WORDS });
    const partId = await harness.save([rowGraph("loop")]);
    const answer = await (await offered([partId], record))(partId);
    expect(answer.evidence).toMatchObject({ ok: false, status: "stopped", stoppedAt: { reason: expect.stringContaining("already done") } });
    expect(answer.resultCode).toBe("core.run_part.stopped");
    expect(harness.domain.pressed).toEqual([]);
  });

  it("a part called per row and handed none says why and what to write, in generic words, presses nothing, leaves no step, and the task goes on", async () => {
    const handedNone = await harness.save([actionGraph("act"), siteGraph("site", { subflowId: "subflow.act" }, { given: {} })]);
    const send = await offered([handedNone]);
    const answer = await send(handedNone);
    expect(answer.evidence).toMatchObject({ ok: false, status: "stopped", stoppedAt: { reason: expect.stringContaining("was not handed the item") } });
    const instruction = String((answer.evidence as JsonObject).instruction);
    expect(instruction).toContain("`input: row`");
    expect(instruction).toContain("`row: $row`");
    expect(answer.resultCode).toBe("core.run_part.stopped");
    expect(answer.draft, "a Flow holding this step would stop there too").toBeUndefined();
    expect(harness.domain.pressed).toEqual([]);
    // An ordinary tool answer: nothing on it is an ending, and the next call runs.
    expect(Object.keys(answer).sort()).toEqual(["effectApplied", "evidence", "kind", "resultCode"]);
    const again = await send(handedNone);
    expect(again.resultCode, "nothing landed, so it is not held as already run").toBe("core.run_part.stopped");
    const handed = await harness.save([actionGraph("other"), siteGraph("othersite", { subflowId: "subflow.other" })]);
    const fixed = await send(handed);
    expect(fixed.evidence).toMatchObject({ ok: true, status: "succeeded" });
    expect(harness.domain.pressed).toEqual(["a", "b", "c"]);
  });

  it("any other stop keeps its step and is told no such thing", async () => {
    const partId = await harness.save([rowGraph("loop")]);
    harness.page.noControl.add("a");
    const answer = await (await offered([partId]))(partId);
    expect(answer.evidence).toMatchObject({ ok: false, status: "stopped" });
    expect((answer.evidence as JsonObject).instruction).toBeUndefined();
    expect(answer.draft?.ranWith).toEqual({ part: { partId, version: 1 }, inputs: {} });
  });
});
