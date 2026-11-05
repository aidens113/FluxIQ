import type { AutomationStudioLlmProviderReplyCase } from "../../../failures/index.ts";
import { automationStudioAnthropicObjectEnd } from "./object-end.ts";

/**
 * Which kind of damage a reply's text has, read from its structure alone and
 * never quoted: the closed case list `../../failures/reply-account.ts` names.
 */
export function automationStudioAnthropicReplyCase(text: string): AutomationStudioLlmProviderReplyCase {
  const start = text.trimStart();
  if (start === "") return "content_empty";
  if (start.startsWith("```")) return "content_fenced";
  if (!start.startsWith("{")) return start.includes("{") ? "content_prefixed" : "content_not_object";
  const end = automationStudioAnthropicObjectEnd(text);
  if (end === undefined) return "content_unclosed";
  if (!/^[\s}\]]*$/u.test(text.slice(end))) return "content_trailing";
  return bracketsMismatch(text) ? "content_mismatched" : "content_invalid";
}

/** Whether a bracket outside a string closes the other kind, or closes nothing. */
function bracketsMismatch(text: string): boolean {
  const open: string[] = [];
  let inString = false;
  let escaped = false;
  for (const char of text) {
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{" || char === "[") open.push(char);
    else if (char === "}" || char === "]") {
      if (open.pop() !== (char === "}" ? "{" : "[")) return true;
    }
  }
  return false;
}
