import type { AutomationStudioInstructedConsequence } from "./consequence.ts";
import type { AutomationStudioInstructedActRead } from "./act-read.ts";

/**
 * The read as a build holds it: the grounded entries, with each act's own
 * answer beside them as `acts`. A plain list of entries -- one stored with a
 * Flow, or given by an older caller -- has no `acts`, and its acts are judged
 * by their quotes alone.
 */
export type AutomationStudioInstructedRead = readonly AutomationStudioInstructedConsequence[] & { readonly acts?: readonly AutomationStudioInstructedActRead[] };
