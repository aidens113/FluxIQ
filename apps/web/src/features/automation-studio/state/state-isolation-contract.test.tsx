import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildNodeStateViewModel, type BuildNodeStateViewModelInput, type StateStructuredRow } from "./model";
import { StateStructuredPanel } from "./StateStructuredPanel";
import { stateAutomationSelection } from "./state-view-selection";

function emptyStateInput(): BuildNodeStateViewModelInput {
  return {
    selection: { kind: "state", id: "state:node.one", nodeId: "node.one", phase: "input" },
    selectedNode: { id: "node.one" },
    selectedRecording: null,
    selectedTimeline: null,
    policy: null,
    taskGraph: null,
    pipelineArtifacts: null,
    recordings: [],
    timelines: [],
    runtimeSessions: [],
    signals: []
  };
}

describe("State Explorer isolation contracts", () => {
  it("derives State selection independently of workspace and root context", () => {
    const input = emptyStateInput();
    const model = buildNodeStateViewModel(input);
    const externalContext = {
      ...input,
      workspace: { activeViewId: "view.unrelated" },
      root: { renderVersion: 99 }
    } as BuildNodeStateViewModelInput;

    expect(stateAutomationSelection(model, externalContext, { phase: "actual_output", factPath: "app.ready" }))
      .toEqual(stateAutomationSelection(model, input, { phase: "actual_output", factPath: "app.ready" }));
  });

  it("bounds a 10,000-fact structured view to one 100-row page", () => {
    const rows: StateStructuredRow[] = Array.from({ length: 10_000 }, (_, index) => ({
      id: `fact.${index}`,
      namespace: "app",
      path: `items.${index}`,
      label: `Fact ${index}`,
      value: String(index)
    }));

    const html = renderToStaticMarkup(<StateStructuredPanel rows={rows} onSelectFact={() => undefined} />);

    expect((html.match(/<tr/g) ?? []).length).toBe(101);
    expect(html).toContain("1-100 of 10000");
    expect(html).toContain("Fact 99");
    expect(html).not.toContain("Fact 100<");
  });
});