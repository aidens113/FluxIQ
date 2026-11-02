/** One witness's delta from before to after. `unread` when either side carried no reading of it. List subjects and control state tokens stay opaque here; the packet reduces them to counts. A changed control is `returned` where every state it changed ended at the build's recorded start for its place (`./delta.ts`, t787). */

export type TrialDelta =
  | { witness: string; kind: "list" | "control"; status: "unread" }
  | { witness: string; kind: "list"; status: "changed" | "unchanged"; added: string[]; removed: string[]; changed: string[]; unchanged: string[] }
  | { witness: string; kind: "control"; status: "changed" | "unchanged"; before: Record<string, number>; after: Record<string, number>; returned?: true };
