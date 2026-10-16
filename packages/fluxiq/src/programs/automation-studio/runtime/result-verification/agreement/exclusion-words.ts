/**
 * What a split's no asked again is told (header, t515): Core's words and the
 * advice's own exclusions, naming no site or task. A kept row may still be
 * answered no by the words of the request naming what it asks for, which the
 * row is not (t628): narrowing to the request's own item excludes nothing the
 * request does not say.
 */
export function exclusionRecheckWords(exclusions: readonly string[]): string {
  return "This same evidence was judged before, and that answer advised leaving out rows by words the request never states as an exclusion: "
    + `${quotedExclusions(exclusions)}. `
    + "A request excludes only what its own words state; the words it searches or navigates by say where to look and exclude nothing. "
    + "Answer again from the evidence, and answer no over a row the result keeps only where you quote words of the request that it fails: "
    + "words that exclude it, or the words naming what the request asks for, which that row by its own words is not.";
}

function quotedExclusions(exclusions: readonly string[]): string {
  return exclusions.map((exclusion) => `"${exclusion}"`).join(", ");
}

/**
 * A split's no's advice, labelled as adding an exclusion the request never
 * states (header, t515), as t501 labels a reading: its call, Core's words and
 * the exclusions, then the advice in its own words, unchanged.
 */
export function markedAdvice(unstated: { call: 1 | 2; exclusions: readonly string[] }, advice: string, reasked: boolean): string {
  const again = reasked ? "; asked once more with this named, it advised the same" : "";
  return `Judge call ${unstated.call} (Core's check: this advice adds an exclusion the request never states, ${quotedExclusions(unstated.exclusions)}, and a request excludes only what its own words state, so do not add it unless the request's words say so${again}): ${advice}`;
}
