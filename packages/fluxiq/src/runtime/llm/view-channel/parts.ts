// A delivery's lines cut into parts that each fit the page budget (D6, P-c).
//
// Lines stay whole and in page order: a part ends at the last line that keeps
// it within the budget, counting the line breaks between lines. A single line
// longer than the budget is a part of its own rather than cut, so no text is
// ever cut silently. The budget bounds the size of one delivery and nothing
// else.

/** `lines` in parts of at most `budgetChars` characters each (one line longer than that alone), never empty. */
export function automationStudioLlmPageParts(lines: readonly string[], budgetChars: number): string[][] {
  const parts: string[][] = [];
  let part: string[] = [];
  let size = 0;
  for (const line of lines) {
    const added = (part.length ? 1 : 0) + line.length;
    if (part.length && size + added > budgetChars) {
      parts.push(part);
      part = [];
      size = 0;
    }
    size += (part.length ? 1 : 0) + line.length;
    part.push(line);
  }
  parts.push(part);
  return parts;
}
