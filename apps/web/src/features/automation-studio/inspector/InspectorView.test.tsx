import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { InspectorView } from "./InspectorView";
import {
  createInspectorModel,
  openInspectorState,
  updateInspectorEditorSelection
} from "./canonical-model";
import { inspectorPanelKinds } from "./panel-registry";
import type { InspectorPanelContext } from "./types";

function context(
  selection: InspectorPanelContext["selection"],
  overrides: Partial<InspectorPanelContext> = {}
): InspectorPanelContext {
  return {
    selection,
    policy: null,
    flow: null,
    node: null,
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

describe("canonical Automation Inspector", () => {
  it("renders the explicit empty-selection state without commands firing", () => {
    const openState = vi.fn();
    const updateSelection = vi.fn();
    const html = renderToStaticMarkup(createElement(InspectorView, {
      context: null,
      onOpenState: openState,
      onUpdateEditorNodeSelection: updateSelection
    }));
    expect(html).toContain("No selection");
    expect(html).toContain("Select an object to inspect");
    expect(openState).not.toHaveBeenCalled();
    expect(updateSelection).not.toHaveBeenCalled();
  });

  it("builds a Flow identity, breadcrumb, and complete Flow panel", () => {
    const scoped = context(
      { kind: "flow", id: "flow.checkout" },
      {
        flow: {
          flowId: "flow.checkout",
          name: "Checkout",
          interface: { inputs: [], outputs: [] }
        },
        flowPublicationCount: 2,
        flowDependencies: { dependencies: 1, usedBy: 3, availableUpgrades: 4 }
      }
    );
    const model = createInspectorModel(scoped);
    expect(model.identity).toMatchObject({
      title: "Flow",
      label: "Checkout",
      breadcrumb: ["Checkout"]
    });
    expect(model.panel?.sections).toHaveLength(3);
    expect(model.panel?.sections[2]?.rows).toContainEqual(["Used by", "3"]);
  });

  it("preserves editor-node description and parameter updates", () => {
    const selection = {
      kind: "editor-node" as const,
      id: "node.charge",
      node: {
        label: "Charge",
        nodeType: "action",
        family: "action",
        description: "Charge the account",
        inputs: [],
        outputs: [],
        parameters: [],
        parameterValues: { amount: 10 }
      }
    };
    const update = vi.fn();
    updateInspectorEditorSelection(selection, update, { customDescription: "Charge once" });
    updateInspectorEditorSelection(selection, update, { parameterValues: { amount: 25 } });
    expect(update).toHaveBeenNthCalledWith(1, {
      ...selection,
      node: { ...selection.node, customDescription: "Charge once" }
    });
    expect(update).toHaveBeenNthCalledWith(2, {
      ...selection,
      node: { ...selection.node, parameterValues: { amount: 25 } }
    });
    const html = renderToStaticMarkup(createElement(InspectorView, {
      context: context(selection, { node: { id: selection.id, ...selection.node } }),
      onOpenState: vi.fn(),
      onUpdateEditorNodeSelection: update
    }));
    expect(html).toContain("Node description");
    expect(html).toContain("Charge the account");
  });

  it("builds a typed State command retaining scoped coordinates", () => {
    const scoped = context({
      kind: "state",
      id: "state:node.charge",
      nodeId: "node.charge",
      sourceId: "observed:recording.1:event.2",
      phase: "actual_output",
      evidenceId: "evidence.3",
      factPath: "web.checkout.total",
      recordingId: "recording.1",
      timelineEntryId: "event.2",
      stateSnapshotId: "snapshot.4"
    });
    const model = createInspectorModel(scoped);
    expect(model.stateOpenRequest).toEqual({
      nodeId: "node.charge",
      sourceId: "observed:recording.1:event.2",
      phase: "actual_output",
      evidenceId: "evidence.3",
      factPath: "web.checkout.total",
      recordingId: "recording.1",
      timelineEntryId: "event.2",
      stateSnapshotId: "snapshot.4"
    });
    const command = vi.fn();
    openInspectorState(model, command);
    expect(command).toHaveBeenCalledOnce();
    expect(command).toHaveBeenCalledWith(model.stateOpenRequest);
  });

  it("returns a stable narrow model and keeps every registered panel kind", () => {
    const scoped = context({ kind: "workspace", id: "clients" });
    const first = createInspectorModel(scoped);
    expect(createInspectorModel(scoped)).toBe(first);
    expect(createInspectorModel(null)).toBe(createInspectorModel(null));
    expect(Object.keys(first).sort()).toEqual([
      "editorSelection",
      "identity",
      "panel",
      "selection",
      "stateNodeId",
      "stateOpenRequest"
    ]);
    expect(first).not.toHaveProperty("recordings");
    expect(first).not.toHaveProperty("runtimeSessions");
    expect(first).not.toHaveProperty("api");
    expect(inspectorPanelKinds).toEqual([
      "workspace", "flow", "policy", "node",
      "editor-node", "editor-mode", "recording", "timeline", "signal", "state"
    ]);
  });
});