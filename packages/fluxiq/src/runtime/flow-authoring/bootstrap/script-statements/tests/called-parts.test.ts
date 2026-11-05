// A part's interface as `../called-parts.ts` reads it (t741 B1): every input
// and output name is asked of the one port-name rule (`../part-port-name.ts`),
// so `item`, a loop's row, is refused on either side, at its line.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowScriptBlock } from "../../authoring/index.ts";
import { automationStudioFlowScriptCalledParts, automationStudioFlowScriptCallStep, automationStudioFlowScriptPartInputPort } from "../index.ts";

/** A main block calling `renewal`, and the part with these inputs and outputs. */
function blocks(inputs: readonly string[], outputs: readonly string[]): AutomationStudioFlowScriptBlock[] {
  return [
    { name: "Main", line: 1, steps: [{ label: "renew", description: "renew", line: 2, calls: { label: "renewal", line: 2 }, entries: [], branches: [] }] },
    {
      label: "renewal", name: "renewal", line: 3,
      inputs: inputs.map((label, index) => ({ label, line: 4 + index })),
      outputs: outputs.map((name, index) => ({ name, binding: "$step.read.text", line: 20 + index })),
      steps: [{ label: "read", description: "read the due date", line: 30, entries: [], branches: [] }]
    }
  ];
}

describe("a called part's interface", () => {
  it("keeps names the port-name rule takes", () => {
    const read = automationStudioFlowScriptCalledParts(blocks(["items", "row"], ["itemName", "total"]));
    expect(read.issues).toEqual([]);
    const part = read.parts.get(1)!;
    expect(part.inputs).toEqual(["items", "row"]);
    expect(part.outputs.map((output) => output.name)).toEqual(["itemName", "total"]);
  });

  it("refuses item as an input and as an output, each at its line", () => {
    const read = automationStudioFlowScriptCalledParts(blocks(["item"], ["item"]));
    expect(read.issues.map((issue) => [issue.code, issue.path, issue.message.includes("never \"item\"")])).toEqual([
      ["flow_script.part_interface_invalid", "flow.line.4", true],
      ["flow_script.part_interface_invalid", "flow.line.20", true]
    ]);
    expect(read.parts.get(1)!.inputs).toEqual([]);
    expect(read.parts.get(1)!.outputs).toEqual([]);
  });
});

describe("the row a part declares", () => {
  const step = { label: "keep", description: "keep it", line: 2, calls: { label: "renewal", line: 2 }, branches: [] };
  const part = { blockIndex: 1, label: "renewal", inputs: ["row", "note"], outputs: [] };
  const entry = (key: string, text: string, line: number) => ({ key, lines: [text], line });

  it("is the frame's `item`, and every other input keeps its own name", () => {
    expect(automationStudioFlowScriptPartInputPort("row")).toBe("item");
    expect(automationStudioFlowScriptPartInputPort("note")).toBe("note");
    const lowered = automationStudioFlowScriptCallStep({ ...step, entries: [entry("row", "$row", 3), entry("note", "$row.note", 4)] }, part, "renewal");
    expect(lowered.issues).toEqual([]);
    expect(lowered.step.entries.map((one) => one.key)).toEqual(["inputs.item", "inputs.note"]);
  });

  it("refuses any other value on its line, and asks for it when it is left out", () => {
    const wrong = automationStudioFlowScriptCallStep({ ...step, entries: [entry("row", "$row.key", 3), entry("note", "x", 4)] }, part, "renewal");
    expect(wrong.issues.map((issue) => [issue.code, issue.path])).toEqual([["flow_script.invalid_binding", "flow.line.3"]]);
    const missing = automationStudioFlowScriptCallStep({ ...step, entries: [entry("note", "x", 4)] }, part, "renewal");
    expect(missing.issues.map((issue) => issue.code)).toEqual(["flow_script.call_input_missing"]);
  });
});
