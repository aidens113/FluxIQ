/** Retains source identity when a legacy task or routine is later adapted/migrated. */
export type AutomationStudioFlowLegacyProvenance = {
  kind: "task" | "routine";
  artifactId: string;
  flowId?: string;
};
