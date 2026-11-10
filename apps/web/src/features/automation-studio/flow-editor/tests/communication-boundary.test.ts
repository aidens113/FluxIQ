import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const controllerSource = [
  "../hooks/useFlowEditorController.ts",
  "../hooks/useFlowEditorGraphDocument.ts",
  "../hooks/useFlowEditorSelection.ts",
  "../hooks/useFlowEditorCanvasInteractions.ts"
].map((path) => readFileSync(new URL(path, import.meta.url), "utf8")).join("\n");
const toolbarSource = readFileSync(new URL("../components/FlowGraphToolbar.tsx", import.meta.url), "utf8");
// The graph page under a Flow's Advanced section holds the canvas now, and its Save button is the only one.
const graphPageActionsSource = readFileSync(new URL("../../../../app/(panel)/flows/[flowId]/graph/host/GraphActions.tsx", import.meta.url), "utf8");
const graphPageSaveSource = readFileSync(new URL("../../../../app/(panel)/flows/[flowId]/graph/host/use-flow-graph.ts", import.meta.url), "utf8");
const dirtyGuardSource = readFileSync(new URL("../../workspace/DirtyViewGuard.tsx", import.meta.url), "utf8");
const typeSource = readFileSync(new URL("../flow-editor-types.ts", import.meta.url), "utf8");

describe("Flow editor communication boundary", () => {
  it("uses typed inputs and direct commands instead of global Automation Studio events", () => {
    expect(controllerSource).not.toContain("CustomEvent");
    expect(controllerSource).not.toContain("automation-studio:");
    expect(controllerSource).not.toContain("window.addEventListener");
    expect(typeSource).toContain("focusRequest?: AutomationGraphFocusRequest | null");
    expect(controllerSource).toContain("props.focusRequest?.problem");
  });

  it("routes keyboard and button saving through one project save, with nothing to authorize", () => {
    expect(controllerSource).toContain("const saveFlowGraph = useCallback(async (authorizationPin?: string) =>");
    expect(controllerSource).toContain("await props.onSaveGraph");
    expect(controllerSource).not.toContain('key === "s"');
    expect(graphPageSaveSource).not.toContain("window.prompt");
    // No PIN travels through the dirty-view channel any more: saving the
    // person's own unsaved work is the least gate-worthy action in the product,
    // and Core registers every endpoint a save reaches as `authoring`.
    expect(dirtyGuardSource).toContain("callbacks.current.save()");
    expect(dirtyGuardSource).not.toContain("Security PIN");
    expect(toolbarSource).not.toContain('aria-label="Save graph"');
    expect(graphPageActionsSource).toContain('saveActiveAutomationStudioGraph("")');
    expect(graphPageActionsSource).not.toMatch(/PIN/u);
    expect(graphPageSaveSource).not.toMatch(/PIN/u);
  });
});
