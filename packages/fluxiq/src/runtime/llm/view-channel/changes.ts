// What changed on a page between two views of it, git-style, by line key (D1, P-b).
//
// Lines are matched by key only. A key in both views, in the same relative
// order, is the same line: unchanged when its text is equal, `~ ` with its new
// text when not. A key only in the earlier view left (`- ` with its old text),
// one only in the later view arrived (`+ `), and a line whose key moved out of
// order reads as leaving where it was and arriving where it is. The order kept
// is the longest run of common keys already in order, so the fewest lines are
// told as moved. Each group of changes opens with the unchanged line just
// before it (`  ` and its text), so the model can place it; a group at the very
// top has none. No text is parsed: texts are only compared for equality.

import type { AutomationStudioLlmPageLine } from "./line.ts";

type Step = { kind: "same" | "gone" | "new" | "now"; text: string };

const MARK: Readonly<Record<Exclude<Step["kind"], "same">, string>> = { gone: "- ", new: "+ ", now: "~ " };

/** The change lines from `before` to `after`, empty when nothing changed. Keys must be unique within each view. */
export function automationStudioLlmPageChanges(before: readonly AutomationStudioLlmPageLine[], after: readonly AutomationStudioLlmPageLine[]): string[] {
  const steps = aligned(before, after);
  const out: string[] = [];
  let lastSame: string | undefined;
  let inGroup = false;
  for (const step of steps) {
    if (step.kind === "same") {
      inGroup = false;
      lastSame = step.text;
      continue;
    }
    if (!inGroup && lastSame !== undefined) out.push(`  ${lastSame}`);
    inGroup = true;
    out.push(`${MARK[step.kind]}${step.text}`);
  }
  return out;
}

function aligned(before: readonly AutomationStudioLlmPageLine[], after: readonly AutomationStudioLlmPageLine[]): Step[] {
  const oldIndex = new Map(before.map((line, index) => [line.key, index]));
  const common: Array<{ next: number; old: number }> = [];
  after.forEach((line, next) => {
    const old = oldIndex.get(line.key);
    if (old !== undefined) common.push({ next, old });
  });
  const kept = increasingRun(common);
  const keptOld = new Set(kept.map((pair) => pair.old));
  const keptNew = new Set(kept.map((pair) => pair.next));
  const steps: Step[] = [];
  let i = 0;
  let j = 0;
  while (i < before.length || j < after.length) {
    if (i < before.length && !keptOld.has(i)) {
      steps.push({ kind: "gone", text: before[i]!.text });
      i += 1;
      continue;
    }
    if (j < after.length && !keptNew.has(j)) {
      steps.push({ kind: "new", text: after[j]!.text });
      j += 1;
      continue;
    }
    const earlier = before[i]!;
    const later = after[j]!;
    steps.push({ kind: earlier.text === later.text ? "same" : "now", text: later.text });
    i += 1;
    j += 1;
  }
  return steps;
}

/** The longest run of `pairs` (in later-view order) whose earlier-view positions increase: patience order, O(n log n). */
function increasingRun(pairs: readonly { next: number; old: number }[]): Array<{ next: number; old: number }> {
  const tails: number[] = [];
  const previous: number[] = new Array<number>(pairs.length).fill(-1);
  pairs.forEach((pair, index) => {
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (pairs[tails[middle]!]!.old < pair.old) low = middle + 1;
      else high = middle;
    }
    if (low > 0) previous[index] = tails[low - 1]!;
    tails[low] = index;
  });
  const run: Array<{ next: number; old: number }> = [];
  for (let index = tails.length ? tails[tails.length - 1]! : -1; index !== -1; index = previous[index]!) run.push(pairs[index]!);
  return run.reverse();
}
