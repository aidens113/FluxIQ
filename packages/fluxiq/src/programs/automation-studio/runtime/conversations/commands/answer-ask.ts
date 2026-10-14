// "Yes, go ahead": answering the thread's question from what the person typed.
//
// A build or run started from the chat asks its questions in the chat
// (`../context/`), so the person answers the way they would answer anybody:
// by writing back. This finds the ask they mean -- the one named, or the one
// still waiting in this thread -- reads their words as an answer to it
// (`answer-words.ts`), and settles it through `answer-ask`, the endpoint the
// panel's buttons use, so a parked build wakes exactly as it would for a
// click.
//
// **Several waiting asks need a name (automation-project-agents plan, A10).**
// A project build can run several builders at once, and each can ask; an
// answer that named none used to settle the newest, which with two waiting
// could be the other builder's question. So when more than one ask is
// waiting in the thread an answer must name its ask, and one that does not
// (or names one this thread does not have) is refused, settling nothing. The
// refusal names the waiting asks by their own question words, as the person
// saw them, never by id: the thread keeps no codes (t276), and the panel's
// buttons on each question already answer it by id. With one ask waiting
// nothing changed: an answer that names none, or names one not here, settles
// that one.
//
// An ask that would move money, delete something, or send or publish
// something is not settled from words, except by a no. Those are the classes
// Core asks a person about every time (`action-permissions/destructive.ts`,
// read here rather than restated), and the control that asks takes the PIN; a
// typed "yes" would skip it. "Except by a no" is the whole rule: a grant, a
// chosen option or passed-on words could each be the answer that commits the
// act, and only a refusal is safe to take in passing.
//
// **History.** Until 2026-09-30 this said "delete something or move money",
// because `send_or_publish` was not gated then; lane D (t195) gated it again
// and the test here still granted a publish by typing (t201).

import { AUTOMATION_STUDIO_ACTION_CONSEQUENCE_PHRASES, AUTOMATION_STUDIO_DESTRUCTIVE_ACTION_CONSEQUENCES } from "../../action-permissions/client/index.ts";
import type { AutomationStudioActionConsequence } from "../../action-permissions/index.ts";
import type { AutomationStudioConversationAsk } from "../ask.ts";
import { automationStudioConversationCommandText } from "./argument.ts";
import { automationStudioConversationAnswerFromWords } from "./answer-words.ts";
import type { AutomationStudioConversationCommand } from "./command.ts";
import { automationStudioConversationCallCause, automationStudioConversationCommandProgress } from "./progress.ts";

const TITLE = "Answer the question";
/** The cause of refusing an answer that named none of several waiting asks, as the outcome's `error` carries it. */
const SEVERAL_WAITING = "more than one question is waiting in this conversation and the answer did not say which";

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
      { name: "askId", describe: "The question being answered. Left out, it is the one question still waiting in this conversation; when more than one is waiting it must be named.", required: false }
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
    const meant = await askMeant(context.host, context.projectId, context.conversationId, automationStudioConversationCommandText(args, "askId"));
    if (!meant) return progress.failed("nothing in this conversation is waiting for an answer");
    if ("refused" in meant) return progress.failed(SEVERAL_WAITING, { ending: meant.refused });
    const { ask } = meant;
    if (ask.status !== "pending") return progress.failed("that question has already been answered");
    const answer = automationStudioConversationAnswerFromWords(ask, words);
    if (!answer) return progress.failed(unreadable(ask));
    const gated = gatedClasses(ask);
    if (answer.kind !== "deny" && gated.length) {
      return progress.failed(`answering that would ${gated.map((consequence) => AUTOMATION_STUDIO_ACTION_CONSEQUENCE_PHRASES[consequence]).join(", or ")}, which is confirmed with your PIN on the question itself, not by typing`);
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

/**
 * The ask the person means: the one named, when this thread has it; otherwise
 * the one ask still waiting here. With several waiting and none of them named,
 * the answer is refused with the waiting asks named (header); with none
 * waiting, there is nothing to answer.
 */
async function askMeant(
  host: Parameters<AutomationStudioConversationCommand["run"]>[0]["host"],
  projectId: string,
  conversationId: string,
  askId: string
): Promise<{ ask: AutomationStudioConversationAsk } | { refused: string } | null> {
  if (askId) {
    const named = await host.getAsk({ projectId, askId });
    if (named && named.conversationId === conversationId) return { ask: named };
  }
  const pending = await host.pendingAsks({ projectId, conversationId });
  if (pending.length > 1) return { refused: await severalWaiting(host, projectId, pending, askId) };
  const only = pending[0];
  return only ? { ask: only } : null;
}

/**
 * What the person reads when an answer named none of several waiting asks:
 * each one in its own question words, with what kind of answer it takes, and
 * how to answer the one they mean. Never an id (header). It goes as the
 * failure's own account rather than its cause, because a cause is cleared of
 * anything that reads like a code (`progress.ts`, t276), and a question that
 * happened to read like one would clear the whole list.
 */
async function severalWaiting(
  host: Parameters<AutomationStudioConversationCommand["run"]>[0]["host"],
  projectId: string,
  pending: readonly AutomationStudioConversationAsk[],
  askId: string
): Promise<string> {
  const named = askId ? `That question is not in this conversation, and ${pending.length}` : `${pending.length}`;
  const asks = await Promise.all(pending.map(async (ask) => waitingAsk(ask, await questionOf(host, projectId, ask))));
  return `${named} questions are waiting here, so I could not tell which one this answers: ${asks.join("; ")}. Answer the one you mean on the question itself`;
}

/** The words the ask's turn put to the person, or null when the host cannot read them. */
async function questionOf(host: Parameters<AutomationStudioConversationCommand["run"]>[0]["host"], projectId: string, ask: AutomationStudioConversationAsk): Promise<string | null> {
  const turn = await host.getTurn?.({ projectId, conversationId: ask.conversationId, turnId: ask.turnId });
  const text = turn?.text.trim();
  return text ? text : null;
}

/** One waiting ask as the refusal names it: its question, and what kind of answer it takes. */
function waitingAsk(ask: AutomationStudioConversationAsk, question: string | null): string {
  const about = ask.control?.name ? ` about ${ask.control.name}` : "";
  const kind = ask.kind === "choice"
    ? `a choice${about} between ${(ask.options ?? []).map((option) => `"${option.label}"`).join(", ")}`
    : ask.kind === "open" ? `a question${about} that takes your own words` : `a yes-or-no question${about}`;
  return question ? `"${question}", ${kind}` : kind;
}

/**
 * The classes Core gates that answering this ask would commit, in Core's
 * order. A permission ask commits what it lacks (`missing`); any other ask
 * commits what it says it does.
 */
function gatedClasses(ask: AutomationStudioConversationAsk): AutomationStudioActionConsequence[] {
  const classes = ask.kind === "permission" ? (ask.missing ?? ask.consequences ?? []) : (ask.consequences ?? []);
  return AUTOMATION_STUDIO_DESTRUCTIVE_ACTION_CONSEQUENCES.filter((consequence) => classes.includes(consequence));
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
