import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { AutomationSelection } from "../shared/selection-contracts";
import { inspectorIdentity } from "./inspector-identity";
import { buildInspectorPanel } from "./panel-registry";
import type { InspectorPanelContext } from "./types";

function panelContext(selection: AutomationSelection): InspectorPanelContext {
  return {
    selection,
    policy: selection.kind === "policy" ? { policyId: selection.id, nodes: [], edges: [] } : null,
    flow: null,
    node: null,
    recording: null,
    entry: null,
    signal: null,
    timelineEntries: [],
    flowPublicationCount: 0,
    flowDependencies: { dependencies: 0, usedBy: 0, availableUpgrades: 0 },
    referenceOptions: {},
    statePanel: null
  };
}

describe("Automation Studio product vocabulary", () => {
  it("presents adaptation metadata and graph selections using Flow language", () => {
    const graph = { kind: "policy" as const, id: "persisted.graph.1" };
    expect(inspectorIdentity(graph, {})).toMatchObject({ title: "Flow Graph" });
    expect(buildInspectorPanel(panelContext(graph)).sections[0]?.title).toBe("Flow Graph");

    const editorSelection: AutomationSelection = {
      kind: "editor-node",
      id: "node.1",
      node: {
        label: "Open checkout",
        nodeType: "generated",
        family: "adaptation",
        description: "Open checkout",
        inputs: [],
        outputs: [],
        parameters: [],
        parameterValues: {},
        metadata: {
          proposalStep: {
            label: "Open checkout",
            description: "Open checkout",
            confidence: "high",
            occurrenceCount: 1
          }
        }
      }
    };
    const context = { ...panelContext(editorSelection), node: { id: editorSelection.id, ...editorSelection.node } };
    expect(buildInspectorPanel(context).sections.some((section) => section.title === "Adaptation Change")).toBe(true);
  });
  it("keeps retired names out of current UI and project-title sources", () => {
    const sources = [
      "./inspector-identity.ts",
      "./panel-registry.tsx",
      "../model/project-view-model.ts",
      "../workspace/components/view-metadata.ts"
    ].map((relative) => readFileSync(new URL(relative, import.meta.url), "utf8"));
    const retiredUi = /Legacy Proposal|Proposal Generator|proposal-workbench|Policy Graph|Proposal Step/i;

    for (const source of sources) expect(source).not.toMatch(retiredUi);
    expect(sources[2]).toContain("automationStudioViewDefinition");
  });
});
