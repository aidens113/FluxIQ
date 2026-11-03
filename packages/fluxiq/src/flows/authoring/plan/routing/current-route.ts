export type AutomationStudioFlowBootstrapCurrentRoute = {
  /** The block the route runs, by the label a script writes. */
  subflow: string;
  /** Its condition, written the way a `when:` line writes one. */
  when: string;
};
