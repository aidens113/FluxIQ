export type ExecutableAdaptationPatchGates = {
  /** Cannot be applied durably without a linked, reviewed change proposal. */
  requiresProposal: boolean;
  /** Forces proposal mode rather than automatic application under `mixed`. */
  major: boolean;
  /** Requires manual review before durable promotion. */
  structural: boolean;
};
