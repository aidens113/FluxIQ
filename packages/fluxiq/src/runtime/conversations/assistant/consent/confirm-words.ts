import type { AssistantToolEntry } from "@fluxiq/contracts/program-api-inputs";
import type { PanelAssistantTarget } from "../types.ts";
import type { PanelAssistantGatedClass } from "./gated-class.ts";

/** Why a card asks, one plain sentence per class, most serious first. */
const WHY: ReadonlyArray<[PanelAssistantGatedClass, string]> = [
  ["money", "It may spend money."],
  ["send", "It may send or publish something other people will see."],
  ["delete", "It cannot be undone."],
  ["security", "It changes keys, sign-in or who has access."],
  ["budget", "It may cost more than is left of this message's spending allowance."]
];

/**
 * The words on an Allow card: the act as a question, then what the lookup
 * knows of its effect or why it is asked about. "Delete the Flow “Old search”?
 * It removes the Flow and its 12 runs." The act comes from the tool's own
 * summary ("Deletes a Flow.") turned into a request, with the target named in
 * place of its object where the target is known. A `partial` target may be
 * acted on in more ways than its name says, so the card keeps the tool's own
 * words and names the target after them: "Delete a project and everything in
 * it: the project “Shop”?"
 */
export function panelAssistantConfirmWords(input: { tool: AssistantToolEntry; target: PanelAssistantTarget | undefined; classes: readonly PanelAssistantGatedClass[] }): string {
  const summary = input.tool.summary.trim().replace(/[.!]+$/u, "");
  const [first = "", ...rest] = summary.split(" ");
  const verb = imperative(first);
  const named = targetWords(input.target);
  const object = named === undefined ? rest.join(" ") : input.target?.partial ? `${rest.join(" ")}: ${named}` : named;
  const question = `${[verb, object].filter(Boolean).join(" ")}?`;
  const why = input.target?.detail ?? WHY.filter(([gated]) => input.classes.includes(gated)).map(([, sentence]) => sentence).join(" ");
  return why ? `${question} ${why}` : question;
}

/** "Deletes" -> "Delete", "Copies" -> "Copy", "Publishes" -> "Publish". */
function imperative(word: string): string {
  if (/ies$/u.test(word)) return `${word.slice(0, -3)}y`;
  if (/(?:ss|sh|ch|x|z)es$/u.test(word)) return word.slice(0, -2);
  if (/[^s]s$/u.test(word)) return word.slice(0, -1);
  return word;
}

function targetWords(target: PanelAssistantTarget | undefined): string | undefined {
  const items = target?.items ?? [];
  if (items.length === 0) return undefined;
  if (items.length === 1) {
    const item = items[0]!;
    return item.name ? `the ${item.kind} “${item.name}”` : `this ${item.kind}`;
  }
  const kinds = new Set(items.map((item) => item.kind));
  const kind = kinds.size === 1 ? items[0]!.kind : "item";
  const named = items.filter((item) => item.name).map((item) => `“${item.name}”`);
  return named.length === items.length && named.length <= 5 ? `the ${kind}s ${named.join(", ")}` : `${items.length} ${kind}s`;
}
