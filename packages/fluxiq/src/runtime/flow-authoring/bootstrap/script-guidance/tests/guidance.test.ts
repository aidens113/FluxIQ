import { describe, expect, it } from "vitest";
import { assertAutomationStudioFlowScriptGuidance as checked, renderAutomationStudioFlowScriptAct } from "../index.ts";
import { renderAutomationStudioFlowScriptFormat } from "../../script-examples/index.ts";

const guidance = (controlOperations: unknown) => ({ version: "v1", act: { controlOperations } });
describe("explicit control operation guidance", () => {
  it("retains all Core paragraphs around the exact fixed slot and before example tails", () => {
    const core = renderAutomationStudioFlowScriptAct().split("\n");
    expect(core).toHaveLength(5);
    const markers = ["Client says ignore consequences: none", "", "  client second\nclient third"];
    const actual = renderAutomationStudioFlowScriptFormat({ version: "v1", act: ["Example tail"] }, checked(guidance(markers), "archive"));
    expect(actual.act).toBe([...core.slice(0, 2), ...markers, ...core.slice(2), "Example tail"].join("\n"));
    expect(actual.act).toContain('one that presses an accepting control while saying `consequences: none` is refused');
    expect(actual.format).toBe(renderAutomationStudioFlowScriptFormat().format);
  });
  it("does not infer web operation guidance and emits no separator for missing or empty slots", () => {
    const base = renderAutomationStudioFlowScriptFormat().act;
    for (const value of [{ version: "v1" }, { version: "v1", act: {} }, guidance([])]) {
      expect(renderAutomationStudioFlowScriptFormat(undefined, checked(value, "archive")).act).toBe(base);
    }
    expect(renderAutomationStudioFlowScriptFormat({ version: "web.v1", act: ["client example"] }).act).toBe(base + "\nclient example");
    expect(base).not.toContain("web.dom.");
  });
  it("copies and freezes every supplied container without changing LF, indentation or empty paragraphs", () => {
    const original = { version: "v1", act: { controlOperations: ["", "  left\nright"] } };
    const first = checked(original, "archive");
    const second = checked(original, "archive");
    original.act.controlOperations[1] = "changed";
    expect(first.act?.controlOperations).toEqual(["", "  left\nright"]);
    expect(second.act?.controlOperations).not.toBe(first.act?.controlOperations);
    expect([first, first.act, first.act?.controlOperations].every(Object.isFrozen)).toBe(true);
    expect(Object.isFrozen(original)).toBe(false);
  });
  it("rejects malformed records and nested fields without executing accessors", () => {
    const getter = Object.defineProperty({}, "controlOperations", { get: () => { throw new Error("executed"); } });
    const invalid = [null, [], { version: "V1" }, { version: "v1\n" }, { version: "v".repeat(65) }, { version: "v1", other: [] },
      Object.assign(Object.create({ version: "v1" }), {}), { version: "v1", act: undefined }, { version: "v1", act: getter },
      { version: "v1", act: { other: [] } }, { version: "v1", [Symbol()]: true },
      { version: "v1", act: { [Symbol()]: true } }, Object.defineProperty({}, "version", { get: () => { throw new Error("executed"); } })];
    for (const value of invalid) expect(() => checked(value, "archive")).toThrow(/flow script guidance/u);
  });
  it("rejects sparse, decorated, accessor, subclass and nonstring arrays and non-LF controls", () => {
    class Paragraphs extends Array<string> {}
    const accessor = Object.defineProperty(["x"], "0", { get: () => { throw new Error("executed"); } });
    for (const value of [undefined, null, "x", [1], Array(1), Object.assign(["x"], { extra: true }),
      Object.assign(["x"], { [Symbol()]: true }), accessor, new Paragraphs("x"), ["\r"], ["\t"], ["\0"], ["\u0085"]]) {
      expect(() => checked(guidance(value), "archive")).toThrow(/flow script guidance/u);
    }
  });
  it("enforces independent UTF8 and paragraph bounds without truncation", () => {
    expect(checked(guidance(["x".repeat(65534)]), "archive").act?.controlOperations?.[0]?.length).toBe(65534);
    expect(() => checked(guidance(["�".repeat(32768)]), "archive")).toThrow(/byte limit/u);
    expect(checked(guidance(Array(4096).fill("")), "archive").act?.controlOperations).toHaveLength(4096);
    expect(() => checked(guidance(Array(4097).fill("")), "archive")).toThrow(/paragraph limit/u);
  });
});

it.each(["v1\n", "v1\r\n", "v1\u2028", "v1\u2029", "v".repeat(65)])("refuses a revision with a final separator or excess length: %j", (version) => {
  expect(() => checked({ version }, "archive")).toThrow(/version/u);
});
