import type { SubflowCard } from "../types.ts";
import { dayWords } from "./day-words.ts";

/** A failure since, told plainly with its day ("Last failed 3 Nov"), or nothing when it has not failed. */
export function failureWords(card: SubflowCard, now: number): string | undefined {
  const { counts, lastFailureAtMs } = card.trust;
  if (counts.failures === 0 || lastFailureAtMs === undefined) return undefined;
  return `Last failed ${dayWords(lastFailureAtMs, now)}`;
}
