// How a command reads what it was given: an argument as text, and the
// instruction a create-here, explore or improve saves.
//
// When a person's message started the command, what they wrote is the
// instruction, whatever the chat model put in its argument
// (`../person-words.ts`, t349). The argument is kept only for callers that run
// a command with no person turn behind it -- a script, a test, a client
// calling the command directly -- and the result says which it was, so a
// fallback is never mistaken for the person's words.

import type { AutomationStudioPanelCapability } from "../../panel-capabilities/index.ts";
import type { AutomationStudioConversationCommandContext } from "./command.ts";

/** A command argument as trimmed text: a string as written, a number as its digits, anything else empty. */
export function automationStudioConversationCommandText(args: Record<string, unknown>, name: string): string {
  const value = args[name];
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

/** What a command saves as its instruction, and whose words they are. */
export type AutomationStudioConversationCommandInstruction = {
  text: string;
  /** `person`: their own message, as written. `argument`: the command's argument, because no person turn started it. */
  from: "person" | "argument";
  /**
   * For the person's words: whether they say what to do beyond asking for the
   * command ("build it again" does not). Always true for an argument.
   */
  saysWhatToDo: boolean;
};

/**
 * The instruction to save: the person's words when a person turn started the
 * command (`context.answerTurnId`, read through the host), else the argument
 * `name`. Null when there is neither.
 */
export async function automationStudioConversationCommandInstruction(
  context: Pick<AutomationStudioConversationCommandContext, "host" | "projectId" | "conversationId" | "answerTurnId">,
  capability: Pick<AutomationStudioPanelCapability, "title" | "phrases">,
  args: Record<string, unknown>,
  name: string
): Promise<AutomationStudioConversationCommandInstruction | null> {
  const words = context.answerTurnId && context.host.personWords
    ? await context.host.personWords({ projectId: context.projectId, conversationId: context.conversationId, answerTurnId: context.answerTurnId, capability })
    : null;
  if (words) return { text: words.text, from: "person", saysWhatToDo: words.saysWhatToDo };
  const argument = automationStudioConversationCommandText(args, name);
  return argument ? { text: argument, from: "argument", saysWhatToDo: true } : null;
}

/** Said beside "saved what it should do" when the words saved were the command's argument, not the person's. */
export const AUTOMATION_STUDIO_CONVERSATION_ARGUMENT_WORDS = "as the request worded it, since no message of yours came with it";
