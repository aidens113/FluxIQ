import { describe, expect, it, vi } from "vitest";
import { buildInspectorPanel } from "./panel-registry";
import { selectInspectorPanelContext } from "./scoped-selection";
import type { InspectorScopedSelectors } from "./types";

describe("Inspector scoped selection", () => {
  it("resolves one selection ID into a bounded panel context", () => {
    const selection = { kind: "flow" as const, id: "flow.1" };
    const selectors: InspectorScopedSelectors = {
      selection: vi.fn(() => selection),
      policy: vi.fn(() => null),
      flow: vi.fn(() => ({ flowId: "flow.1", name: "Checkout", interface: { inputs: [], outputs: [] } })),
      node: vi.fn(() => null),
      recording: vi.fn(() => null),
      entry: vi.fn(() => null),
      signal: vi.fn(() => null),
      timelineEntries: vi.fn(() => []),
      flowPublicationCount: vi.fn(() => 3),
      flowDependencies: vi.fn(() => ({ dependencies: 2, usedBy: 4, availableUpgrades: 1 })),
      referenceOptions: vi.fn(() => ({})),
      statePanel: vi.fn(() => null)
    };

    const context = selectInspectorPanelContext("flow.1", selectors);
    expect(selectors.selection).toHaveBeenCalledWith("flow.1");
    expect(selectors.flow).toHaveBeenCalledTimes(1);
    expect(selectors.node).not.toHaveBeenCalled();
    expect(selectors.recording).not.toHaveBeenCalled();
    expect(selectors.statePanel).not.toHaveBeenCalled();
    expect(context).not.toHaveProperty("recordings");
    expect(context).not.toHaveProperty("runtimeSessions");
    expect(context).not.toHaveProperty("signals");

    const model = buildInspectorPanel(context!);
    expect(model.sections[2]?.rows).toContainEqual(["Published versions", "3"]);
    expect(model.sections[2]?.rows).toContainEqual(["Used by", "4"]);
  });

  it("does no entity work without a current selection ID", () => {
    const selection = vi.fn();
    const selectors = { selection } as unknown as InspectorScopedSelectors;
    expect(selectInspectorPanelContext(null, selectors)).toBeNull();
    expect(selection).not.toHaveBeenCalled();
  });
});