export type AutomationStudioFlowBootstrapRoutePath = {
  /** `inputs.<id>` or `state.<...>`, exactly as a condition writes it. */
  path: string;
  /** What the value is, in the words of whoever declared it. */
  description?: string;
  /** For a declared input. */
  type?: string;
  required?: true;
};
