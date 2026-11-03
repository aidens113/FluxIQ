/**
 * A done proposal carried across an amendment that only gave its subflow more
 * parts, or added or renamed its outputs (header): the brief, revision and
 * digest that name it, the parts it was not built for, and each output renamed.
 */
export type AutomationStudioProjectCarriedProposal = {
  briefId: string;
  revision: number;
  digest: string;
  addedParts: string[];
  renamedOutputs: Array<{ from: string; to: string }>;
  /** Each output the amendment removed that the carried script still binds (t671); absent when none. */
  removedOutputs?: string[];
  /** The subflow the proposal was built for, when the amendment merged it into this one under another key (t671). */
  builtFor?: string;
  /** Set when the proposal was built for a callable subflow and this one is the subflow the router runs (t671). */
  routerRun?: true;
};
