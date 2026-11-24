// The one reading of a decision (t1025), each shape from a recorded reply of the bigbox runs of 2026-11-24, with
// made-up tools and words: what the model wrote, key for key, and nothing it saw on a page.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import { automationStudioLlmDecisionInputValueOf, automationStudioLlmDecisionRead } from "../index.ts";

const runNode = { toolId: "core.run_node", inputSchema: { type: "object", additionalProperties: false, required: ["node", "parameters", "consequences"], properties: { node: { enum: ["lib.output.read_list", "lib.output.snapshot", "lib.output.next_page"] }, parameters: { type: "object" }, consequences: { type: "array" } } } as JsonObject };
const loopDecision = { toolId: "core.loop_decision", inputSchema: { type: "object", additionalProperties: false, required: ["decision"], properties: { decision: { enum: ["continue", "ask_person"] }, why: { type: "string" }, question: { type: "string" } } } as JsonObject };
const find = { toolId: "core.find_text", inputSchema: { type: "object", required: ["query"], properties: { query: { type: "string" } } } as JsonObject };
const tools = [find, runNode, loopDecision];
const nodeCall = { node: "lib.output.next_page", parameters: { nextPage: { list: "handle.5" } }, consequences: [] };

describe("a tool call's own optional key written null (run-mwus396e step 45)", () => {
  it("is read as not written, and nothing else is touched", () => {
    const read = automationStudioLlmDecisionRead({ kind: "tool_call", callId: "page.next.4", toolId: "core.run_node", input: nodeCall, add: true, act: null, place: null }, tools);
    expect(read.decision).toEqual({ kind: "tool_call", callId: "page.next.4", toolId: "core.run_node", input: nodeCall, add: true });
    expect(read.readings).toEqual([{ code: "own_key_nulls", keys: ["act", "place"] }]);
  });

  it("leaves an input's own null and a completion alone", () => {
    expect(automationStudioLlmDecisionRead({ kind: "tool_call", callId: "a", toolId: "core.find_text", input: { query: null } }, tools).readings).toEqual([]);
    expect(automationStudioLlmDecisionRead({ kind: "complete", result: {}, act: null }, tools).readings).toEqual([]);
  });
});

describe("a call of core.loop_decision under kind loop_decision (run-mwuuo3zk step 144, run-mwuxd2v9 step 179)", () => {
  it("is the tool call it can only be", () => {
    const read = automationStudioLlmDecisionRead({ kind: "loop_decision", callId: "loop.stop.1", toolId: "core.loop_decision", input: { decision: "ask_person", question: "Which one?", why: "Two fit." } }, tools);
    expect(read.decision).toEqual({ kind: "tool_call", callId: "loop.stop.1", toolId: "core.loop_decision", input: { decision: "ask_person", question: "Which one?", why: "Two fit." } });
    expect(read.readings).toEqual([{ code: "kind_inferred", kindWritten: "unknown", callIdFilled: false }]);
  });
});

describe("a tool call written flat under its tool's name (run-mwuxd2v9 step 215)", () => {
  const flat = { kind: "loop_decision", decision: "ask_person", question: "Which one?", why: "Two fit." };

  it("is a call of the one offered tool whose id ends in that name, with its input keys gathered", () => {
    const read = automationStudioLlmDecisionRead(flat, tools);
    expect(read.decision).toMatchObject({ kind: "tool_call", toolId: "core.loop_decision", input: { decision: "ask_person", question: "Which one?", why: "Two fit." } });
    expect((read.decision as { callId: string }).callId).toMatch(/^call\.[0-9a-f]{8}$/);
    expect(read.readings).toEqual([{ code: "flat_tool_call", toolId: "core.loop_decision", callIdFilled: true }]);
    // The same reply reads the same way every time: the provider adapter's reading and the harness's agree.
    expect(automationStudioLlmDecisionRead(flat, tools).decision).toEqual(read.decision);
  });

  it("is not read when a key is none the tool declares, when two tools share the name, or with nothing offered", () => {
    expect(automationStudioLlmDecisionRead({ ...flat, note: "x" }, tools).readings).toEqual([]);
    expect(automationStudioLlmDecisionRead(flat, [...tools, { toolId: "lib.loop_decision", inputSchema: loopDecision.inputSchema }]).readings).toEqual([]);
    expect(automationStudioLlmDecisionRead(flat, undefined).readings).toEqual([]);
    expect(automationStudioLlmDecisionRead({ kind: "complete", decision: "x" }, tools).readings).toEqual([]);
  });
});

describe("a node's id as the toolId (run-mwuuo3zk step 89, run-mwuxd2v9 step 196)", () => {
  it("is a call of the tool whose input names it there", () => {
    const read = automationStudioLlmDecisionRead({ kind: "tool_call", callId: "next.41", toolId: "lib.output.next_page", input: nodeCall, add: false }, tools);
    expect(read.decision).toEqual({ kind: "tool_call", callId: "next.41", toolId: "core.run_node", input: nodeCall, add: false });
    expect(read.readings).toEqual([{ code: "value_tool_id", toolId: "core.run_node", key: "node" }]);
  });

  it("is not read where the input does not name it (steps 219, 247): what else that input holds is the model's to say", () => {
    expect(automationStudioLlmDecisionRead({ kind: "tool_call", callId: "snap.42", toolId: "lib.output.snapshot", input: {} }, tools).readings).toEqual([]);
    expect(automationStudioLlmDecisionRead({ kind: "tool_call", callId: "read.29", toolId: "lib.output.read_list", input: { readList: { handle: "handle.18" } } }, tools).readings).toEqual([]);
    expect(automationStudioLlmDecisionInputValueOf("lib.output.snapshot", tools)).toEqual([{ toolId: "core.run_node", key: "node" }]);
  });
});

describe("a key of the tool's input beside input, as before", () => {
  it("still moves into input, after the other readings", () => {
    const read = automationStudioLlmDecisionRead({ kind: "callId", toolId: "core.find_text", input: {}, query: "cups" }, tools);
    expect(read.decision).toMatchObject({ kind: "tool_call", toolId: "core.find_text", input: { query: "cups" } });
    expect(read.readings.map((one) => one.code)).toEqual(["kind_inferred", "keys_folded"]);
  });
});
