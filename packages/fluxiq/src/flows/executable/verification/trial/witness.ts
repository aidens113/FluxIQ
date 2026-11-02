/** Where a part's or a step's change shows: a list group, matched across every scope it was read in, or one control place. `steps` are the trial steps attributed to it (`[]` for a list watched only to stay unchanged). */

export type TrialWitness = (
  | { id: string; kind: "list"; group: string }
  | { id: string; kind: "control"; place: string }
) & { where?: string; steps: number[]; parts: string[] };
