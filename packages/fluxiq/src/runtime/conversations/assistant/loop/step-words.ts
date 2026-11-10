// What the person reads in the thread as the assistant works: one step message
// per tool call ("**Deleting a Flow** — you asked to remove the old one. Done."),
// and the plain sentence each way a message can stop. No code, id or tool name
// is shown; a refusal is said in the words the program refused with.

import type { AssistantToolEntry } from "@fluxiq/contracts/program-api-inputs";

/** Three-letter words that double their last letter before -ing, and the few longer ones the panel's tools use. */
const DOUBLES: ReadonlySet<string> = new Set(["run", "set", "get", "put", "pin", "cut", "tag", "log", "map", "stop", "drop", "plan", "step", "skip"]);

/** "Deletes a Flow." -> "Deleting a Flow": a tool's summary as what is being done. */
export function panelAssistantStepTitle(tool: AssistantToolEntry): string {
  const summary = tool.summary.trim().replace(/[.!]+$/u, "");
  const [first = "", ...rest] = summary.split(" ");
  return [gerund(first), ...rest].join(" ");
}

/** One step message: what is being done, why in the model's words where it gave any, and how it went. */
export function panelAssistantStepText(input: { title: string; why: string; outcome: string }): string {
  const why = input.why.trim().replace(/[.!]+$/u, "");
  return `**${input.title}**${why ? ` — ${why}.` : "."} ${input.outcome}`.trim();
}

/** The plain sentences a message's other steps and endings are written in. */
export const PANEL_ASSISTANT_WORDS = Object.freeze({
  done: "Done.",
  notDone: (error: string) => `It was not done: ${sentence(error)}`,
  unknownTool: (name: string) => `There is no tool called “${name}”.`,
  findTitle: "Looking for a way to do that",
  found: (count: number) => (count === 0 ? "Nothing matched." : `Found ${count} way${count === 1 ? "" : "s"} to go about it.`),
  openTitle: "Showing you a page",
  selectTitle: "Selecting it for you",
  sentToPanel: "The panel is showing it.",
  allowance: (allowanceUsd: number, spentUsd: number) => `I stopped here: this message used its spending allowance of $${allowanceUsd.toFixed(2)} ($${spentUsd.toFixed(2)} spent). Send another message to go on, or raise the allowance in Settings.`,
  loopStopped: "I stopped because I kept repeating the same step without getting anywhere. Tell me what to try differently and I will go on from here.",
  modelFailed: (error: string) => `The assistant's model did not answer: ${sentence(error)} Send your message again to try again.`,
  allowed: "You allowed it.",
  declined: "OK, I did not do that.",
  cardGone: "That request is no longer waiting, so nothing was run. Ask me again if you still want it."
});

function gerund(word: string): string {
  const base = imperative(word);
  const lower = base.toLowerCase();
  if (DOUBLES.has(lower)) return `${base}${base.slice(-1)}ing`;
  if (/ie$/u.test(lower)) return `${base.slice(0, -2)}ying`;
  if (/[^e]e$/u.test(lower)) return `${base.slice(0, -1)}ing`;
  return `${base}ing`;
}

function imperative(word: string): string {
  if (/ies$/u.test(word)) return `${word.slice(0, -3)}y`;
  if (/(?:ss|sh|ch|x|z)es$/u.test(word)) return word.slice(0, -2);
  if (/[^s]s$/u.test(word)) return word.slice(0, -1);
  return word;
}

function sentence(text: string): string {
  const trimmed = text.trim();
  return /[.!?]$/u.test(trimmed) ? trimmed : `${trimmed}.`;
}
