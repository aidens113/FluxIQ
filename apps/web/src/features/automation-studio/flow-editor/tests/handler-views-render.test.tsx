// The Flow editor's canvas, rendered on the graphs Core assembles from its
// state-aware worked examples: the Handlers area with each Handler's card, the
// hook port on the step a Handler covers, the entry and checkpoint markers,
// and the default start on the main path rather than on a Handler.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FlowGraphCanvas } from "../components";
import type { FlowEditorProps } from "../flow-editor-types";
import { useFlowEditorController } from "../hooks";
import { WORKED_EXAMPLE, workedExampleGraph } from "../../graph/handlers/tests/worked-example-graphs";

// React Flow's viewport portal mounts into the live canvas's DOM, which a
// static render has none of; drawn in place here, the area's markup is checked.
vi.mock("@xyflow/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@xyflow/react")>()),
  ViewportPortal: (input: { children: unknown }) => input.children
}));

function props(taskGraph: any): FlowEditorProps {
  return {
    activeRef: { current: true },
    editable: true,
    entries: [],
    policy: null,
    taskGraph,
    taskGraphDraft: null,
    nativeNodeDefinitions: [],
    recordings: [],
    selectedNode: null,
    selectedTimeline: null,
    signals: [],
    onSaveGraph: vi.fn(),
    onGraphDraftChange: vi.fn(),
    onDirtyChange: vi.fn(),
    onOpenValidation: vi.fn(),
    onOpenNodeState: vi.fn(),
    onRestoreDraft: vi.fn(),
    onDiscardDraft: vi.fn(),
    onReloadGraph: vi.fn(),
    setSelection: vi.fn()
  };
}

function Canvas(input: { props: FlowEditorProps }) {
  const controller = useFlowEditorController(input.props);
  return createElement(FlowGraphCanvas, { controller, props: input.props });
}

function render(example: string, role = "primary"): string {
  const graph = workedExampleGraph(example, role);
  return renderToStaticMarkup(createElement("div", { style: { width: 1600, height: 1000 } }, createElement(Canvas, { props: props({ ...graph.flow, name: graph.name }) })));
}

const text = (html: string) => html.replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ");

describe("the canvas's handler views on the worked examples", () => {
  it("draws a handler that returns to a checkpoint in the Handlers area, with its hook port and the checkpoint", () => {
    const html = render(WORKED_EXAMPLE.checkpoint);
    const words = text(html);
    expect(html).toContain('aria-label="Handlers"');
    expect(words).toContain("1 handler.");
    expect(html).toContain("automation-handler-node");
    expect(words).toContain("Before trying again");
    expect(words).toContain("Go back to “search”");
    expect(html).toContain('aria-label="Before trying again: open handler Handler"');
    expect(words).toContain("Checkpoint");
    expect(words).toContain("Handler step");
    expect(html.match(/node-badge start/gu)?.length).toBe(1);
  });

  it("draws the second known way as a failure handler that uses other results", () => {
    const words = text(render(WORKED_EXAMPLE.alternative));
    expect(words).toContain("When a step fails");
    expect(words).toContain("Use other results");
  });

  it("marks the alternative start and draws no Handlers area without a Handler", () => {
    const html = render(WORKED_EXAMPLE.entry);
    expect(text(html)).toContain("Alternative start");
    expect(html).toContain("Starts here when");
    expect(html).not.toContain('aria-label="Handlers"');
  });

  it("draws the recovery part's handler as one for the whole automation", () => {
    const words = text(render(WORKED_EXAMPLE.interruption, "recovery"));
    expect(words).toContain("Whole automation");
    expect(words).toContain("the “Session expiring” dialog is showing");
    expect(words).toContain("Carry on");
  });
});
