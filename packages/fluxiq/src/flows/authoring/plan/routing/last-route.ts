export type AutomationStudioFlowBootstrapLastRoute = {
  /** Which block the run under review ran, or that it ran none. */
  took: string;
  fallbackUsed: boolean;
  /** Each route the router checked, in order, and the reason it gave. */
  checked: Array<{ subflow: string; held: boolean; why: string }>;
};
