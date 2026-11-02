import type { AutomationStudioMappedInstructionText } from "../../../../flows/executable/permissions/index.ts";
import { automationStudioComparableInstructionText } from "./comparable.ts";
import { permissionConstants } from "./constants.ts";
const { WHITESPACE, TRAILING_MARK } = permissionConstants;

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
