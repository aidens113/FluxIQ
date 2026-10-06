/**
 * The raw record a tool row carries in `detail.text`: "Result: <code> ·
 * Reason: <reason> · Excused: <why> · Applied: <count> · Rows: <count> ·
 * Pages: <count> · Node: <node id> · Changed: <words>", each part optional
 * (`programs/automation-studio/runtime/activity/observer.ts`).
 * The reason is the caller's own code for why a call came to its result (an
 * edit Core refused names each of its reasons, comma-separated); `Excused` is
 * set on a test's step that did not hold and that the Flow passes over, naming
 * why (`./tested.ts`); `Applied` is how many of an edit's changes landed
 * (`programs/automation-studio/runtime/activity/decision-answer/draft-edit.ts`).
 * `Rows` and `Pages` are how many rows a list read kept and from how many
 * pages, where the call's answer said. Codes and counts are read only to
 * classify the row and say how it went, and no code is ever shown.
 *
 * `Changed`, always last, is the one part in words: Core's plain account of
 * what an edit to the Flow changed ('removed "Add to cart"'), written
 * from the amendments Core applied, and shown as the card's `result`.
 */
export function activityActionRecordOf(text: string | undefined): {
  resultCode: string | undefined;
  reason?: string | undefined;
  excused?: string | undefined;
  applied?: number | undefined;
  rows?: number | undefined;
  pages?: number | undefined;
  changed?: string | undefined;
  node: string | undefined;
} {
  if (!text) return { resultCode: undefined, node: undefined };
  const changedAt = /(?:^|\s·\s)Changed: /u.exec(text);
  const changed = changedAt ? text.slice(changedAt.index + changedAt[0].length).replace(/\s+/gu, " ").trim() : undefined;
  const codes = changedAt ? text.slice(0, changedAt.index) : text;
  const count = (name: string): number | undefined => {
    const found = new RegExp(`(?:^|·\\s*)${name}: (\\d{1,6})(?=\\s|$)`, "u").exec(codes)?.[1];
    return found === undefined ? undefined : Number(found);
  };
  const reason = /(?:^|·\s*)Reason: (\S+)/u.exec(codes)?.[1];
  const excused = /(?:^|·\s*)Excused: (\S+)/u.exec(codes)?.[1];
  const applied = count("Applied");
  const rows = count("Rows");
  const pages = count("Pages");
  return {
    resultCode: /(?:^|·\s*)Result: (\S+)/u.exec(codes)?.[1],
    ...(reason === undefined ? {} : { reason }),
    ...(excused === undefined ? {} : { excused }),
    ...(applied === undefined ? {} : { applied }),
    ...(rows === undefined ? {} : { rows }),
    ...(pages === undefined ? {} : { pages }),
    ...(changed ? { changed } : {}),
    node: /(?:^|·\s*)Node: (\S+)/u.exec(codes)?.[1]
  };
}
