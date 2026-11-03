/** Already screened authored paths, never arguments or resolved values. */
export type AutomationStudioRerunArgumentMetadata = {
  step: number;
  paths: readonly (readonly string[])[];
  /** Paths are relative to a node's parameters, not its outer call envelope. */
  parameters: boolean;
};
