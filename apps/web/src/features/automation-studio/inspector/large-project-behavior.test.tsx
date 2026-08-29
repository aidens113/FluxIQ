import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createLargeAutomationStudioProjectFixture } from "../testing/large-project-fixture";
import { inspectorIdentity } from "./inspector-identity";
import { InspectorPanel } from "./InspectorPanel";
import { buildInspectorPanel } from "./panel-registry";
import { selectInspectorPanelContext } from "./scoped-selection";
import type { InspectorScopedSelectors } from "./types";

describe("Inspector large-project behavior", () => {
  it("renders an explicit empty selection", () => {
    const html = renderToStaticMarkup(createElement(InspectorPanel, {
      identity: null, model: null, selection: null, stateNodeId: "", onOpenState: () => undefined
    }));
    expect(html).toContain("No selection");
    expect(html).toContain("Select an object to inspect");
  });

  it("summarizes one selected entity without passing project collections to the panel", () => {
    const fixture = createLargeAutomationStudioProjectFixture();
    const flow = fixture.flows[0]!;
    const selection = { kind: "flow" as const, id: flow.flowId };
    const selectors: InspectorScopedSelectors = {
      selection: () => selection,
      policy: () => null,
      flow: () => flow,
      node: () => null,
      recording: () => null,
      entry: () => null,
      signal: () => null,
      timelineEntries: () => [],
      flowPublicationCount: () => fixture.flows.length,
      flowDependencies: () => ({
        dependencies: fixture.subflows.length,
        usedBy: fixture.recordings.length,
        availableUpgrades: fixture.adaptations.length
      }),
      referenceOptions: () => ({}),
      statePanel: () => null
    };
    const context = selectInspectorPanelContext(flow.flowId, selectors)!;
    const model = buildInspectorPanel(context);
    const identity = inspectorIdentity(selection, { flow });
    const html = renderToStaticMarkup(createElement(InspectorPanel, {
      identity, model, selection, stateNodeId: "", onOpenState: () => undefined
    }));
    expect(model.sections).toHaveLength(3);
    expect(html).toContain("2048");
    expect(html).not.toContain("flow.02047");
    expect(context).not.toHaveProperty("recordings");
  });
});