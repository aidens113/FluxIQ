/** Client-authored example tails. Core retains the grammar and section order. */
export type AutomationStudioFlowScriptExamples = {
  readonly version: string;
  readonly format?: readonly string[];
  readonly act?: readonly string[];
  readonly loop?: readonly string[];
  readonly state?: readonly string[];
};
