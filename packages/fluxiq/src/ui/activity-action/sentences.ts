// The one sentence splitter for words the chat shows: a model's or a judge's
// sentences, Core's card text, and anything cut to fit. Live run
// `run-muwansvz-a2b4a987` (R2-U-3) showed "Stored rows include sponsored items
// (e.g. Repairing it live.": a split on any full stop and a space ended the
// judge's sentence after "e.g.", inside its open parenthesis, and the next
// sentence of the chat was glued on. Pure, for every client and for Core.

/** Abbreviations that never end a sentence, with any opening mark before them: "(e.g.", "vs.". */
const NEVER_ENDS = /^[("“'[]*(?:e\.g|i\.e|vs|cf|approx|incl|esp|viz)\.$/iu;
/** "etc.", which ends a sentence only before a capital. */
const ETC = /^[("“'[]*etc\.$/iu;
/** Closing marks a sentence's stop may have after it. */
const CLOSERS = new Set(["\"", "'", "”", "’"]);

/** The positions of each "(" that never closes, ")" without an open one left alone. */
function unclosed(text: string): number[] {
  const open: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "(") open.push(index);
    else if (text[index] === ")") open.pop();
  }
  return open;
}

/**
 * Where each sentence of `text` ends: the index just past its stop and any
 * closing quote, where a space or the end follows. Never inside parentheses
 * that close (one that never closes, at a position in `open`, does not count),
 * nor after an abbreviation; at a semicolon too with `clauses`.
 */
function ends(text: string, clauses: boolean, open: ReadonlySet<number>): number[] {
  const found: number[] = [];
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (char === "(" && !open.has(index)) depth += 1;
    else if (char === ")" && depth > 0) depth -= 1;
    if (depth > 0 || !(char === "." || char === "!" || char === "?" || (clauses && char === ";"))) continue;
    let end = index + 1;
    while (end < text.length && CLOSERS.has(text[end]!)) end += 1;
    if (end < text.length && text[end] !== " ") continue;
    if (char === "." && abbreviation(text, index, end)) continue;
    found.push(end);
  }
  return found;
}

/** True when the word ending in the full stop at `index` is an abbreviation that does not end the sentence there. */
function abbreviation(text: string, index: number, end: number): boolean {
  const word = text.slice(text.lastIndexOf(" ", index) + 1, index + 1);
  if (NEVER_ENDS.test(word)) return true;
  return ETC.test(word) && /^\s*[^\s\p{Lu}]/u.test(text.slice(end));
}

/**
 * `text` without each aside it opens and never closes: from the "(" to where
 * that sentence ends, or to the end of the text, its stop kept. A sentence the
 * cut left with no stop of its own is given one.
 */
function withoutUnclosed(text: string, clauses: boolean): string {
  let kept = text;
  // The first such aside each time: leaving it out may take later ones with it.
  for (let open = unclosed(kept); open.length; open = unclosed(kept)) {
    const at = open[0]!;
    const stop = ends(kept, clauses, new Set(open)).find((end) => end > at);
    const head = kept.slice(0, at).replace(/[\s,;:–—-]+$/u, "");
    kept = stop === undefined ? closed(head) : `${head}${kept.slice(stopMark(kept, stop))}`;
  }
  return kept;
}

/** Where the stop that ends at `end` starts: its full stop and any closing quote after it. */
function stopMark(text: string, end: number): number {
  let at = end - 1;
  while (at > 0 && CLOSERS.has(text[at]!)) at -= 1;
  return at;
}

/** A sentence with a stop at its end, unless it already has one or is empty. */
function closed(text: string): string {
  return !text || /[.!?;]["'”’)]*$/u.test(text) ? text : `${text}.`;
}

/**
 * The sentences of `text`, whitespace collapsed, each with its own stop. A
 * sentence ends at ".", "!" or "?" followed by a space or the end, and with
 * `clauses` at ";" too (kept on the clause it ends). It never ends after an
 * abbreviation ("e.g.", "i.e.", "vs.", "cf.", and "etc." unless a capital
 * follows) or inside parentheses; an aside opened and never closed -- a text
 * cut to fit, or a model's slip -- is left out to where its sentence ends.
 */
export function activityActionSentences(text: string, options: { clauses?: boolean } = {}): string[] {
  const clauses = options.clauses === true;
  const collapsed = withoutUnclosed(text.replace(/\s+/gu, " ").trim(), clauses);
  const sentences: string[] = [];
  let from = 0;
  for (const end of [...ends(collapsed, clauses, new Set()), collapsed.length]) {
    const sentence = collapsed.slice(from, end).trim();
    if (sentence) sentences.push(sentence);
    from = end;
  }
  return sentences;
}
