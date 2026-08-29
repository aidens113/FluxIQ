import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const controllerSource = [
  "./useFlowEditorController.ts",
  "./useFlowEditorGraphDocument.ts",
  "./useFlowEditorSelection.ts",
  "./useFlowEditorCanvasInteractions.ts"
].map((path) => readFileSync(new URL(path, import.meta.url), "utf8")).join("\n");
const toolbarSource = readFileSync(new URL("./FlowGraphToolbar.tsx", import.meta.url), "utf8");
const typeSource = readFileSync(new URL("./flow-editor-types.ts", import.meta.url), "utf8");

describe("Flow editor communication boundary", () => {
  it("uses typed inputs and direct commands instead of global Automation Studio events", () => {
    expect(controllerSource).not.toContain("CustomEvent");
    expect(controllerSource).not.toContain("automation-studio:");
    expect(controllerSource).not.toContain("window.addEventListener");
    expect(typeSource).toContain("focusRequest?: AutomationGraphFocusRequest | null");
    expect(controllerSource).toContain("props.focusRequest?.problem");
  });

  it("owns save invocation in the active editor", () => {
    expect(controllerSource).toContain("const saveFlowGraph = useCallback(async () =>");
    expect(controllerSource).toContain("await props.onSaveGraph");
    expect(controllerSource).toContain('key === "s"');
    expect(toolbarSource).toContain('aria-label="Save graph"');
    expect(toolbarSource).toContain("void saveFlowGraph()");
  });
});
