/** The flat target fields a canonical registered definition allows an arrival to refresh. */
export type AutomationStudioTargetRefresh = {
  /** `output` selects the policy wrapper's parameters record; `node` selects the node's parameters. */
  container: "node" | "output";
  definitionId: string;
  /** The canonical target definition's own version, not the policy wrapper's version. */
  definitionVersion: string;
  parameterIds: readonly string[];
  /** The allowed fields whose canonical descriptors are not required. */
  removableParameterIds: readonly string[];
};
