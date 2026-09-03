import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const controllerSource = [
  "./useFlowEditorController.ts",
  "./useFlowEditorGraphDocument.ts",
  "./useFlowEditorSelection.ts",
  "./useFlowEditorCanvasInteractions.ts"
].map((path) => readFileSync(new URL(path, import.meta.url), "utf8")).join("\n");
const toolbarSource = readFileSync(new URL("./FlowGraphToolbar.tsx", import.meta.url), "utf8");
const globalToolbarSource = readFileSync(new URL("../workspace/shell/WorkspaceHeader.tsx", import.meta.url), "utf8");
const graphRuntimeSource = readFileSync(new URL("../live/useAutomationGraphRuntime.ts", import.meta.url), "utf8");
const dirtyGuardSource = readFileSync(new URL("../workspace/DirtyViewGuard.tsx", import.meta.url), "utf8");
const typeSource = readFileSync(new URL("./flow-editor-types.ts", import.meta.url), "utf8");

describe("Flow editor communication boundary", () => {
  it("uses typed inputs and direct commands instead of global Automation Studio events", () => {
    expect(controllerSource).not.toContain("CustomEvent");
    expect(controllerSource).not.toContain("automation-studio:");
    expect(controllerSource).not.toContain("window.addEventListener");
    expect(typeSource).toContain("focusRequest?: AutomationGraphFocusRequest | null");
    expect(controllerSource).toContain("props.focusRequest?.problem");
  });

  it("routes keyboard and button saving through one project modal", () => {
    expect(controllerSource).toContain("const saveFlowGraph = useCallback(async (authorizationPin?: string) =>");
    expect(controllerSource).toContain("await props.onSaveGraph");
    expect(controllerSource).not.toContain('key === "s"');
    expect(graphRuntimeSource).not.toContain("window.prompt");
    expect(dirtyGuardSource).toContain("callbacks.current.save(authorizationPin)");
    expect(toolbarSource).not.toContain('aria-label="Save graph"');
    expect(globalToolbarSource).toContain('aria-label="Save entire project"');
    expect(globalToolbarSource).toContain("saveDirtyAutomationViews(savePin)");
  });
});
