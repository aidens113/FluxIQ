import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AutomationProjectTree, automationHierarchyNodeCanRemainPrimary, automationHierarchyPrimaryNodeId, automationHierarchyRouterPrimaryNodeId, automationHierarchySettingsPrimaryNodeId } from "./ProjectTree";
import { automationHierarchyNodeCanCreateChildFolder, automationHierarchyNodeCanDelete, automationHierarchyNodeIsGeneratedFlowStructure } from "./model";
import type { AutomationHierarchyNode } from "./model";
import { automationHierarchyPageKey } from "./paged-cache";

describe("AutomationProjectTree", () => {
  it("isolates the hierarchy from unrelated parent view renders", () => {
    const source = readFileSync(fileURLToPath(new URL("./ProjectTree.tsx", import.meta.url)), "utf8");

    expect(source).toContain("export const AutomationProjectTree = memo(function AutomationProjectTree");
  });
  it("does not require timer advancement to dispatch sidebar preview opens", () => {
    const source = readFileSync(fileURLToPath(new URL("./ProjectTree.tsx", import.meta.url)), "utf8");

    expect(source).not.toContain("setTimeout");
    expect(source).not.toContain("clearTimeout");
    expect(source).not.toContain("singleClickTimer");
    expect(source).toContain('props.openNode(props.node, "preview")');
    expect(source).toContain('props.openNode(props.node, "new-window")');
  });
  it("keeps sidebar row selection animated with immediate press feedback", () => {
    const css = readFileSync(new URL("../../../app/globals.css", import.meta.url), "utf8");

    expect(css).toContain(".automation-project-tree button {");
    expect(css).toContain("transition: background-color var(--motion-fast)");
    expect(css).toContain(".automation-project-tree button:active");
  });
  it("does not force a synchronous sidebar render before navigation work starts", () => {
    const source = readFileSync(fileURLToPath(new URL("./ProjectTree.tsx", import.meta.url)), "utf8");
    const openStart = source.indexOf("const openFromTree =");
    const openEnd = source.indexOf("const openSettingsFromTree", openStart);
    const openSource = source.slice(openStart, openEnd);

    expect(source).not.toContain("import { flushSync } from \"react-dom\"");
    expect(source).not.toContain("flushSync(");
    expect(source).not.toContain("onPointerDown={(event) => {\n          if (event.button === 0 && !isFolder)");
    expect(openSource).toContain("const targetNode = previewPrimaryNode(node);");
    expect(openSource).toContain("primaryTreeExpectedSignatureRef.current = targetSelection ? automationHierarchySelectionSignature(targetSelection, targetViewId) : null");
    expect(openSource.indexOf("primaryTreeExpectedSignatureRef.current")).toBeLessThan(openSource.indexOf("if (targetSelection && !automationHierarchySelectionSame"));
    expect(openSource.indexOf("if (targetSelection && !automationHierarchySelectionSame")).toBeLessThan(openSource.indexOf("props.openView(targetViewId, mode)"));
  });

  it("keeps cached hydration and local tree emission strictly one-way", () => {
    const source = readFileSync(fileURLToPath(new URL("./ProjectTree.tsx", import.meta.url)), "utf8");
    const hydrateStart = source.indexOf("const nextState = incomingUiStateRef.current;");
    const emitStart = source.indexOf("const nextState = { collapsedFolderIds", hydrateStart);
    const syncEnd = source.indexOf("const activeSubflowContainerIds", emitStart);
    const hydrateSource = source.slice(hydrateStart, emitStart);
    const emitSource = source.slice(emitStart, syncEnd);

    expect(hydrateSource).toContain("appliedUiStateSignatureRef.current = uiStateSignature");
    expect(hydrateSource).toContain("}, [uiStateSignature]);");
    expect(hydrateSource).not.toContain("props.uiState, uiStateSignature");
    expect(hydrateSource).not.toContain("uiStateSignature, localTreeStateSignature");
    expect(emitSource).toContain("appliedUiStateSignatureRef.current = nextSignature");
    expect(emitSource).toContain("props.onUiStateChange?.(nextState)");
    expect(emitSource).not.toContain("props.onUiStateChange, uiStateSignature");
    expect(source).toContain("function sameStringList(left: string[], right: string[]): boolean");
  });

  it("does not publish an unchanged Flow owner selection for view-only sidebar navigation", () => {
    const source = readFileSync(fileURLToPath(new URL("./ProjectTree.tsx", import.meta.url)), "utf8");
    const openStart = source.indexOf("const openFromTree =");
    const openEnd = source.indexOf("const openSettingsFromTree", openStart);
    const openSource = source.slice(openStart, openEnd);

    expect(source).toContain("function automationHierarchySelectionSame");
    expect(openSource).toContain("!automationHierarchySelectionSame(props.selection, targetSelection)");
    expect(openSource).not.toContain("if (targetSelection) props.setSelection(targetSelection)");
  });

  it("previews sidebar primary selection before dispatching navigation", () => {
    const source = readFileSync(fileURLToPath(new URL("./ProjectTree.tsx", import.meta.url)), "utf8");
    const previewStart = source.indexOf("const previewPrimaryNode =");
    const openStart = source.indexOf("const openFromTree =");

    expect(previewStart).toBeGreaterThan(-1);
    expect(openStart).toBeGreaterThan(previewStart);
    expect(source.indexOf("const targetNode = previewPrimaryNode(node);", openStart)).toBeGreaterThan(openStart);
    expect(source).toContain("primaryTreeSelectionOriginRef");
    expect(source).toContain("automationHierarchySelectionSignature");
  });

  it("delegates known subflow graph shells to the single subflow opener", () => {
    const source = readFileSync(fileURLToPath(new URL("./ProjectTree.tsx", import.meta.url)), "utf8");
    const subflowBranchStart = source.indexOf('if (node.kind === "subflow" && props.openSubflow)');
    const subflowBranchEnd = source.indexOf('if (node.kind === "recording"', subflowBranchStart);
    const subflowBranch = source.slice(subflowBranchStart, subflowBranchEnd);

    expect(source).toContain('typeof node.metadata?.graphFlowId === "string"');
    expect(source).toContain("function automationHierarchySelectionForOpenNode");
    expect(source).toContain('if (node.kind === "subflow" && typeof node.metadata?.graphFlowId === "string") return { kind: "flow", id: node.metadata.graphFlowId };');
    expect(subflowBranch).toContain("props.openSubflow(node, mode)");
    expect(subflowBranch).toContain("return;");
    expect(subflowBranch).not.toContain("props.openView");
  });

  it("does not mark every Flow-owned child as selected when the Flow is selected", () => {
    const nodes: AutomationHierarchyNode[] = [
      { id: "flow-a", label: "Checkout", kind: "flow", category: "flow", parentId: null, viewId: "policy-primary", sourceId: "flow.checkout", flowId: "flow.checkout" },
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

  it("keeps subflow object containers collapsed by default", () => {
    const nodes: AutomationHierarchyNode[] = [
      { id: "flow-a", label: "Checkout", kind: "flow", category: "flow", parentId: null, viewId: "policy-primary", sourceId: "flow.checkout", flowId: "flow.checkout", metadata: { hierarchyContainer: true } },
      { id: "flow-a-subflows", label: "Subflows", kind: "folder", category: "flow", parentId: "flow-a", viewId: "flow-subflows", sourceId: "flow.checkout", flowId: "flow.checkout", metadata: { flowStructure: "subflows" } },
      { id: "flow-a-subflow-primary", label: "Primary checkout", kind: "subflow", category: "flow", parentId: "flow-a-subflows", viewId: "policy-primary", sourceId: "subflow.primary", flowId: "flow.checkout", metadata: { graphFlowId: "flow.checkout.primary.graph", hierarchyContainer: true, defaultCollapsed: true } },
      { id: "flow-a-subflow-primary-settings", label: "Subflow Settings Child", kind: "flow-object", category: "flow", parentId: "flow-a-subflow-primary", viewId: "flow-settings", sourceId: "flow.checkout.primary.graph", flowId: "flow.checkout.primary.graph" }
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

    expect(html).toContain("Primary checkout");
    expect(html).toContain('aria-label="Expand Primary checkout"');
    expect(html).not.toContain("Subflow Settings Child");
  });
  it("renders distinct icons for different Flow-owned object roles", () => {
    const nodes: AutomationHierarchyNode[] = [
      { id: "flow-a", label: "Checkout", kind: "flow", category: "flow", parentId: null, viewId: "policy-primary", sourceId: "flow.checkout", flowId: "flow.checkout" },
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
    expect(html).toContain("lucide-list-checks");
    expect(html).toContain("lucide-bug");
    expect(html).toContain("lucide-settings");
    expect(html).toContain("lucide-radio");
    expect(html).toContain("lucide-history");
    expect(html).toContain("folder-row type-folder");
  });

  it("visually selects Nodes while its subflow graph is open in the normal Flow editor", () => {
    const nodes: AutomationHierarchyNode[] = [
      { id: "flow-a", label: "Checkout", kind: "flow", category: "flow", parentId: null, viewId: "policy-primary", sourceId: "flow.checkout", flowId: "flow.checkout" },
      { id: "flow-a-subflows", label: "Subflows", kind: "folder", category: "flow", parentId: "flow-a", viewId: "flow-subflows", sourceId: "flow.checkout", flowId: "flow.checkout", metadata: { flowStructure: "subflows" } },
      { id: "flow-a-subflow-primary", label: "Primary", kind: "subflow", category: "flow", parentId: "flow-a-subflows", viewId: "policy-primary", sourceId: "subflow.primary", flowId: "flow.checkout", metadata: { graphFlowId: "flow.checkout.subflow.primary.graph", hierarchyContainer: true, defaultCollapsed: true } },
      { id: "flow-a-subflow-primary-nodes", label: "Nodes", kind: "flow-object", category: "flow", parentId: "flow-a-subflow-primary", viewId: "policy-primary", sourceId: "flow.checkout.subflow.primary.graph", flowId: "flow.checkout.subflow.primary.graph", metadata: { flowStructure: "subflow-nodes" } }
    ];
    const selection = { kind: "flow" as const, id: "flow.checkout.subflow.primary.graph" };
    const html = renderToStaticMarkup(
      <AutomationProjectTree
        nodes={nodes}
        activeViewId="policy-primary"
        search=""
        typeFilter="all"
        selection={selection}
        recordingPrimaryKind={null}
        setRecordingPrimaryKind={vi.fn()}
        setSelection={vi.fn()}
        openView={vi.fn()}
        requestAction={vi.fn()}
      />
    );

    expect(html.match(/selected type-/g)?.length).toBe(1);
    expect(html).toContain("selected type-flow-object");
    expect(html).toContain("Nodes</strong><small>flow-object</small>");
    expect(html).not.toContain("selected type-subflow");
    expect(automationHierarchyNodeCanRemainPrimary(nodes[3]!, selection)).toBe(true);
  });
  it("routes subflow clicks through one navigation path", () => {
    const source = readFileSync(fileURLToPath(new URL("./ProjectTree.tsx", import.meta.url)), "utf8");
    const subflowBranchStart = source.indexOf('if (node.kind === "subflow" && props.openSubflow)');
    const subflowBranchEnd = source.indexOf('if (node.kind === "recording"', subflowBranchStart);
    const subflowBranch = source.slice(subflowBranchStart, subflowBranchEnd);

    expect(subflowBranchStart).toBeGreaterThan(-1);
    expect(subflowBranch).toContain("props.openSubflow(node, mode)");
    expect(subflowBranch).not.toContain('if (node.kind === "subflow" && typeof node.metadata?.graphFlowId');
    expect(subflowBranch).not.toContain("props.openView(targetViewId, mode)");
  });
  it("keeps a clicked Flow-owned object primary while its Flow is selected", () => {
    const debug: AutomationHierarchyNode = { id: "flow-a-debug", label: "Runtime Debug", kind: "flow-object", category: "flow", parentId: "flow-a", viewId: "runtime-debug", sourceId: "flow.checkout", flowId: "flow.checkout" };
    const otherDebug: AutomationHierarchyNode = { id: "flow-b-debug", label: "Runtime Debug", kind: "flow-object", category: "flow", parentId: "flow-b", viewId: "runtime-debug", sourceId: "flow.billing", flowId: "flow.billing" };

    expect(automationHierarchyNodeCanRemainPrimary(debug, { kind: "flow", id: "flow.checkout" })).toBe(true);
    expect(automationHierarchyNodeCanRemainPrimary(otherDebug, { kind: "flow", id: "flow.checkout" })).toBe(false);
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

  it("visually selects Router instead of the Flow row when Router is the active Flow view", () => {
    const nodes: AutomationHierarchyNode[] = [
      { id: "flow-a", label: "Checkout", kind: "flow", category: "flow", parentId: null, viewId: "policy-primary", sourceId: "flow.checkout", flowId: "flow.checkout" },
      { id: "flow-a-router", label: "Router", kind: "flow-object", category: "flow", parentId: "flow-a", viewId: "flow-router", sourceId: "flow.checkout", flowId: "flow.checkout" },
      { id: "flow-a-settings", label: "Settings", kind: "flow-object", category: "flow", parentId: "flow-a", viewId: "flow-settings", sourceId: "flow.checkout", flowId: "flow.checkout" }
    ];
    const html = renderToStaticMarkup(
      <AutomationProjectTree
        nodes={nodes}
        activeViewId="flow-router"
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
    expect(html).toContain("Router</strong><small>flow-object</small></span></button>");
    expect(html).toContain("selected type-flow-object");
    expect(html).not.toContain("selected type-flow\"");
    expect(html).not.toContain("correlated type-flow");
  });
  it("uses the Router object as primary when the Flow row is clicked", () => {
    const flow: AutomationHierarchyNode = { id: "flow-a", label: "Checkout", kind: "flow", category: "flow", parentId: null, viewId: "policy-primary", sourceId: "flow.checkout", flowId: "flow.checkout" };
    const router: AutomationHierarchyNode = { id: "flow-a-router", label: "Router", kind: "flow-object", category: "flow", parentId: "flow-a", viewId: "flow-router", sourceId: "flow.checkout", flowId: "flow.checkout" };

    expect(automationHierarchyRouterPrimaryNodeId(flow, [flow, router])).toBe("flow-a-router");
    expect(automationHierarchyRouterPrimaryNodeId(router, [flow, router])).toBe("flow-a-router");
  });
  it("uses the Nodes object as primary when a subflow container is clicked", () => {
    const subflow: AutomationHierarchyNode = { id: "subflow-a", label: "Checkout", kind: "subflow", category: "flow", parentId: "flow-a-subflows", viewId: "policy-primary", sourceId: "subflow.checkout", flowId: "flow.checkout", metadata: { graphFlowId: "flow.checkout.subflow.checkout.graph", hierarchyContainer: true, defaultCollapsed: true } };
    const nodes: AutomationHierarchyNode = { id: "subflow-a-nodes", label: "Nodes", kind: "flow-object", category: "flow", parentId: "subflow-a", viewId: "policy-primary", sourceId: "flow.checkout.subflow.checkout.graph", flowId: "flow.checkout.subflow.checkout.graph", metadata: { flowStructure: "subflow-nodes" } };

    expect(automationHierarchyPrimaryNodeId(subflow, [subflow, nodes])).toBe("subflow-a-nodes");
    expect(automationHierarchyPrimaryNodeId(nodes, [subflow, nodes])).toBe("subflow-a-nodes");
  });
  it("uses the Settings object as primary when the Flow gear opens settings", () => {
    const flow: AutomationHierarchyNode = { id: "flow-a", label: "Checkout", kind: "flow", category: "flow", parentId: null, viewId: "policy-primary", sourceId: "flow.checkout", flowId: "flow.checkout" };
    const settings: AutomationHierarchyNode = { id: "flow-a-settings", label: "Settings", kind: "flow-object", category: "flow", parentId: "flow-a", viewId: "flow-settings", sourceId: "flow.checkout", flowId: "flow.checkout" };

    expect(automationHierarchySettingsPrimaryNodeId(flow, [flow, settings])).toBe("flow-a-settings");
  });


  it("shows add buttons on the generated Subflows folder and nested subflow categories", () => {
    const nodes: AutomationHierarchyNode[] = [
      { id: "flow-a", label: "Checkout", kind: "flow", category: "flow", parentId: null, viewId: "policy-primary", sourceId: "flow.checkout", flowId: "flow.checkout" },
      { id: "flow-a-subflows", label: "Subflows", kind: "folder", category: "flow", parentId: "flow-a", viewId: "policy-primary", sourceId: "flow.checkout", flowId: "flow.checkout", metadata: { flowStructure: "subflows" } },
      { id: "flow-a-subflows-checkout", label: "Checkout Steps", kind: "folder", category: "flow", parentId: "flow-a-subflows", viewId: "policy-primary", sourceId: "subflow-category.checkout", flowId: "flow.checkout", metadata: { flowStructure: "subflow-category" } },
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

    expect(automationHierarchyNodeCanCreateChildFolder(nodes[1]!)).toBe(true);
    expect(automationHierarchyNodeCanCreateChildFolder(nodes[2]!)).toBe(true);
    expect(automationHierarchyNodeCanCreateChildFolder(nodes[3]!)).toBe(false);
    expect(html).toContain('aria-label="Subflows actions"');
    expect(html).toContain('aria-label="Checkout Steps actions"');
    expect(html).not.toContain('aria-label="Runs actions"');
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
    expect(html).not.toContain("aria-label=\"Settings actions\"");
    expect(html).not.toContain("aria-label=\"Subflows actions\"");
    expect(html).not.toContain("aria-label=\"Adaptations actions\"");
    expect(html).toContain("aria-label=\"primary actions\"");
    expect(html).toContain("title=\"primary\"");
    expect(html).toContain("aria-label=\"route actions\"");
    expect(html).toContain("aria-label=\"1 actions\"");
  });
  it("exposes a semantic, levelled tree with one roving tab stop", () => {
    const nodes: AutomationHierarchyNode[] = [
      { id: "flow-a", label: "Checkout", kind: "flow", category: "flow", parentId: null, viewId: "policy-primary", sourceId: "flow.checkout", flowId: "flow.checkout" },
      { id: "flow-a-router", label: "Router", kind: "flow-object", category: "flow", parentId: "flow-a", viewId: "flow-router", sourceId: "flow.checkout", flowId: "flow.checkout" }
    ];
    const html = renderToStaticMarkup(
      <AutomationProjectTree
        nodes={nodes}
        activeViewId="flow-router"
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

    expect(html).toContain('role="tree"');
    expect(html.match(/role="treeitem"/g)?.length).toBe(3);
    expect(html.match(/role="group"/g)?.length).toBe(2);
    expect(html.match(/tabindex="0"/g)?.length).toBe(1);
    expect(html).toContain('aria-level="1"');
    expect(html).toContain('aria-level="2"');
    expect(html).toContain('aria-level="3"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('data-tree-parent-id="flow-a"');
  });

  it("progressively pages large unfiltered sibling sets but never hides search matches", () => {
    const nodes: AutomationHierarchyNode[] = [
      ...Array.from({ length: 124 }, (_, index): AutomationHierarchyNode => ({
        id: "flow-" + index,
        label: "Flow " + String(index).padStart(3, "0"),
        kind: "flow",
        category: "flow",
        parentId: null,
        viewId: "policy-primary",
        sourceId: "flow." + index,
        flowId: "flow." + index
      })),
      { id: "flow-final", label: "ZZZ final target", kind: "flow", category: "flow", parentId: null, viewId: "policy-primary", sourceId: "flow.final", flowId: "flow.final" }
    ];
    const render = (search: string) => renderToStaticMarkup(
      <AutomationProjectTree
        nodes={nodes}
        activeViewId="policy-primary"
        search={search}
        typeFilter="all"
        selection={null}
        recordingPrimaryKind={null}
        setRecordingPrimaryKind={vi.fn()}
        setSelection={vi.fn()}
        openView={vi.fn()}
        requestAction={vi.fn()}
      />
    );

    const unfiltered = render("");
    expect(unfiltered.match(/role="treeitem"/g)?.length).toBe(101);
    expect(unfiltered).toContain("Show 25 more");
    expect(unfiltered).not.toContain("ZZZ final target");

    const searched = render("ZZZ final");
    expect(searched).toContain("ZZZ final target");
    expect(searched).not.toContain("Show ");
  });

  it("renders left-sidebar folder pagination from parent-owned SQL page state", () => {
    const nodes: AutomationHierarchyNode[] = Array.from({ length: 2 }, (_, index) => ({
      id: "flow-" + index,
      label: "Flow " + index,
      kind: "flow",
      category: "flow",
      parentId: null,
      viewId: "flow-router",
      sourceId: "flow." + index,
      flowId: "flow." + index
    }));

    const html = renderToStaticMarkup(
      <AutomationProjectTree
        nodes={nodes}
        activeViewId="flow-router"
        childPageInfo={{ [automationHierarchyPageKey(null)]: { hasMore: true, loadedCount: 2, nextCursor: "cursor.2" } }}
        search=""
        typeFilter="all"
        selection={{ kind: "flow", id: "flow.1" }}
        recordingPrimaryKind={null}
        setRecordingPrimaryKind={vi.fn()}
        setSelection={vi.fn()}
        openView={vi.fn()}
        requestAction={vi.fn()}
      />
    );

    expect(html).toContain("Load more");
    expect(html).not.toContain("Show 100 more");
  });

  it("keeps selection, keyboard semantics, and deep-linked objects stable on later loaded pages", () => {
    const nodes: AutomationHierarchyNode[] = [
      { id: "flow-a", label: "Checkout", kind: "flow", category: "flow", parentId: null, viewId: "policy-primary", sourceId: "flow.checkout", flowId: "flow.checkout" },
      { id: "flow-a-router", label: "Router", kind: "flow-object", category: "flow", parentId: "flow-a", viewId: "flow-router", sourceId: "flow.checkout", flowId: "flow.checkout" },
      { id: "flow-a-settings", label: "Settings", kind: "flow-object", category: "flow", parentId: "flow-a", viewId: "flow-settings", sourceId: "flow.checkout", flowId: "flow.checkout" }
    ];
    const html = renderToStaticMarkup(
      <AutomationProjectTree
        nodes={nodes}
        activeViewId="flow-settings"
        childPageInfo={{ [automationHierarchyPageKey("flow-a")]: { hasMore: true, loadedCount: 2, nextCursor: "cursor.settings" } }}
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
    expect(html).toContain("Settings</strong><small>flow-object</small>");
    expect(html).toContain('aria-level="3"');
    expect(html).toContain('data-tree-parent-id="flow-a"');
    expect(html).toContain("Load more");
  });
});
