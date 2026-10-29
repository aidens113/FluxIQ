import { describe, expect, it } from "vitest";
import { automationStudioFlowScriptWire } from "../index.ts";

describe("automationStudioFlowScriptWire", () => {
  it("wires nothing for a block with no steps", () => {
    expect(automationStudioFlowScriptWire({
      steps: [], nodes: [], definitionByKey: new Map(), keyByLabel: new Map(), stepLabels: new Map(), blockIndex: 0, issues: [], keyPrefix: ""
    })).toEqual([]);
  });
});
