import type { AutomationStudioActionConsequence } from "../../../../components/automation/action-effect/consequences/index.ts";

/**
 * What the read answered for one act: the classes it asks for, `[]` for an act
 * that asks for nothing lasting, or `null` when the read gave it no answer.
 */
export type AutomationStudioInstructedActRead = { act: string; quote: string; consequences: AutomationStudioActionConsequence[] | null };
