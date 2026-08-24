import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AutomationProjectTree, automationHierarchyNodeCanRemainPrimary, automationHierarchySettingsPrimaryNodeId } from "./ProjectTree";
import { automationHierarchyNodeCanDelete, automationHierarchyNodeIsGeneratedFlowStructure } from "./model";
import type { AutomationHierarchyNode } from "./model";

describe("AutomationProjectTree", () => {
  it("does not mark every Flow-owned child as selected when the Flow is selected", () => {
    const nodes: AutomationHierarchyNode[] = [
      { id: "flow-a", label: "Checkout", kind: "flow", category: "flow", parentId: null, viewId: "policy-primary", sourceId: "flow.checkout", flowId: "flow.checkout" },
      { id: "flow-a-router", label: "Router", kind: "flow-object", category: "flow", parentId: "flow-a", viewId: "flow-router", sourceId: "flow.checkout", flowId: "flow.checkout" },
      { id: "flow-a-instructions", label: "Instructions", kind: "flow-object", category: "flow", parentId: "flow-a", viewId: "flow-instructions", sourceId: "flow.checkout", flowId: "flow.checkout" },
      { id: "flow-a-runs", label: "Runs", kind: "folder", category: "flow", parentId: "flow-a", viewId: "runs-history", sourceId: "flow.checkout", flowId: "flow.checkout" }
    ];
    const html = renderToStaticMarkup(
      <AutomationProjectTree
        nodes={nodes}
        activeViewId="policy-primary"
        search=""
        typeFilter="all"
        selection={{ kind: "flow", id: "flow.checkout" }}
        recordingPrimaryKind={null}
        setRecordingPrimaryKind={vi.fn()}
        setSelection={vi.fn()}
        openView={vi.fn()}
        requestAction={vi.fn()}
      />
    );

    expect(html.match(/selected type-/g)?.length).toBe(1);
    expect(html).toContain("selected type-flow");
    expect(html).not.toContain("selected type-flow-object");
  });

  it("renders distinct icons for different Flow-owned object roles", () => {
    const nodes: AutomationHierarchyNode[] = [
      { id: "flow-a", label: "Checkout", kind: "flow", category: "flow", parentId: null, viewId: "policy-primary", sourceId: "flow.checkout", flowId: "flow.checkout" },
      { id: "flow-a-router", label: "Router", kind: "flow-object", category: "flow", parentId: "flow-a", viewId: "flow-router", sourceId: "flow.checkout", flowId: "flow.checkout" },
      { id: "flow-a-instructions", label: "Instructions", kind: "flow-object", category: "flow", parentId: "flow-a", viewId: "flow-instructions", sourceId: "flow.checkout", flowId: "flow.checkout" },
      { id: "flow-a-debug", label: "Runtime Debug", kind: "flow-object", category: "flow", parentId: "flow-a", viewId: "runtime-debug", sourceId: "flow.checkout", flowId: "flow.checkout" },
      { id: "flow-a-settings", label: "Settings", kind: "flow-object", category: "flow", parentId: "flow-a", viewId: "flow-settings", sourceId: "flow.checkout", flowId: "flow.checkout" },
      { id: "flow-a-recordings", label: "Recordings", kind: "folder", category: "flow", parentId: "flow-a", viewId: "timeline-recording", sourceId: "flow.checkout", flowId: "flow.checkout" },
      { id: "flow-a-runs", label: "Runs", kind: "folder", category: "flow", parentId: "flow-a", viewId: "runs-history", sourceId: "flow.checkout", flowId: "flow.checkout" }
    ];
    const html = renderToStaticMarkup(
      <AutomationProjectTree
        nodes={nodes}
        activeViewId="flow-settings"
        search=""
        typeFilter="all"
        selection={null}
        recordingPrimaryKind={null}
        setRecordingPrimaryKind={vi.fn()}
        setSelection={vi.fn()}
        openView={vi.fn()}
        requestAction={vi.fn()}
      />
    );

    expect(html).toContain("lucide-route");
    expect(html).toContain("lucide-list-checks");
    expect(html).toContain("lucide-bug");
    expect(html).toContain("lucide-settings");
    expect(html).toContain("lucide-radio");
    expect(html).toContain("lucide-history");
    expect(html).toContain("folder-row type-folder");
  });

  it("keeps a clicked Flow-owned object primary while its Flow is selected", () => {
    const router: AutomationHierarchyNode = { id: "flow-a-router", label: "Router", kind: "flow-object", category: "flow", parentId: "flow-a", viewId: "flow-router", sourceId: "flow.checkout", flowId: "flow.checkout" };
    const otherRouter: AutomationHierarchyNode = { id: "flow-b-router", label: "Router", kind: "flow-object", category: "flow", parentId: "flow-b", viewId: "flow-router", sourceId: "flow.billing", flowId: "flow.billing" };

    expect(automationHierarchyNodeCanRemainPrimary(router, { kind: "flow", id: "flow.checkout" })).toBe(true);
    expect(automationHierarchyNodeCanRemainPrimary(otherRouter, { kind: "flow", id: "flow.checkout" })).toBe(false);
  });

  it("marks only the active Flow object view as selected", () => {
    const nodes: AutomationHierarchyNode[] = [
      { id: "flow-a", label: "Checkout", kind: "flow", category: "flow", parentId: null, viewId: "policy-primary", sourceId: "flow.checkout", flowId: "flow.checkout" },
      { id: "flow-a-instructions", label: "Instructions", kind: "flow-object", category: "flow", parentId: "flow-a", viewId: "flow-instructions", sourceId: "flow.checkout", flowId: "flow.checkout" },
      { id: "flow-a-settings", label: "Settings", kind: "flow-object", category: "flow", parentId: "flow-a", viewId: "flow-settings", sourceId: "flow.checkout", flowId: "flow.checkout" }
    ];
    const html = renderToStaticMarkup(
      <AutomationProjectTree
        nodes={nodes}
        activeViewId="flow-settings"
        search=""
        typeFilter="all"
        selection={{ kind: "flow", id: "flow.checkout" }}
        recordingPrimaryKind={null}
        setRecordingPrimaryKind={vi.fn()}
        setSelection={vi.fn()}
        openView={vi.fn()}
        requestAction={vi.fn()}
      />
    );

    expect(html.match(/selected type-flow-object/g)?.length).toBe(1);
    expect(html).toContain("Settings</strong><small>flow-object</small></span></button>");
  });

  it("uses the Settings object as primary when the Flow gear opens settings", () => {
    const flow: AutomationHierarchyNode = { id: "flow-a", label: "Checkout", kind: "flow", category: "flow", parentId: null, viewId: "policy-primary", sourceId: "flow.checkout", flowId: "flow.checkout" };
    const settings: AutomationHierarchyNode = { id: "flow-a-settings", label: "Settings", kind: "flow-object", category: "flow", parentId: "flow-a", viewId: "flow-settings", sourceId: "flow.checkout", flowId: "flow.checkout" };

    expect(automationHierarchySettingsPrimaryNodeId(flow, [flow, settings])).toBe("flow-a-settings");
  });

  it("allows deleting Flow category object rows without deleting generated Flow structure", () => {
    const nodes: AutomationHierarchyNode[] = [
      { id: "flow-a", label: "Checkout", kind: "flow", category: "flow", parentId: null, viewId: "policy-primary", sourceId: "flow.checkout", flowId: "flow.checkout" },
      { id: "flow-a-settings", label: "Settings", kind: "flow-object", category: "flow", parentId: "flow-a", viewId: "flow-settings", sourceId: "flow.checkout", flowId: "flow.checkout" },
      { id: "flow-a-subflows", label: "Subflows", kind: "folder", category: "flow", parentId: "flow-a", viewId: "policy-primary", sourceId: "flow.checkout", flowId: "flow.checkout" },
      { id: "flow-a-subflows-primary", label: "primary", kind: "subflow", category: "flow", parentId: "flow-a-subflows", viewId: "policy-primary", sourceId: "subflow.primary", flowId: "flow.checkout" },
      { id: "flow-a-adaptations", label: "Adaptations", kind: "folder", category: "flow", parentId: "flow-a", viewId: "adaptations", sourceId: "flow.checkout", flowId: "flow.checkout" },
      { id: "flow-a-adaptations-route", label: "route", kind: "adaptation", category: "flow", parentId: "flow-a-adaptations", viewId: "adaptations", sourceId: "proposal.route", flowId: "flow.checkout" },
      { id: "flow-a-runs", label: "Runs", kind: "folder", category: "flow", parentId: "flow-a", viewId: "runs-history", sourceId: "flow.checkout", flowId: "flow.checkout" },
      { id: "flow-a-runs-one", label: "1", kind: "run", category: "flow", parentId: "flow-a-runs", viewId: "runs-history", sourceId: "run.1", flowId: "flow.checkout" }
    ];
    const html = renderToStaticMarkup(
      <AutomationProjectTree
        nodes={nodes}
        activeViewId="policy-primary"
        search=""
        typeFilter="all"
        selection={{ kind: "flow", id: "flow.checkout" }}
        recordingPrimaryKind={null}
        setRecordingPrimaryKind={vi.fn()}
        setSelection={vi.fn()}
        openView={vi.fn()}
        requestAction={vi.fn()}
      />
    );

    expect(automationHierarchyNodeIsGeneratedFlowStructure(nodes[1]!)).toBe(true);
    expect(automationHierarchyNodeIsGeneratedFlowStructure(nodes[2]!)).toBe(true);
    expect(automationHierarchyNodeCanDelete(nodes[1]!)).toBe(false);
    expect(automationHierarchyNodeCanDelete(nodes[2]!)).toBe(false);
    expect(automationHierarchyNodeCanDelete(nodes[3]!)).toBe(true);
    expect(automationHierarchyNodeCanDelete(nodes[5]!)).toBe(true);
    expect(automationHierarchyNodeCanDelete(nodes[7]!)).toBe(true);
    expect(html).not.toContain("aria-label=\"Delete Settings\"");
    expect(html).not.toContain("aria-label=\"Delete Subflows\"");
    expect(html).not.toContain("aria-label=\"Delete Adaptations\"");
    expect(html).toContain("aria-label=\"Delete primary\"");
    expect(html).toContain("aria-label=\"Delete route\"");
    expect(html).toContain("aria-label=\"Delete 1\"");
  });
});
