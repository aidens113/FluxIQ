// What a person can answer, said in Core's words rather than the component's.
//
// Borrowed from the adaptation review, which is the nearest thing the panel
// already has to "the model proposes, the person approves": the copy for each
// action is data, `destructive` is a flag in that data rather than a judgement
// the component makes, and an answer that is the person's authority for an act
// is re-authorized before it is sent. What is deliberately not borrowed is where
// the review put the buttons -- on the fifth tab of a detail pane. An answer
// lives in the turn that asked for it.

import { AUTOMATION_STUDIO_ACTION_CONSEQUENCE_PHRASES, AUTOMATION_STUDIO_DESTRUCTIVE_ACTION_CONSEQUENCES } from "fluxiq/automation/action-permissions";
import type { AutomationStudioActionConsequence, ConversationAnswer, ConversationAsk } from "./contracts";

export type ConversationAnswerAction = {
  actionId: string;
  label: string;
  description: string | null;
  variant: "primary" | "secondary" | "danger";
  /** Core checks the person's PIN on this answer, so it is asked for before it is sent. */
  destructive: boolean;
  answer: ConversationAnswer;
};

export type ConversationAskPresentation = {
  title: string;
  /** Lead line above the actions. Empty when the turn's own text already says it. */
  description: string;
  /** The consequence classes an answer would grant, in Core's own words. */
  consequencePhrases: string[];
  /** Answers the person can give with one press. An open ask has none: it takes text. */
  actions: ConversationAnswerAction[];
  /** The ask takes free text rather than a fixed answer. */
  takesText: boolean;
};

/**
 * The consequence classes this ask would commit. A permission ask names them
 * in `missing` -- exactly what the run was refused -- and every other kind of
 * ask names them in `consequences`.
 */
export function conversationAskConsequences(ask: ConversationAsk): AutomationStudioActionConsequence[] {
  return ask.kind === "permission" ? ask.missing : ask.consequences;
}

/** The ask id prefix of a confirmation whose invocation the panel runs with the PIN. */
const PANEL_COMMAND_ASK_PREFIX = "panel-command.";

/**
 * Whether Core checks the PIN on a yes to this ask: Core's own decision
 * (`runtime/conversations/answer-pin.ts`), read here so the dialog appears exactly
 * where Core would refuse without it. `thread-model.test.ts` holds the two
 * together, because that module is server code and cannot reach the browser.
 */
function conversationAskTakesPin(ask: ConversationAsk): boolean {
  if (!conversationAskConsequences(ask).some((consequence) => AUTOMATION_STUDIO_DESTRUCTIVE_ACTION_CONSEQUENCES.includes(consequence))) return false;
  return ask.kind === "permission" || ask.parks || ask.askId.startsWith(PANEL_COMMAND_ASK_PREFIX);
}

export function conversationAskPresentation(ask: ConversationAsk): ConversationAskPresentation {
  const granted = conversationAskConsequences(ask);
  const takesPin = conversationAskTakesPin(ask);
  const consequencePhrases = granted.map((consequence: AutomationStudioActionConsequence) =>
    AUTOMATION_STUDIO_ACTION_CONSEQUENCE_PHRASES[consequence]
  );
  if (ask.kind === "permission") {
    return {
      title: "FluxIQ is asking for permission.",
      description: ask.parks
        ? "The work is waiting on this answer. Allowing permits only the consequences listed here."
        : "Allowing permits only the consequences listed here.",
      consequencePhrases,
      takesText: false,
      actions: [
        {
          actionId: "deny",
          label: "Don't allow",
          description: null,
          variant: "secondary",
          destructive: false,
          answer: { askId: ask.askId, kind: "deny" }
        },
        {
          actionId: "grant",
          label: "Allow",
          description: null,
          variant: "primary",
          destructive: takesPin,
          answer: { askId: ask.askId, kind: "grant", consequences: [...granted] }
        }
      ]
    };
  }
  if (ask.kind === "confirm") {
    return {
      title: "FluxIQ is asking you to confirm.",
      description: ask.parks ? "The work is waiting on this answer." : "",
      consequencePhrases,
      takesText: false,
      actions: [
        {
          actionId: "deny",
          label: "Cancel",
          description: null,
          variant: "secondary",
          destructive: false,
          answer: { askId: ask.askId, kind: "deny" }
        },
        {
          actionId: "confirm",
          label: "Confirm",
          description: null,
          variant: consequencePhrases.length ? "danger" : "primary",
          destructive: takesPin,
          answer: { askId: ask.askId, kind: "grant", consequences: [...granted] }
        }
      ]
    };
  }
  if (ask.kind === "choice") {
    return {
      title: "FluxIQ is asking you to choose.",
      description: ask.parks ? "The work is waiting on this answer." : "",
      consequencePhrases,
      takesText: false,
      actions: ask.options.map((option) => ({
        actionId: option.optionId,
        label: option.label,
        description: option.description,
        variant: option.destructive ? ("danger" as const) : ("secondary" as const),
        destructive: takesPin,
        answer: { askId: ask.askId, kind: "choice", optionId: option.optionId }
      }))
    };
  }
  return {
    title: "FluxIQ is asking you a question.",
    description: ask.parks ? "The work is waiting on your answer." : "",
    consequencePhrases,
    takesText: true,
    actions: []
  };
}

/**
 * Whether sending this answer needs the person to prove who they are again:
 * only where Core checks it. Refusing and cancelling commit nothing, and an ask
 * no act depends on has nothing to protect; demanding a PIN for those would
 * train people to type it without reading.
 */
export function conversationAnswerNeedsReauthorization(action: ConversationAnswerAction): boolean {
  return action.destructive;
}

/** The sentence the re-authorization dialog shows above its PIN field. */
export function conversationAuthorizationCopy(ask: ConversationAsk, action: ConversationAnswerAction): {
  title: string;
  description: string;
  actionLabel: string;
} {
  const phrases = conversationAskConsequences(ask).map((consequence) => AUTOMATION_STUDIO_ACTION_CONSEQUENCE_PHRASES[consequence]);
  const consequences = phrases.length ? ` It would ${joinPhrases(phrases)}.` : "";
  return {
    title: ask.kind === "permission" ? "Allow this action" : "Confirm this answer",
    description: `This answer has a lasting effect.${consequences} Re-enter your security PIN to send it.`,
    actionLabel: action.label
  };
}

function joinPhrases(phrases: readonly string[]): string {
  if (phrases.length <= 1) return phrases[0] ?? "";
  return `${phrases.slice(0, -1).join(", ")} and ${phrases[phrases.length - 1]}`;
}

/**
 * The panel's answer union as Core's three request fields. Core's handler
 * reads `askId`, `kind` and `value` off the request itself; a nested
 * `answer: { ... }` object reaches it as no kind at all and is refused before
 * it touches the store.
 */
export function conversationAnswerRequest(answer: ConversationAnswer): { askId: string; kind: string; value?: string } {
  if (answer.kind === "choice") return { askId: answer.askId, kind: "choice", value: answer.optionId };
  if (answer.kind === "text") return { askId: answer.askId, kind: "text", value: answer.text };
  // `grant` names the consequence classes it permits, but they are the ask's
  // own `missing` and Core reads them from the ask rather than from the
  // answer; sending them back would be the panel restating what it was told.
  return { askId: answer.askId, kind: answer.kind };
}
