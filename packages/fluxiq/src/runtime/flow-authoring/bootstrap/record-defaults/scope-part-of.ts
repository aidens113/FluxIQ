// Which plan part a step serves, for a build that works within one scope (K5).
//
// A subflow brief carries the task-spec parts its subflow covers. A step of that
// subflow serves one of them only when exactly one of the parts owes records:
// two parts owing records leave a record-writing step unattributable, and a part
// that owes none (an act) has no columns to derive a record output from. In
// either case there is no resolver, which is today's behaviour. The model's own
// writing is never overridden (authoring only fills what the step left out).

import type { AuthoringPartAnswer, AuthoringPartOfStep } from "./answer.ts";

/** A task-spec part as the scope-part resolver reads it: the id, the person's words, and the records answer it owes. */
export type AuthoringScopePart = {
  id: string;
  /** The person's own words for the part (its quote); the label of the list. */
  words?: string | undefined;
  /** The columns of the records the part hands back, in order. Absent or empty, the part owes no records. */
  columns?: readonly string[] | undefined;
  rowIdentity?: readonly string[] | undefined;
};

/** The resolver for a scope's parts, or `undefined` when no single part owes records. */
export function authoringScopePartOf(parts: readonly AuthoringScopePart[]): AuthoringPartOfStep | undefined {
  const owing = parts.filter((part) => (part.columns?.length ?? 0) > 0);
  if (owing.length !== 1) return undefined;
  const only = owing[0]!;
  const words = only.words?.replace(/\s+/gu, " ").trim();
  const answer: AuthoringPartAnswer = {
    id: only.id,
    ...(words ? { label: words } : {}),
    columns: [...only.columns!],
    ...(only.rowIdentity?.length ? { rowIdentity: [...only.rowIdentity] } : {})
  };
  return () => answer;
}
