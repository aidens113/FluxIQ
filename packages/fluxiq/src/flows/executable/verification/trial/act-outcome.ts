/** What one act of the trial did: the step, the repeat pass and readable row it acted on, whether it changed something, found its target already in the asked state, or showed no change; the witness it shows at and the parts it serves. */

export type TrialActOutcome = {
  step: number;
  pass?: { number: number; of: number };
  row?: string;
  outcome: "changed" | "already_in_state" | "no_change_seen";
  witness?: string;
  parts: string[];
};
