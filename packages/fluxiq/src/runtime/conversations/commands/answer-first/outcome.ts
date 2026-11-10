// The leaf file, not the barrel: the completion barrel reaches back into the chat (an import cycle).
import { AUTOMATION_STUDIO_ANSWER_FIRST_ON_RECORD_WORDS } from "../../../../framework/automation-service/service/answer-first/completion/on-record.ts";
import type { AutomationStudioConversationAnswered, AutomationStudioConversationSetupNeeded } from "../build.ts";
import type { AutomationStudioConversationCommandOutcome } from "../command.ts";
import type { AutomationStudioConversationCommandProgress } from "../progress.ts";

/**
 * What a command comes to once an attempt has answered: a step a person must do first, in Core's
 * words, or one plain line of how the attempt stands. The answer itself, its rows, acts and label,
 * is the answer turn's, read back by route, so the line only says how it stands and that it is kept.
 */
export function automationStudioConversationAttemptOutcome(progress: AutomationStudioConversationCommandProgress, answered: AutomationStudioConversationAnswered | AutomationStudioConversationSetupNeeded): AutomationStudioConversationCommandOutcome {
  if (answered.status === "setup_needed") return progress.succeeded(answered.say);
  const outcome = progress.succeeded(answered.threadNotNoted ? `${said(answered)} ${NOT_TIED}` : said(answered));
  outcome.answered = { attempt: answered.attempt };
  if (answered.result) outcome.answered.result = answered.result;
  if (answered.candidateId !== undefined) outcome.answered.candidateId = answered.candidateId;
  return outcome;
}

/** Said when the attempt ran with no note of the thread that asked: its answer turn may never come, so the one line says where the result is. */
const NOT_TIED = "I could not tie this to this chat, so the result may not show here. It is kept with the Flow.";

/** Said for a replay accepted on its own record (task speed S9): it ran exactly as the run the person accepted, and nothing checked it again. */
const ON_RECORD = "I ran the saved Flow, and it went exactly as the run you accepted, so no check was needed.";

function said(answered: AutomationStudioConversationAnswered): string {
  switch (answered.attempt.status) {
    case "achieved": return answered.result?.checkedWhat === AUTOMATION_STUDIO_ANSWER_FIRST_ON_RECORD_WORDS ? ON_RECORD : "I got what you asked for, and it was checked once against what you asked.";
    case "budget_out": return "The budget for this ran out before I could confirm it. What I found so far is kept.";
    case "stopped_by_person": return "Stopped, as you asked. What I found so far is kept.";
    case "waiting_for_person": return "This needs you before it can go on. What I found so far is kept.";
    case "working": return "This is still going. What I found so far is kept.";
  }
}
