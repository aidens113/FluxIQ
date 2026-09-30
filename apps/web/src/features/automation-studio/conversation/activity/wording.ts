// What one activity event says to a person, in words: never a tool id, a node
// id or a result code.
//
// Core's own sentence (`label`) comes first, because Core now words each call
// from the call's own input ("Clicking “Get a free quote”"). An older Core, or
// an event it could not word, says "Using core.run_node: web.action.succeeded";
// such a sentence is not shown. The row falls back to the detail's title, and
// then to a plain phrase for what kind of work it was. The words after " — "
// ("done", "didn't work") are the outcome, which the row draws as a mark, so
// they are left off the step itself.

import type { ConversationActivity, ConversationActivityDetailKind } from "./contracts";

/** A dotted identifier (`core.run_node`, `web.action.succeeded`) or a snake_case code (`target_unobserved`). */
const IDENTIFIER = /\b[a-z][\w-]*(?:\.[\w-]+)+\b|\b[a-z]+_[a-z_]+\b/iu;

const FALLBACK: Readonly<Record<ConversationActivityDetailKind, string>> = Object.freeze({
  thought: "Thinking about the next step",
  tool: "Working on the page",
  step: "Running a step",
  check: "Checking the Flow",
  ask: "Asking you",
  note: "Keeping track of the work"
});

/** True when a sentence carries no identifier and does not only name the tool it used. */
export function conversationActivityTextIsHuman(text: string | undefined): text is string {
  if (!text || !text.trim()) return false;
  return !/^Using\s/u.test(text) && !IDENTIFIER.test(text);
}

/** What the event did, without its outcome: Core's sentence, else the detail's title, else a plain phrase. */
export function conversationActivitySentence(event: ConversationActivity): string {
  const action = event.label.split(" — ")[0]!.trim();
  if (conversationActivityTextIsHuman(action)) return action;
  const title = event.detail?.title;
  if (conversationActivityTextIsHuman(title)) return title.trim();
  return FALLBACK[event.detail?.kind ?? "thought"];
}
