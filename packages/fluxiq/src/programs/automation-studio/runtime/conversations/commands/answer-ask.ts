// "Yes, go ahead": answering the thread's question from what the person typed.
//
// A build or run started from the chat asks its questions in the chat
// (`../context/`), so the person answers the way they would answer anybody:
// by writing back. This finds the ask they mean -- the one named, or the
// newest one still waiting in this thread -- reads their words as an answer to
// it (`answer-words.ts`), and settles it through `answer-ask`, the endpoint
// the panel's buttons use, so a parked build wakes exactly as it would for a
// click.
//
// An ask that would delete something or move money is not granted from
// words. Those are the two things Core asks a person to re-authorize, and the
// control that asks takes the PIN; a typed "yes" would skip it.

import { AUTOMATION_STUDIO_DESTRUCTIVE_ACTION_CONSEQUENCES } from "../../action-permissions/client/index.ts";
import type { AutomationStudioConversationAsk } from "../ask.ts";
import { automationStudioConversationCommandText } from "./argument.ts";
import { automationStudioConversationAnswerFromWords } from "./answer-words.ts";
import type { AutomationStudioConversationCommand } from "./command.ts";
import { automationStudioConversationCallCause, automationStudioConversationCommandProgress } from "./progress.ts";

const TITLE = "Answer the question";

export const AUTOMATION_STUDIO_CONVERSATION_ANSWER_ASK: AutomationStudioConversationCommand = {
  background: false,
  capability: {
    id: "ask.answer",
    title: TITLE,
    summary: "Answers the question FluxIQ is waiting on in this conversation -- yes, no, one of the options, or what the person wants to say.",
    group: "Conversation",
    control: "",
    arguments: [
      { name: "answer", describe: "The person's answer, in their own words.", required: true },
      { name: "askId", describe: "The question being answered. Left out, it is the newest one still waiting in this conversation.", required: false }
    ],
    // Several words each: Core's own offline matching scores a phrase found
    // anywhere in a message, and a lone "no" is in far too many sentences.
    phrases: ["yes go ahead", "go ahead", "yes please", "no thanks", "allow it", "answer the question", "the first one"],
    consequences: [],
    reauthorizes: false
  },
  async run(context, args) {
    const progress = automationStudioConversationCommandProgress(TITLE, false);
    const words = automationStudioConversationCommandText(args, "answer");
    if (!words) return progress.failed("I was not told what the answer is");
    const ask = await askMeant(context.host, context.projectId, context.conversationId, automationStudioConversationCommandText(args, "askId"));
    if (!ask) return progress.failed("nothing in this conversation is waiting for an answer");
    if (ask.status !== "pending") return progress.failed("that question has already been answered");
    const answer = automationStudioConversationAnswerFromWords(ask, words);
    if (!answer) return progress.failed(unreadable(ask));
    if (answer.kind === "grant" && reauthorizes(ask)) {
      return progress.failed("saying yes to that would delete something or move money, which is confirmed with your PIN on the question itself, not by typing");
    }
    const settled = await context.port.call("answer-ask", {
      projectId: context.projectId,
      askId: ask.askId,
      kind: answer.kind,
      ...(answer.value === undefined ? {} : { value: answer.value })
    });
    if (!settled.ok) return progress.failed(automationStudioConversationCallCause("answering", settled));
    return progress.succeeded(answered(ask, answer.kind, answer.value));
  }
};

/** The ask the person means: the one named, or the newest one still waiting in this thread. */
async function askMeant(
  host: Parameters<AutomationStudioConversationCommand["run"]>[0]["host"],
  projectId: string,
  conversationId: string,
  askId: string
): Promise<AutomationStudioConversationAsk | null> {
  if (askId) {
    const named = await host.getAsk({ projectId, askId });
    if (named && named.conversationId === conversationId) return named;
  }
  const pending = await host.pendingAsks({ projectId, conversationId });
  return pending[pending.length - 1] ?? null;
}

function reauthorizes(ask: AutomationStudioConversationAsk): boolean {
  const classes = ask.kind === "permission" ? (ask.missing ?? ask.consequences ?? []) : (ask.consequences ?? []);
  return classes.some((consequence) => (AUTOMATION_STUDIO_DESTRUCTIVE_ACTION_CONSEQUENCES as readonly string[]).includes(consequence));
}

function unreadable(ask: AutomationStudioConversationAsk): string {
  if (ask.kind === "choice") return `I could not tell which option that was; the choices are ${(ask.options ?? []).map((option) => `"${option.label}"`).join(", ")}`;
  return "I could not tell whether that was a yes or a no";
}

function answered(ask: AutomationStudioConversationAsk, kind: string, value: string | undefined): string {
  if (kind === "grant") return "Answered yes.";
  if (kind === "deny") return "Answered no.";
  if (kind === "choice") return `Chose "${ask.options?.find((option) => option.id === value)?.label ?? value}".`;
  return "Passed your answer on.";
}
