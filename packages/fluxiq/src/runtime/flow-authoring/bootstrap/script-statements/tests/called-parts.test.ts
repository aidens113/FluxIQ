// A part's interface as `../called-parts.ts` reads it (t741 B1): every input
// and output name is asked of the one port-name rule (`../part-port-name.ts`),
// so `item`, a loop's row, is refused on either side, at its line.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowScriptBlock } from "../../authoring/index.ts";
import { automationStudioFlowScriptCalledParts } from "../index.ts";

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
