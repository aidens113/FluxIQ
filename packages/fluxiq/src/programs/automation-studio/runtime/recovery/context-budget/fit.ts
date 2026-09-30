// Fitting a built `recoveryContext` into its byte budget.
//
// It used to be one loop: drop the lowest-priority section whole, re-measure,
// repeat. That is right for the tail of the list and wrong for its head, and
// live run `run-munnhi5q-4867dabe` (2026-09-29) is what it cost. A refuted
// result's failure record (3.3 KB, carrying the judge's directive), an
// eleven-node graph (5.1 KB) and its step chain (5.0 KB) came to 15.5 KB against
// 8,000 bytes. The loop dropped the tail, then the step chain, and then -- since
// the failure and the graph together still did not fit -- the graph as well:
// the diagnosis was asked to repair a wrong filter from the failure record
// alone. No section was oversized; every one was dropped for want of a way to
// make it smaller.
//
// So there are three phases, and the first is the old loop unchanged:
//
// 1. Sections outside `AUTOMATION_STUDIO_RECOVERY_CONTEXT_ESSENTIAL_SECTIONS`
//    are dropped whole, lowest priority first, until the context fits.
// 2. If it still does not, every essential section's lossless rungs are applied
//    (`lossless-levels.ts`), and then the *largest* essential section is trimmed
//    one rung down its ladder (`section-trim.ts`), and the context re-measured,
//    until it fits or no essential section has a rung left. Largest first, so
//    the cost falls on whichever section is spending the budget rather than on
//    whichever is lowest in the list.
// 3. Only then are essential sections dropped whole, lowest priority first --
//    the last resort that keeps the old guarantee: the context ends inside its
//    budget whenever dropping sections can get it there.
//
// Dropped sections therefore stay a suffix of the priority list, as the
// contract says. A trimmed section says so twice: `trimmedToFit` inside it, for
// the model, and `trimmedFromByteCount` on its `included` entry, for whoever
// reads the run.

import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioWithoutLocators } from "../../llm/harness/index.ts";
import type { AutomationStudioRecoveryContextSection, AutomationStudioRuntimeRecoveryContext } from "../context.ts";
import { AUTOMATION_STUDIO_RECOVERY_CONTEXT_ESSENTIAL_SECTIONS } from "./essential-sections.ts";
import { AUTOMATION_STUDIO_RECOVERY_LOSSLESS_TRIM_LEVELS } from "./lossless-levels.ts";
import { automationStudioRecoverySectionAtTrimLevel } from "./section-trim.ts";

type IncludedEntry = AutomationStudioRuntimeRecoveryContext["included"][number];

export function fitAutomationStudioRecoveryContextToBudget(
  context: AutomationStudioRuntimeRecoveryContext,
  order: readonly AutomationStudioRecoveryContextSection[],
  failedNodeId: string | undefined
): void {
  const essential = AUTOMATION_STUDIO_RECOVERY_CONTEXT_ESSENTIAL_SECTIONS;
  const over = () => {
    context.byteCount = byteCount(context);
    return context.byteCount > context.byteBudget;
  };
  // Phase 1: the tail goes whole, lowest priority first, as it always did.
  while (over() && context.included.length && !essential.has(context.included.at(-1)!.section)) drop(context);
  // Phase 2: first every essential section's lossless rungs, then the largest
  // essential section one lossy rung at a time.
  const built = new Map<AutomationStudioRecoveryContextSection, JsonObject>();
  const levels = new Map<AutomationStudioRecoveryContextSection, number>();
  const exhausted = new Set<AutomationStudioRecoveryContextSection>();
  /** Puts `entry` at `level` of its ladder (0 is the section as built); false when the ladder has no such rung. */
  const trimTo = (entry: IncludedEntry, level: number): boolean => {
    const original = built.get(entry.section) ?? context.sections[entry.section]!;
    built.set(entry.section, original);
    if (level === 0) {
      context.sections[entry.section] = original;
      entry.byteCount = entry.trimmedFromByteCount ?? entry.byteCount;
      delete entry.trimmedFromByteCount;
      levels.set(entry.section, 0);
      return true;
    }
    const trimmed = automationStudioRecoverySectionAtTrimLevel(entry.section, original, level, failedNodeId);
    if (!trimmed) return false;
    // Screened again: shortening a sentence must not be a way to leave one
    // shaped like a locator, and the request check refuses any that is.
    const screened = automationStudioWithoutLocators(trimmed);
    context.sections[entry.section] = screened;
    entry.trimmedFromByteCount ??= entry.byteCount;
    entry.byteCount = byteCount(screened);
    levels.set(entry.section, level);
    return true;
  };
  for (const entry of context.included) {
    const lossless = AUTOMATION_STUDIO_RECOVERY_LOSSLESS_TRIM_LEVELS[entry.section] ?? 0;
    if (lossless > 0 && essential.has(entry.section) && over()) trimTo(entry, lossless);
  }
  while (over()) {
    const entry = context.included
      .filter((candidate) => essential.has(candidate.section) && !exhausted.has(candidate.section))
      .reduce<IncludedEntry | undefined>((largest, candidate) => !largest || candidate.byteCount >= largest.byteCount ? candidate : largest, undefined);
    if (!entry) break;
    if (!trimTo(entry, (levels.get(entry.section) ?? 0) + 1)) exhausted.add(entry.section);
  }
  // Relaxation: rungs are coarse and largest-first overshoots, so once the
  // context fits, each trimmed section, in priority order, is stepped back up
  // one rung at a time for as long as the context still fits. Measured on
  // `run-munnhi5q-4867dabe`'s shape at 9,000 bytes, this is the difference
  // between 834 bytes of the budget left unspent and the neighbouring
  // extraction's parameters reaching the repair.
  if (!over()) {
    for (const entry of context.included) {
      const current = levels.get(entry.section) ?? 0;
      // Never back below a lossless rung: that would spend bytes on a copy.
      const floor = Math.min(current, AUTOMATION_STUDIO_RECOVERY_LOSSLESS_TRIM_LEVELS[entry.section] ?? 0);
      for (let level = current - 1; level >= floor; level -= 1) {
        const kept = { level: levels.get(entry.section)!, value: context.sections[entry.section]!, byteCount: entry.byteCount, trimmedFromByteCount: entry.trimmedFromByteCount };
        trimTo(entry, level);
        if (!over()) continue;
        context.sections[entry.section] = kept.value;
        entry.byteCount = kept.byteCount;
        if (kept.trimmedFromByteCount !== undefined) entry.trimmedFromByteCount = kept.trimmedFromByteCount;
        levels.set(entry.section, kept.level);
        break;
      }
    }
  }
  // Phase 3: the last resort, lowest priority first.
  while (over() && context.included.length) drop(context);
  context.omitted.sort((left, right) => order.indexOf(left.section) - order.indexOf(right.section));
  context.byteCount = byteCount(context);
}

/** Drops the lowest-priority included section, recording what it would have cost before any trim. */
function drop(context: AutomationStudioRuntimeRecoveryContext): void {
  const dropped = context.included.pop()!;
  delete context.sections[dropped.section];
  context.omitted.push({ section: dropped.section, reason: "byte_budget", byteCount: dropped.trimmedFromByteCount ?? dropped.byteCount });
}

function byteCount(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value) ?? "", "utf8");
}
