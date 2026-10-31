import { describe, expect, it } from "vitest";
import { assertAutomationStudioFlowScriptExamples, renderAutomationStudioFlowScriptExamples } from "../index.ts";

const grammar = { format: "FORMAT", act: "ACT", loop: "LOOP", state: "STATE" };

describe("client flow script examples", () => {
  it("has no absent, partial or empty-section fallback", () => {
    expect(renderAutomationStudioFlowScriptExamples(grammar)).toEqual(grammar);
    expect(renderAutomationStudioFlowScriptExamples(grammar, { version: "v1" })).toEqual(grammar);
    expect(renderAutomationStudioFlowScriptExamples(grammar, { version: "v1", act: [] })).toEqual(grammar);
    expect(renderAutomationStudioFlowScriptExamples(grammar, { version: "v1", act: [""] }).act).toBe("ACT\n");
  });

  it("preserves every authored line byte, indentation, newline and empty line", () => {
    const lines = ["Example: archive a document", "  act archive.record", "", "    first\n    second", ""];
    const examples = assertAutomationStudioFlowScriptExamples({ version: "archive.v2-1_a", format: lines }, "archive");
    expect(renderAutomationStudioFlowScriptExamples(grammar, examples)).toEqual({ ...grammar, format: `FORMAT\n${lines.join("\n")}` });
    expect(examples.format).toEqual(lines);
    expect(Object.isFrozen(examples)).toBe(true);
    expect(Object.isFrozen(examples.format)).toBe(true);
    lines[0] = "changed";
    expect(examples.format?.[0]).toBe("Example: archive a document");
  });

  it.each([
    null, [], "text", {}, { version: "V1" }, { version: "" }, { version: "v".repeat(65) },
    { version: "v1", extra: [] }, { version: "v1", act: undefined }, { version: "v1", act: "text" },
    { version: "v1", act: [1] }, { version: "v1", act: ["\t"] }, { version: "v1", act: ["\r"] },
    { version: "v1", act: ["\u0085"] }, { version: "v1", act: ["\u001b"] },
    { version: "v1", act: new Array(1) }, { version: "v1", act: Array(4097).fill("") }
  ])("rejects malformed authored metadata %j", (value) => {
    expect(() => assertAutomationStudioFlowScriptExamples(value, "archive")).toThrow(/flow script examples/u);
  });

  it("rejects getters and unknown keys without invoking getters", () => {
    const getter = () => { throw new Error("getter executed"); };
    const top = Object.defineProperty({ version: "v1" }, "act", { get: getter });
    expect(() => assertAutomationStudioFlowScriptExamples(top, "archive")).toThrow(/data field/u);
    const lines = Object.defineProperty([""], "0", { get: getter });
    expect(() => assertAutomationStudioFlowScriptExamples({ version: "v1", act: lines }, "archive")).toThrow(/data field/u);
    const extra = Object.assign(["line"], { hidden: "extra" });
    expect(() => assertAutomationStudioFlowScriptExamples({ version: "v1", act: extra }, "archive")).toThrow(/contiguous/u);
    expect(() => assertAutomationStudioFlowScriptExamples({ version: "v1", [Symbol("extra")]: [] }, "archive")).toThrow(/unknown/u);
  });

  it("bounds total UTF-8 authored bytes across sections and never truncates", () => {
    const accepted = "x".repeat(65534);
    expect(assertAutomationStudioFlowScriptExamples({ version: "v1", act: [accepted] }, "archive").act).toEqual([accepted]);
    expect(() => assertAutomationStudioFlowScriptExamples({ version: "v1", act: [accepted], loop: ["x"] }, "archive")).toThrow(/65536-byte limit/u);
    expect(() => assertAutomationStudioFlowScriptExamples({ version: "v1", act: ["é".repeat(32768)] }, "archive")).toThrow(/65536-byte limit/u);
  });
});
