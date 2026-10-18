// The fold on its own: which keys beside a tool call's `input` move into it,
// and which stay where they were written (run-mvcwp3wh-bcea2115). The harness
// path is pinned beside the parse (`../../harness/tests/tool-call-keys-folded.test.ts`).

import { describe, expect, it } from "vitest";
import { automationStudioLlmToolCallKeysFolded } from "../index.ts";

const tools = [
  { toolId: "catalog.write_note", inputSchema: { type: "object", properties: { title: { type: "string" }, reason: { type: "string" }, write: { type: "boolean" }, add: { type: "boolean" } } } },
  { toolId: "catalog.pick", inputSchema: { anyOf: [{ type: "object", properties: { shelf: { type: "string" } } }, { type: "object", properties: { aisle: { type: "string" } } }] } }
];
const call = (extra: Record<string, unknown>, input: unknown = { title: "Inventory" }, toolId = "catalog.write_note") => ({ kind: "tool_call", callId: "c1", toolId, input, ...extra });

describe("a tool call's keys folded into its input", () => {
  it("moves a declared key the input lacks and keeps the call's own keys beside it", () => {
    expect(automationStudioLlmToolCallKeysFolded(call({ reason: "Because.", act: "a1" }), tools)).toEqual({
      decision: { kind: "tool_call", callId: "c1", toolId: "catalog.write_note", act: "a1", input: { title: "Inventory", reason: "Because." } },
      toolId: "catalog.write_note",
      movedKeys: ["reason"]
    });
  });

  it("reads a property a top-level variant declares", () => {
    expect(automationStudioLlmToolCallKeysFolded(call({ aisle: "a3" }, {}, "catalog.pick"), undefined)).toBeUndefined();
    expect(automationStudioLlmToolCallKeysFolded(call({ aisle: "a3" }, {}, "catalog.pick"), tools)?.decision.input).toEqual({ aisle: "a3" });
  });

  it("moves nothing the input already holds, nothing undeclared, and never write or the call's own keys", () => {
    expect(automationStudioLlmToolCallKeysFolded(call({ reason: "Second." }, { reason: "First." }), tools)).toBeUndefined();
    expect(automationStudioLlmToolCallKeysFolded(call({ notes: "x" }), tools)).toBeUndefined();
    expect(automationStudioLlmToolCallKeysFolded(call({ write: true }), tools)).toBeUndefined();
    expect(automationStudioLlmToolCallKeysFolded(call({ add: true }), tools)).toBeUndefined();
  });

  it("leaves anything that is not an offered tool call with an object input", () => {
    expect(automationStudioLlmToolCallKeysFolded({ kind: "complete", result: {}, reason: "x" }, tools)).toBeUndefined();
    expect(automationStudioLlmToolCallKeysFolded(call({ reason: "x" }, "text"), tools)).toBeUndefined();
    expect(automationStudioLlmToolCallKeysFolded(call({ reason: "x" }, {}, "catalog.unoffered"), tools)).toBeUndefined();
    expect(automationStudioLlmToolCallKeysFolded(call({ reason: "x" }), [])).toBeUndefined();
  });

  it("never reaches a prototype through a key it moves", () => {
    const decision = JSON.parse('{"kind":"tool_call","callId":"c1","toolId":"catalog.write_note","input":{},"reason":"x","__proto__":{"polluted":true}}');
    const folded = automationStudioLlmToolCallKeysFolded(decision, tools)!;
    expect(folded.decision.input).toEqual({ reason: "x" });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
