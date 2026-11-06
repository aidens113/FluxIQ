// How often the answer was checked, said as it was. The count line a check writes ends "once against what was asked
// for", which the check wrote before it knew whether it would be asked again: a no, then a yes is two checks, and a
// result that says "once" is untrue. The result's own `timesChecked` counts the checks that answered, so the line says
// that number and never more than it holds.

const ONCE = /, once against what was asked for\.$/u;
const ONLY_ONCE = /^nothing to show, once against what was asked for\.$/u;

function timesWords(times: number): string {
  return times === 2 ? "twice" : `${times} times`;
}

/** `checkedWhat` with its "once" made true: left as it is for one check, "twice" or "3 times" for more, and no count where none answered. */
export function checkedTimesWords(checkedWhat: string, timesChecked: number): string {
  if (timesChecked === 1) return checkedWhat;
  const how = timesChecked > 1 ? `, ${timesWords(timesChecked)} against what was asked for.` : ", against what was asked for.";
  if (ONLY_ONCE.test(checkedWhat)) return `nothing to show${how}`;
  return checkedWhat.replace(ONCE, how);
}
