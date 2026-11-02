/** Core's closed mechanical findings over a trial's change. */

export type TrialChangeFinding =
  | { code: "result.change_not_seen"; part: string }
  | { code: "result.unasked_change"; witness: string; where?: string }
  | { code: "result.change_contradicted"; part: string; witness: string };
