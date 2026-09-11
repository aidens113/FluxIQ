// Numeric bounds for Flow Bootstrap. The canonical limits bound a full
// bootstrap call; the evidence limits bound the smaller evidence-guided
// completion. Both are read by the schemas, the parser, and the validator.

export const AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS = {
  maxSubflows: 8,
  maxNodesPerSubflow: 64,
  maxEdgesPerSubflow: 128,
  maxTotalNodes: 64,
  maxTotalEdges: 128,
  maxGraphDepth: 16,
  maxPlanBytes: 65_536,
  maxCatalogEntries: 100,
  maxCatalogBytes: 49_152,
  firstLiveMaxInputTokens: 4_000,
  bootstrapInstructionTokens: 384,
  maxStringLength: 2_000,
  horizontalSpacing: 320,
  verticalSpacing: 180
} as const;

export const AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_LIMITS = {
  maxResultBytes: 12_000,
  maxSummaryLength: 240,
  maxNameLength: 120,
  maxSubflows: 4,
  maxRules: 8,
  maxRouteTags: 8,
  maxNodesPerSubflow: 16,
  maxEdgesPerSubflow: 24,
  maxParametersPerNode: 16
} as const;
