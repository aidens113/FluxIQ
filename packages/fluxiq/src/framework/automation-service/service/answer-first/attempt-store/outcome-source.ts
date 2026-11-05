import type { AutomationStudioAnswerFirstAttemptStore } from "./store.ts";

/**
 * What a person's read of attempts needs: where an attempt or a thread is (`locator`), and a Flow's
 * rows. A person's rows come through `../interrupted/attempts-read.ts`, so a Core that died cannot
 * leave a row reading `working` for ever; this takes them as a port so the store does not import it.
 */
export type AutomationStudioAnswerFirstOutcomeSource = Pick<AutomationStudioAnswerFirstAttemptStore, "locator" | "list">;
