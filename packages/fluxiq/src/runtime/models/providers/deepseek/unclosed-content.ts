// A reply one or more closing brackets short at its end, closed.
//
// Lane C (`run-mv0fuotv-805294d7`, C3): DeepSeek flash stopped of its own
// accord (`finish_reason: stop`) one `}` short of the root on all three of its
// extract-list `run_node` decisions, each otherwise complete, and each was
// refused `content_unclosed` -- three paid decisions lost. This is the mirror of
// the surplus `}` the envelope already takes (`./response-envelope.ts`).
//
// Only the closers are supplied: the content must open with `{`, every bracket
// it closes must close the kind it opened, and it must not end inside a string
// (a string cut off is not a bracket short). What is appended is exactly the
// closers of the brackets still open, innermost first. Whether the result is
// then taken is the caller's: it must parse and validate as any reply does.

/** `content` with the closers its still-open brackets need appended, or `undefined` when it is not only closers short. */
export function automationStudioDeepSeekClosedContent(content: string): string | undefined {
  const text = content.trimEnd();
  if (!text.trimStart().startsWith("{")) return undefined;
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
      // A closer of the other kind, or one past the root: miscounted, not short.
      if (open.pop() !== (char === "}" ? "{" : "[")) return undefined;
      if (open.length === 0) return undefined;
    }
  }
  if (inString || open.length === 0) return undefined;
  return text + open.reverse().map((bracket) => (bracket === "{" ? "}" : "]")).join("");
}
