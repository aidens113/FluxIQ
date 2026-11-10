import { describe, expect, it } from "vitest";
import { panelAssistantDecisionOf } from "../decision.ts";

describe("panelAssistantDecisionOf", () => {
  it("reads a reply and a tool call, as a string or an object", () => {
    expect(panelAssistantDecisionOf('{"reply":"All done."}')).toEqual({ ok: true, decision: { kind: "reply", text: "All done." } });
    expect(panelAssistantDecisionOf({ tool: "find_tools", input: { query: "rename" }, why: "to find the right tool" }))
      .toEqual({ ok: true, decision: { kind: "call", tool: "find_tools", input: { query: "rename" }, why: "to find the right tool" } });
    expect(panelAssistantDecisionOf({ tool: "x__y" })).toEqual({ ok: true, decision: { kind: "call", tool: "x__y", input: {}, why: "" } });
  });

  it("names what is wrong with anything else, guessing nothing", () => {
    expect(panelAssistantDecisionOf("not json")).toEqual({ ok: false, problem: "The answer was not JSON." });
    expect(panelAssistantDecisionOf([1])).toEqual({ ok: false, problem: "The answer was not one JSON object." });
    expect(panelAssistantDecisionOf({ reply: "  " })).toEqual({ ok: false, problem: "The reply was empty." });
    expect(panelAssistantDecisionOf({ reply: "x", tool: "y" }).ok).toBe(false);
    expect(panelAssistantDecisionOf({ say: "hello" }).ok).toBe(false);
    expect(panelAssistantDecisionOf({ tool: "y", input: [1] }).ok).toBe(false);
  });
});
