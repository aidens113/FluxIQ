// What a person reads when a press does not start anything: plain words, no codes.

import type { AutomationStudioAnswerFirstCarryOnRefusedCode } from "./answer.ts";

export const AUTOMATION_STUDIO_ANSWER_FIRST_CARRY_ON_REFUSED_WORDS: Readonly<Record<AutomationStudioAnswerFirstCarryOnRefusedCode, string>> = {
  unknown_attempt: "I cannot find that attempt, so there is nothing to carry on.",
  live: "That attempt is still going.",
  achieved: "That attempt already reached its result, so there is nothing to carry on. Ask again if you want it done again.",
  waiting_for_person: "That attempt is waiting for something only you can do, and more budget will not clear it.",
  no_budget_added: "That attempt ran out of budget, so carrying it on needs some budget added.",
  later_attempt: "A later attempt at this task has already started, so this one cannot be carried on.",
  acts_unreadable: "I could not read what that attempt already did on the site, so I will not carry it on and risk doing something twice.",
  unreadable: "I could not read that attempt just now, so nothing was started."
};
