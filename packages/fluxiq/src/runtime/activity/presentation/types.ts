/** Presentation is optional and scoped to the run that installed it. */
export type RuntimeActivityPresentation = { invoke(operation: string, args: readonly unknown[]): unknown };

export type AutomationStudioRecoveryNext = "on_fail" | "goes_on" | "repair" | "stop";
