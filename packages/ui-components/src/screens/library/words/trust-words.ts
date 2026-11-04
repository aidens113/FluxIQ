import type { SubflowCard } from "../types.ts";

const STATE = { unproven: "Not proven yet", provisional: "Worked once", established: "Works reliably" } as const;

/** Where a subflow stands, in words: "Works reliably". */
export function trustWords(card: SubflowCard): string {
  return STATE[card.trust.tier];
}
