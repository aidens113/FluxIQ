// What to write instead of a word written under the wrong key (t514).
//
// Two refusals meet a word the node takes somewhere else. The authoring reader
// refuses a key no parameter is called (`bootstrap.unknown_parameter`, `state:
// absent`), and plan resolution refuses a handle nothing resolved
// (`bootstrap.handle_unresolved`, `expectedState: {handle: "absent"}`). Each
// is answered with the line the node takes the word in, from its own schema
// (`./word-forms.ts`), in Core's own sentence. It quotes only the key and the
// word the model wrote, and only when each is an identifier, and the forms
// the schema declares; never a page value.
import type { AutomationStudioNodeDefinition } from "../../../nodes/index.ts";
import { automationStudioParameterWordForms } from "./word-forms.ts";

/** A key or word quoted back: identifier characters only, so never a sentence or a page value. */
const QUOTABLE = /^[A-Za-z0-9_.:-]{1,64}$/u;

/**
 * `{ instead }` when the node takes `word` under another line, else `{}`.
 * `as` says which refusal it answers: a key no parameter is called, or a
 * handle under `key` that nothing resolved.
 */
export function automationStudioFlowBootstrapWordInstead(input: {
  key: string;
  word: string;
  definition: AutomationStudioNodeDefinition;
  as: "unknown_key" | "unresolved_handle";
}): { instead?: string } {
  const key = input.key.trim();
  const word = input.word.trim();
  if (!QUOTABLE.test(key) || !QUOTABLE.test(word)) return {};
  const forms = automationStudioParameterWordForms(input.definition, word).filter((form) => !form.startsWith(`${key}: `));
  if (!forms.length) return {};
  const write = forms.length === 1 ? `\`${forms[0]}\`` : `one of ${forms.map((form) => `\`${form}\``).join(", ")}`;
  const why = input.as === "unknown_key"
    ? `no parameter of this step is called \`${key}\`, and the node takes \`${word}\` only as ${write}`
    : `\`${word}\` is not a handle any view printed, so \`${key}\` cannot hold it; the node takes \`${word}\` only as ${write}`;
  return { instead: `Write ${write} in place of \`${key}: ${word}\`: ${why}.` };
}
