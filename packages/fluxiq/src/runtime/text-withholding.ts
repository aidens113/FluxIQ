import { FLUXIQ_RUNTIME_WITHHELD_VALUE } from "./contracts.ts";

type Span = { start: number; end: number };

/**
 * The one rule for withholding texts inside a string. The runtime's saved
 * command attempts and Automation Studio's persisted run traces both use it, so
 * the two saved copies of one dispatch withhold a value alike.
 *
 * Every stretch of the string covered by an occurrence of a withheld text is
 * replaced by `FLUXIQ_RUNTIME_WITHHELD_VALUE`, and occurrences that overlap are
 * replaced together by one marker. A withheld text that contains another, or
 * overlaps it, is therefore replaced whole, as longest-first replacement
 * intends, and no fragment of either is left. Occurrences that only touch stay
 * separate markers. Empty texts withhold nothing.
 *
 * The stretches are found in the string as it was given, so a marker written
 * here is never rewritten, and an occurrence that lies inside a `[withheld]`
 * already in the string is left alone: a string withheld once reads the same
 * when withheld again, as a Call Flow child's saved trace is inside its parent's.
 *
 * Returns the replacement for one set of texts, built once and applied to many
 * strings. A string with nothing to withhold comes back unchanged.
 */
export function fluxiqRuntimeTextWithholding(texts: Iterable<string>): (text: string) => string {
  const withheld = [...new Set(texts)].filter((text) => text.length > 0);
  if (!withheld.length) return (text) => text;
  return (text) => {
    const markers = occurrences(text, FLUXIQ_RUNTIME_WITHHELD_VALUE, FLUXIQ_RUNTIME_WITHHELD_VALUE.length);
    const spans = withheld
      .flatMap((value) => occurrences(text, value, 1))
      .filter((span) => !markers.some((marker) => span.start >= marker.start && span.end <= marker.end))
      .sort((left, right) => left.start - right.start);
    if (!spans.length) return text;
    let result = "";
    let copiedTo = 0;
    let { start, end } = spans[0]!;
    for (const span of spans) {
      if (span.start < end) {
        end = Math.max(end, span.end);
        continue;
      }
      result += `${text.slice(copiedTo, start)}${FLUXIQ_RUNTIME_WITHHELD_VALUE}`;
      copiedTo = end;
      ({ start, end } = span);
    }
    return `${result}${text.slice(copiedTo, start)}${FLUXIQ_RUNTIME_WITHHELD_VALUE}${text.slice(end)}`;
  };
}

/** Every occurrence of `value` in `text`, searching again `step` characters after each one: 1 finds overlapping occurrences. */
function occurrences(text: string, value: string, step: number): Span[] {
  const found: Span[] = [];
  for (let start = text.indexOf(value); start !== -1; start = text.indexOf(value, start + step)) found.push({ start, end: start + value.length });
  return found;
}
