

/**
 * One act of the instruction as the read is asked about it: its id (`a1`,
 * `a2` ...), the person's own words for it, and, for an act split from a clause
 * with several counted objects, that clause and this act's object as the
 * person wrote them (`../flow-bootstrap/instructed-acts/contracts.ts`).
 */
export type AutomationStudioInstructedActText = { id: string; quote: string; source?: { clause: string; object: string } | undefined };
