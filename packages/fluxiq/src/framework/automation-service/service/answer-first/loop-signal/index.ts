// The attempt's side of loop detection (t859): its answer to the last two rungs, the question the
// last one asks the person and the steer it gives the next round (R7), the ladder for a completion refused again, what it counts, what goes on its row, and what a fresh round is told.
export { automationStudioAnswerFirstCompletionRefusedAgain, type AutomationStudioAnswerFirstRefusedAgainRung } from "./completion-refused-again.ts";
export { automationStudioAnswerFirstAddLoopsCaught, automationStudioAnswerFirstLoopPattern } from "./loops-caught.ts";
export { automationStudioAnswerFirstLoopSignal } from "./signal.ts";
export { automationStudioAnswerFirstStuckQuestion, type AutomationStudioAnswerFirstStuck, type AutomationStudioAnswerFirstStuckHeld } from "./stuck-question.ts";
export { automationStudioAnswerFirstStuckSteer } from "./stuck-steer.ts";
export { automationStudioAnswerFirstTriedAsContract } from "./tried-as-contract.ts";
export { automationStudioAnswerFirstToldTried } from "./told-fresh-round.ts";
