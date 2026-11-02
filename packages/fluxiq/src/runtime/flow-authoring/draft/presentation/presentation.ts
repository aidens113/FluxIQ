import type { DraftEntryInstructionFacts } from "./entry-facts.ts";
import type { DraftExcusedFacts } from "./excused-facts.ts";
import type { DraftPredecessorFacts } from "./predecessor-facts.ts";
import type { DraftWithdrawalFacts } from "./withdrawal-facts.ts";
export interface DraftPresentation {
    entryInstruction(input: DraftEntryInstructionFacts): string;
    fullRunRequired(input: {
        nothingRan: boolean;
    }): string;
    dryRunInstruction(): string;
    excused(input: DraftExcusedFacts): string;
    missingPredecessors(input: DraftPredecessorFacts): string;
    withdrawal(input: DraftWithdrawalFacts): string;
}
