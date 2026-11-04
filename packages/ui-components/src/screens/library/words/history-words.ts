import type { SubflowCard } from "../types.ts";
import { failureWords } from "./failure-words.ts";

const times = (count: number): string => (count === 1 ? "once" : `${count} times`);

/** How it has gone, as short plain lines. Empty when nothing has happened yet. */
export function historyWords(card: SubflowCard, now: number): string[] {
  const { judgedYes, zeroModelRuns, failures } = card.trust.counts;
  const lines: string[] = [];
  if (judgedYes > 0) lines.push(`Worked ${times(judgedYes)} when it was checked.`);
  if (zeroModelRuns > 0) lines.push(`Ran ${times(zeroModelRuns)} on its own since it last failed.`);
  if (failures > 0) {
    const day = failureWords(card, now);
    lines.push(`Failed ${times(failures)}${day === undefined ? "" : `. ${day}`}.`);
  }
  return lines;
}
