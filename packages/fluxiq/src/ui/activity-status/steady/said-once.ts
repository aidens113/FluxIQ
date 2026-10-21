// A sentence said once (t753). A cause put together from two sources can say
// the same thing twice, one clause or sentence after another: the status line
// read "Build failed: FluxIQ could not finish the Flow: I could not finish
// this." A later clause or sentence whose words an earlier one already holds
// says nothing new, so it is dropped; one that adds anything stays. Pure.

/** Words that carry no meaning of their own when two clauses are compared. */
const FILLER: ReadonlySet<string> = new Set(["i", "me", "my", "we", "it", "its", "this", "that", "these", "those", "the", "a", "an", "your", "you", "to", "of", "so", "and", "is", "was", "be"]);
/** A clause needs at least this many words of its own to be judged a repeat: "no" alone is no repeat of anything. */
const MIN_WORDS = 2;
const END = /[.!?…]+$/u;
/** Where one clause ends and the next begins: a colon, or a sentence's end. */
const BREAK = /(:\s+|(?<=[.!?…])\s+)/u;

/** `text` with every clause or sentence after the first that only repeats an earlier one left out; its closing mark kept. */
export function activitySaidOnce(text: string): string {
  // Clauses at even places, the breaks between them at odd ones.
  const parts = text.split(BREAK);
  if (parts.length < 3) return text;
  const heard = new Set<string>();
  let said = "";
  let dropped = false;
  for (let at = 0; at < parts.length; at += 2) {
    const clause = parts[at]!;
    const words = wordsOf(clause);
    if (at > 0 && words.length >= MIN_WORDS && words.every((word) => heard.has(word))) {
      dropped = true;
      continue;
    }
    for (const word of words) heard.add(word);
    said += `${at > 0 ? parts[at - 1]! : ""}${clause}`;
  }
  if (!dropped) return text;
  const end = END.exec(text.trimEnd())?.[0] ?? "";
  const kept = said.trimEnd();
  return END.test(kept) ? kept : `${kept}${end}`;
}

function wordsOf(clause: string): string[] {
  return clause
    .toLowerCase()
    .replace(/n['’]t\b/gu, " not")
    .replace(/\bcannot\b/gu, "can not")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== "" && !FILLER.has(word));
}
