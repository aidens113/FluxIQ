// Which column the rows hold for a column the request names: the one by that name, or the same name written with other
// case, spaces, `_` or `-`, or in the singular or plural (t1051). Nothing else is taken for it: a column held under
// another word, or sharing only one word of the name, is never matched here.
// The answer-first result narrows its rows by this and says which named columns its rows lack
// (`framework/.../answer-first/result/answer.ts`, `header.ts`, `completion/result-columns.ts`), and a yes on rows that
// lack one is refused (`../cited-yes/records-yes.ts`, t1032).

/** The held column that is `named`, or `undefined` where none is. */
export function automationStudioResultHeldColumn(named: string, held: readonly string[]): string | undefined {
  return held.find((key) => key === named) ?? held.find((key) => loose(key) === loose(named));
}

function loose(name: string): string {
  const squashed = name.toLowerCase().replace(/[\s_-]+/gu, "");
  if (squashed.length > 4 && squashed.endsWith("ies")) return `${squashed.slice(0, -3)}y`;
  return squashed.length > 3 && squashed.endsWith("s") && !squashed.endsWith("ss") ? squashed.slice(0, -1) : squashed;
}
