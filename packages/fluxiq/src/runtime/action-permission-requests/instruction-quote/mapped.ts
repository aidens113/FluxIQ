// The comparison text of an instruction (`./comparable.ts`) with, for each of
// its code units, the place in the person's original words it came from.
//
// The route read (`../instruction-route/read.ts`) has to say where in the
// instruction a route and each of its waypoints are, so that two occurrences of
// one label are told apart and a later step can point at the person's words.
// Matching happens on the comparison text, where an index is not an offset
// into the original: a whitespace run is one space, a lowercased character can
// be two units, a trailing mark is gone. So every compared unit carries the
// original interval it stands for, and a match converts through that map --
// never by reusing compared indices as original offsets.
//
// Offsets are UTF-16 code units, half-open, as `String.prototype.slice` reads
// them. The map is built one code point at a time and must reproduce the
// comparison text exactly; where lowercasing depends on context (a final
// capital sigma), it cannot, and the answer is `undefined` rather than a map of
// different words.

import { automationStudioComparableInstructionText } from "./comparable.ts";

/** An interval of the original text: UTF-16 code units, `start` included, `end` not. */
export type AutomationStudioInstructionTextSpan = { start: number; end: number };

/** The comparison text, and where any range of it came from in the original. */
export type AutomationStudioMappedInstructionText = {
  /** Exactly `automationStudioComparableInstructionText` of the original. */
  readonly text: string;
  /** The original interval the compared range `[from, to)` came from; `from < to` within `text`. */
  span(from: number, to: number): AutomationStudioInstructionTextSpan;
};

const WHITESPACE = /^\s$/u;
const TRAILING_MARK = /^[.,;:!]$/u;

export function automationStudioMappedInstructionText(original: string): AutomationStudioMappedInstructionText | undefined {
  const units: { unit: string; start: number; end: number }[] = [];
  for (let at = 0; at < original.length;) {
    const point = original.codePointAt(at)!;
    const width = point > 0xffff ? 2 : 1;
    const folded = String.fromCodePoint(point).toLowerCase().replace(/[‘’]/gu, "'").replace(/[“”]/gu, "\"");
    for (const unit of folded.split("")) {
      const last = units.at(-1);
      // A whitespace run is one space standing for the whole run.
      if (WHITESPACE.test(unit) && last?.unit === " " && last.end === at) last.end = at + width;
      else units.push({ unit: WHITESPACE.test(unit) ? " " : unit, start: at, end: at + width });
    }
    at += width;
  }
  while (units[0]?.unit === " ") units.shift();
  while (units.at(-1)?.unit === " ") units.pop();
  while (units.length && TRAILING_MARK.test(units.at(-1)!.unit)) units.pop();
  const text = units.map((entry) => entry.unit).join("");
  if (text !== automationStudioComparableInstructionText(original)) return undefined;
  return {
    text,
    span: (from, to) => {
      if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to > units.length || from >= to) throw new RangeError(`No compared range [${from}, ${to}) in a text of ${units.length} units.`);
      return { start: units[from]!.start, end: units[to - 1]!.end };
    }
  };
}
