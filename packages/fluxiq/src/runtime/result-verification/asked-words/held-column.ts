// Which column the rows hold for a column the request names: the one by that name, or the same name written with other
// case, spaces, `_` or `-`. Nothing else is taken for it: a column held under another word is never matched here.
// The answer-first result narrows its rows by this and says which named columns its rows lack
// (`framework/.../answer-first/result/answer.ts`, `header.ts`, `completion/result-columns.ts`), and a yes on rows that
// lack one is refused (`../cited-yes/records-yes.ts`, t1032).

/** The held column that is `named`, or `undefined` where none is. */
export function automationStudioResultHeldColumn(named: string, held: readonly string[]): string | undefined {
  return held.find((key) => key === named) ?? held.find((key) => loose(key) === loose(named));
}

function loose(name: string): string {
  return name.toLowerCase().replace(/[\s_-]+/gu, "");
}
