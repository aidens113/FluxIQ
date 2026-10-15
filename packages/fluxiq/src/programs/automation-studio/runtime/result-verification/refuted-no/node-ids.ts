// The steps a sentence of a no names by node id, and the sentence without them
// (t631).
//
// **Why.** A judge names the step to change by its node id, as it is told to,
// and a built Flow's node ids carry runs of letters and digits
// (`node.bootstrap.0d95f29b9e370ec8.<subflow>.s11`) that read as a row's id
// (`../request-rows/words.ts`): A8 bigbox `run-mv9gbsm5-2957581c`'s nos named
// their read so, and every such sentence named a row Core has no record of. So
// a node id is found whole -- the longest first, so `.s11` is never taken for
// `.s1` -- and taken out before the sentence's rows are named
// (`./named-rows.ts`); the steps it names are said apart
// (`./advice-condition.ts`, `./weigh.ts`).

/** Each node id a sentence names, whole, and the sentence with each taken out (header). */
export function automationStudioResultNodeIdsSaid(sentence: string, nodeIds: readonly string[]): { ids: string[]; text: string } {
  const ids: string[] = [];
  let text = sentence;
  for (const id of [...new Set(nodeIds)].filter((one) => one.length > 0).sort((left, right) => right.length - left.length)) {
    const whole = new RegExp(String.raw`(?<![\p{L}\p{N}_.-])${escaped(id)}(?![\p{L}\p{N}_-]|\.[\p{L}\p{N}])`, "gu");
    if (!whole.test(text)) continue;
    ids.push(id);
    text = text.replace(whole, " ");
  }
  return { ids, text };
}

function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
