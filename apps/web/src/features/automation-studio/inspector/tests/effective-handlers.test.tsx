// The Inspector's "Effective handlers" for a selected step, on the graphs Core
// assembles from its state-aware worked examples: every handler that applies,
// in the order the run would try them, each linking to its handler.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import { subscribeAutomationGraphNodeFocus, type AutomationGraphNodeFocusRequest } from "../../graph/node-focus";
import { WORKED_EXAMPLE, workedExampleGraph, workedExampleNodeId } from "../../graph/handlers/tests/worked-example-graphs";
import { InspectorView } from "../InspectorView";
import { inspectorEffectiveHandlers } from "../effective-handlers";
import type { InspectorPanelContext } from "../types";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function editorContext(flow: any, nodeId: string, overrides: Partial<InspectorPanelContext> = {}): InspectorPanelContext {
  return {
    selection: { kind: "editor-node", id: nodeId, flowId: flow.flowId, node: { label: "Book", nodeType: "policy", family: "ready", description: "", inputs: [], outputs: [], parameters: [], parameterValues: {} } },
    policy: null,
    flow,
    node: { id: nodeId, label: "Book", inputs: [], outputs: [] },
    recording: null,
    entry: null,
    signal: null,
    timelineEntries: [],
    flowPublicationCount: 0,
    flowDependencies: { dependencies: 0, usedBy: 0, availableUpgrades: 0 },
    referenceOptions: {},
    statePanel: null,
    ...overrides
  };
}

describe("the Inspector's effective handlers", () => {
  it("lists the failure handler of the second known way on the step it covers, and says what it could not load", () => {
    const saved = workedExampleGraph(WORKED_EXAMPLE.alternative);
    expect(inspectorEffectiveHandlers(saved.flow, workedExampleNodeId(saved, "s2"))).toEqual({
      handlers: [{
        key: `${saved.flow.flowId}/${workedExampleNodeId(saved, "h1-s1")}`,
        eventWords: "When a step fails",
        name: "Handler",
        levelWords: "This step",
        conditionWords: "Always",
        open: { flowId: saved.flow.flowId, nodeId: workedExampleNodeId(saved, "h1-s1") }
      }],
      note: "Lists the handlers stored in this part. Handlers inherited from parts that call it, and the whole automation's handlers in its recovery part, are not loaded here."
    });
  });

  it("includes the whole automation's handlers when the recovery part is handed to it", () => {
    const main = workedExampleGraph(WORKED_EXAMPLE.interruption);
    const recovery = workedExampleGraph(WORKED_EXAMPLE.interruption, "recovery");
    const listed = inspectorEffectiveHandlers(main.flow, workedExampleNodeId(main, "s5"), { role: "primary", automation: [{ flow: { ...recovery.flow, name: "Recovery" }, role: "recovery" }] })!;
    expect(listed.note).toBeUndefined();
    expect(listed.handlers.map((handler) => [handler.eventWords, handler.levelWords, handler.conditionWords, handler.open.flowId])).toEqual([
      ["Before a step", "Whole automation", "the “Session expiring” dialog is showing", recovery.flow.flowId]
    ]);
  });

  it("says no handler runs inside a handler, and lists nothing for a step of another graph", () => {
    const saved = workedExampleGraph(WORKED_EXAMPLE.checkpoint);
    expect(inspectorEffectiveHandlers(saved.flow, workedExampleNodeId(saved, "h1-s2"), {})).toEqual({ handlers: [], note: "Handlers do not run inside a handler or its steps." });
    expect(inspectorEffectiveHandlers(saved.flow, "node.elsewhere")).toBeNull();
    expect(inspectorEffectiveHandlers(null, "node.elsewhere")).toBeNull();
  });

  it("renders the section for a selected step, and its link asks the editor to open the handler", () => {
    const saved = workedExampleGraph(WORKED_EXAMPLE.checkpoint);
    const context = editorContext(saved.flow, workedExampleNodeId(saved, "s3"));
    const html = renderToStaticMarkup(createElement(InspectorView, { context, onOpenState: () => undefined, onUpdateEditorNodeSelection: () => undefined }));
    expect(html).toContain("Effective handlers");
    expect(html).toContain("Before trying again");
    expect(html).toContain("This step");

    const requests: AutomationGraphNodeFocusRequest[] = [];
    const unsubscribe = subscribeAutomationGraphNodeFocus((request) => requests.push(request));
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(createElement(InspectorView, { context, onOpenState: () => undefined, onUpdateEditorNodeSelection: () => undefined }));
    });
    const link = renderer.root.find((node) => node.type === "button" && node.props.className === "automation-effective-handler-link");
    act(() => link.props.onClick());
    unsubscribe();
    expect(requests).toEqual([{ flowId: saved.flow.flowId, nodeId: workedExampleNodeId(saved, "h1-s1") }]);
  });
});
