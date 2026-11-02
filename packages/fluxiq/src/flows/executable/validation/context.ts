export type ExecutableFlowValidationContext = {
  /** The enclosing graph role, supplied by its authoring composition. */
  subflowRole?: string;
  externalCheckpointIds?: readonly string[];
};
