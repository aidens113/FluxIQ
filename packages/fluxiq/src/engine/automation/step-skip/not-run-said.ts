// What a run says of a step it never ran on some passes (t796, debug
// `run-mvtdn37t-e1e4d0a7`): Core's one sentence, which the trial's feedback
// gives the model (`../../service/candidate-trial/feedback.ts`, `notRun`).
//
// A step written `only after:` an optional step is gone past with it
// (`./guarded-group.ts`): on a pass where that step was skipped, the guarded
// step has no attempt at all, so a list of the steps that ran never names it.
// Run `run-mvtdn37t-e1e4d0a7` went past its act step on all 21 passes and the
// model was told nothing. This says which passes, why, and, for a step that
// does a lasting act, that what it does was not done (r4b F4's words for a
// skipped act, `./act-not-done.ts` decides only whether a skipped step acts).
//
// Generic: it quotes only the guard step's own label, bounded, and numbers.

/** The longest label quoted. */
const LABEL_CAP = 80;
/** A run of consecutive passes at least this long is said as a range ("1 to 21"). */
const RANGE_FROM = 4;

/** Core's sentence for a step not run on `passes` (of `of`, inside a repeat; outside one, `of` is absent). */
export function automationStudioStepNotRunSaid(input: { reason: "guarded" | "unreached"; after?: string | undefined; passes: readonly number[]; of?: number | undefined; lasting: boolean }): string {
  const { passes, of } = input;
  const inRepeat = of !== undefined && passes.length > 0;
  const where = inRepeat ? ` on ${passes.length === 1 ? "pass" : "passes"} ${listed(passes)} of ${of}` : "";
  const why = input.reason === "guarded" && input.after !== undefined
    ? `it runs only after "${bounded(input.after)}", which was skipped`
    : `the run never reached it${inRepeat ? (passes.length === 1 ? " on that pass" : " on those passes") : ""}`;
  return `Not run${where}: ${why}${input.lasting ? ", so what it does was not done." : "."}`;
}

/** Pass numbers in words, in order: "1, 2 and 3"; a long run of consecutive ones as a range, "1 to 21". */
function listed(passes: readonly number[]): string {
  const sorted = [...new Set(passes)].sort((left, right) => left - right);
  const parts: string[] = [];
  for (let index = 0; index < sorted.length;) {
    let end = index;
    while (end + 1 < sorted.length && sorted[end + 1] === sorted[end]! + 1) end += 1;
    if (end - index + 1 >= RANGE_FROM) parts.push(`${sorted[index]} to ${sorted[end]}`);
    else for (let each = index; each <= end; each += 1) parts.push(String(sorted[each]));
    index = end + 1;
  }
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : (parts[0] ?? "");
}

function bounded(text: string): string {
  const flat = text.replace(/\s+/gu, " ").trim();
  return flat.length > LABEL_CAP ? `${flat.slice(0, LABEL_CAP - 1)}…` : flat;
}
