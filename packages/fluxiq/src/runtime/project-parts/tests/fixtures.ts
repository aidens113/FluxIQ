// Test support for the parts library: a saved part's graph as a build writes it,
// with strings in every field a page can reach (a label, a target's text, a node
// description) so a test can prove none of them reaches a card.
import type { JsonObject } from "../../../core/index.ts";
import { createBlankAutomationStudioFlowArtifact, type AutomationStudioFlowArtifact, type AutomationStudioFlowSubflow } from "../../../flows/authoring/model/index.ts";
import type { AutomationStudioFlowNode } from "../../../flows/executable/graph/index.ts";

/** Distinctive strings standing for what a page said. None may reach a card, a facet or a full-text row. */
export const PAGE_TEXT = Object.freeze({
  label: "PAGEWORD-label-Add-Crimson-Sneakers",
  description: "PAGEWORD-description-Limited-Drop",
  controlText: "PAGEWORD-control-Search-the-Catalogue",
  buttonText: "PAGEWORD-button-Go-Fetch",
  readText: "PAGEWORD-read-Price-Was-129"
});

export type PartFixtureOptions = {
  graphFlowId?: string;
  /** The text the part types, as a literal. */
  typed?: string | null;
  /** The control's id, which two copies of a part share and two parts do not. */
  searchBoxId?: string;
  consequences?: readonly string[] | null;
  /** Renames every node, edge and label without changing a step. */
  renamed?: boolean;
  firstStep?: "navigate" | "type";
  metadata?: JsonObject;
  inputName?: string;
};

export function partGraphFixture(options: PartFixtureOptions = {}): AutomationStudioFlowArtifact {
  const tag = options.renamed ? "z" : "a";
  const consequences = options.consequences === undefined ? [] : options.consequences;
  const declared = (extra: JsonObject = {}): JsonObject => ({ ...(consequences === null ? {} : { declaredConsequences: [...consequences] }), ...extra });
  const typed: JsonObject = options.typed === null ? { text: { $state: { path: "query" } } } : { text: options.typed ?? "red shoes" };
  const nodes: AutomationStudioFlowNode[] = [
    ...(options.firstStep === "type" ? [] : [{
      id: `${tag}.nav`,
      definitionId: "web.output.browser-navigate",
      label: options.renamed ? "Renamed step one" : PAGE_TEXT.label,
      parameterValues: { url: "https://shop.example/catalogue/search?q=secret-path-and-query" },
      metadata: declared()
    }]),
    {
      id: `${tag}.type`,
      definitionId: "web.output.dom-type",
      label: options.renamed ? "Renamed step two" : PAGE_TEXT.label,
      description: PAGE_TEXT.description,
      parameterValues: { target: { kind: "element", fingerprint: { visibleText: PAGE_TEXT.controlText, id: options.searchBoxId ?? "search-box", tagName: "input" } }, ...typed },
      metadata: declared()
    },
    {
      id: `${tag}.click`,
      definitionId: "web.output.dom-click",
      label: options.renamed ? "Renamed step three" : PAGE_TEXT.buttonText,
      parameterValues: { target: { kind: "element", fingerprint: { visibleText: PAGE_TEXT.buttonText, id: "go", tagName: "button" } } },
      metadata: declared({ lastRead: PAGE_TEXT.readText })
    }
  ];
  const edges = nodes.slice(1).map((node, index) => ({ id: `${tag}.edge.${index}`, sourceNodeId: nodes[index]!.id, targetNodeId: node.id, sourcePortId: "success", targetPortId: "in" }));
  const base = createBlankAutomationStudioFlowArtifact({
    flowId: options.graphFlowId ?? `flow.${tag}.graph`,
    projectId: "project.parts",
    name: "Graph",
    description: "Instruction-built graph for Search.",
    origin: "manual",
    now: 1_000,
    ...(options.metadata ? { metadata: options.metadata } : {})
  });
  return {
    ...base,
    interface: {
      inputs: [{ id: "query", name: options.inputName ?? "Search words", valueType: { kind: "string" }, required: true }],
      outputs: [{ id: "results", name: "Results found", valueType: { kind: "unknown" } }]
    },
    nodes,
    edges
  };
}

export function partSubflowFixture(input: { subflowId?: string; flowId?: string; name?: string; role?: AutomationStudioFlowSubflow["role"]; key?: string; description?: string } = {}): AutomationStudioFlowSubflow {
  return {
    schemaVersion: "0.1",
    subflowId: input.subflowId ?? "subflow.search",
    flowId: input.flowId ?? "flow.main",
    projectId: "project.parts",
    name: input.name ?? "Search the shop",
    ...(input.description !== undefined ? { description: input.description } : {}),
    role: input.role ?? "utility",
    status: "active",
    graphFlowId: "flow.a.graph",
    createdAt: 1_000,
    updatedAt: 1_000,
    metadata: { bootstrapSymbolicKey: input.key ?? "search" }
  };
}
