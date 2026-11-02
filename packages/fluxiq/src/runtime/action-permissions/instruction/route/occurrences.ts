

export /** Every index in `[from, to)` where `needle` starts and ends inside that range. */
function occurrences(text: string, needle: string, from: number, to: number): number[] {
  const found: number[] = [];
  for (let at = text.indexOf(needle, from); at !== -1 && at + needle.length <= to; at = text.indexOf(needle, at + 1)) found.push(at);
  return found;
}
