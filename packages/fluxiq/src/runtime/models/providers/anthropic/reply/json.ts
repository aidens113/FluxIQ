import { automationStudioDeepSeekClosedContent } from "../../deepseek/index.ts";
import { automationStudioAnthropicObjectEnd } from "./object-end.ts";

const FENCE = /^```[a-z0-9_-]*[ \t]*\r?\n([\s\S]*?)\r?\n?```$/iu;

/**
 * The JSON value in a reply's text, with the damage that adds nothing to the
 * answer undone: a Markdown fence around it, closing brackets after the object
 * that are one too many, or closing brackets short at its end. Anything else,
 * prose around it, a second value, a broken string, is not guessed at: the
 * caller refuses it and says which case it was. The value is validated by the
 * caller either way, so a repair can never make an invalid answer valid.
 */
export function automationStudioAnthropicReplyJson(text: string): { ok: true; value: unknown } | { ok: false } {
  const trimmed = text.trim();
  const unfenced = FENCE.exec(trimmed)?.[1] ?? trimmed;
  const candidates: string[] = [unfenced];
  const end = automationStudioAnthropicObjectEnd(unfenced);
  if (end !== undefined) {
    if (/^[\s}\]]*$/u.test(unfenced.slice(end))) candidates.push(unfenced.slice(0, end));
  } else {
    const closed = automationStudioDeepSeekClosedContent(unfenced);
    if (closed !== undefined) candidates.push(closed);
  }
  for (const candidate of candidates) {
    try { return { ok: true, value: JSON.parse(candidate) as unknown }; } catch { /* best-effort: the next candidate is tried, then the reply is refused */ }
  }
  return { ok: false };
}
