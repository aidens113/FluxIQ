/** The workspace in which a canonical Flow is authored and may execute. */
export type AutomationStudioFlowScope =
  | { kind: "global" }
  | { kind: "domain"; domainId: string };
