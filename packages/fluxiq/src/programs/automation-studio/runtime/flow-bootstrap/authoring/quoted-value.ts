// Reading a value the model wrote inside quote marks as the text inside them.
//
// A script line is `key: value`, and the model often quotes the value the way
// it would in code: `value: "2"`, `text: 'blue shirt'`, `when: page.path is
// "/cart"`. The quotes are how it wrote the value, not part of it. Until t464
// a string parameter was sent exactly as written, so lane B round 8
// (`run-mv5jnc62-01c3609a`) asked a quantity select for the three characters
// `"2"` with their quote marks, matched no option, and failed four trials of an
// otherwise correct Flow; the condition reader stripped quotes its own way.
// This is the one rule both readers use (`./values.ts`, `./condition.ts`):
//
// - a value wrapped in one matching pair of `"`, `'` or a backtick is the text
//   inside it;
// - a double-quoted value is read as the JSON string it spells when it spells
//   one, so `"a \"b\" c"` and `"line\nbreak"` keep their escapes' meaning;
//   otherwise, and for the other two marks, `\` before the same mark or before
//   another `\` is that character, and any other backslash is kept as written;
// - a quote mark inside the value stays: `'a "b" c'` is `a "b" c`, and
//   `'What's new'` is `What's new`;
// - anything else -- no pair, a lone mark, a closing mark escaped by the
//   backslash before it -- is not a quoted value, and the caller keeps the
//   text as written.

const QUOTE_MARKS: ReadonlySet<string> = new Set(["\"", "'", "`"]);

/** The text inside one matching pair of quote marks around `text`, or `undefined` when it is not wrapped in one. */
export function authoringQuotedValue(text: string): string | undefined {
  const trimmed = text.trim();
  const mark = trimmed.charAt(0);
  if (trimmed.length < 2 || !QUOTE_MARKS.has(mark) || trimmed.charAt(trimmed.length - 1) !== mark) return undefined;
  if (mark === "\"") {
    const parsed = jsonString(trimmed);
    if (parsed !== undefined) return parsed;
  }
  const inner = trimmed.slice(1, -1);
  // An odd run of backslashes before the closing mark escapes it: then the
  // value never closed, and it is not a quoted value.
  const trailing = /\\*$/u.exec(inner)?.[0].length ?? 0;
  if (trailing % 2 === 1) return undefined;
  return inner.replace(/\\([\\"'`])/gu, (escaped, character: string) => (character === "\\" || character === mark ? character : escaped));
}

/** The string a double-quoted value spells as JSON, or `undefined` when it is not one. */
function jsonString(text: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "string" ? parsed : undefined;
  } catch (failure) {
    // Not JSON is the ordinary case here (`"say "hi""`), read by the general
    // rule instead; anything else is not this text's fault and is not swallowed.
    if (failure instanceof SyntaxError) return undefined;
    throw failure;
  }
}
