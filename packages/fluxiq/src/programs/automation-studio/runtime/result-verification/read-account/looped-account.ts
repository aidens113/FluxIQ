// One account for a read whose step ran as the passes of a loop, added up from
// each pass's own (read-list design 5.2, the contract on
// `AutomationStudioResultReadAccount.keptPerPage`).
//
// Each pass reads one page, so the last pass alone says one page and its rows:
// a judge shown it would read a 13-row answer as a read that kept 2. So the
// pages, the items seen, the rows kept and each condition's counts add up every
// pass, the rows a condition left out by itself are every pass's, in pass
// order, and `keptPerPage` keeps what each pass kept. `stop` is how the loop
// ended and `pageLimit` the loop's own bound, where the Flow authored one.

import type { AutomationStudioResultReadAccount } from "../contracts.ts";

type Condition = NonNullable<AutomationStudioResultReadAccount["conditions"]>[number];

export type AutomationStudioResultReadLoopedAccountInput = {
  /** Each pass's own account, in pass order. At least one. */
  passes: readonly AutomationStudioResultReadAccount[];
  /** How many attempts of the step reported a read, retries included. */
  attempts: number;
  /** How the loop ended, where the run showed it. */
  stop?: "ended" | "bound" | "failed" | undefined;
  /** The loop's authored most passes, where the Flow states it. */
  pageLimit?: number | undefined;
};

/** The account of every pass, as one read. */
export function automationStudioResultReadLoopedAccount(input: AutomationStudioResultReadLoopedAccountInput): AutomationStudioResultReadAccount {
  const { passes } = input;
  const first = passes[0]!;
  const itemsSeen = sum(passes.map((pass) => pass.itemsSeen));
  const earlierPageRepeats = sum(passes.map((pass) => pass.earlierPageRepeats));
  const conditions = mergedConditions(passes);
  return {
    nodeId: first.nodeId,
    definitionId: first.definitionId,
    pagesRead: passes.reduce((total, pass) => total + pass.pagesRead, 0),
    ...(input.pageLimit !== undefined ? { pageLimit: input.pageLimit } : {}),
    ...(input.stop ? { stop: input.stop } : {}),
    truncated: passes.some((pass) => pass.truncated),
    ...(itemsSeen !== undefined ? { itemsSeen } : {}),
    kept: passes.reduce((total, pass) => total + pass.kept, 0),
    paginates: true,
    ...(first.dedupes !== undefined ? { dedupes: first.dedupes } : {}),
    ...(first.dedupeBy?.length ? { dedupeBy: [...first.dedupeBy] } : {}),
    ...(passes.some((pass) => pass.dropsEarlierPageRepeats) ? { dropsEarlierPageRepeats: true as const } : {}),
    ...(earlierPageRepeats !== undefined ? { earlierPageRepeats } : {}),
    ...(conditions.length ? { conditions } : {}),
    ...(passes.some((pass) => pass.unfiltered) ? { unfiltered: true } : {}),
    ...(input.attempts > 1 ? { attempts: input.attempts } : {}),
    keptPerPage: passes.map((pass) => pass.kept)
  };
}

/** Each condition, by position, with every pass's counts added and every pass's left-out rows in pass order. */
function mergedConditions(passes: readonly AutomationStudioResultReadAccount[]): Condition[] {
  const total = Math.max(0, ...passes.map((pass) => pass.conditions?.length ?? 0));
  const merged: Condition[] = [];
  for (let index = 0; index < total; index += 1) {
    const each = passes.map((pass) => pass.conditions?.[index]).filter((entry): entry is Condition => entry !== undefined);
    const condition = each.find((entry) => entry.condition !== undefined)?.condition;
    const rejected = sum(each.map((entry) => entry.rejected));
    const alone = sum(each.map((entry) => entry.alone));
    const leftOut = each.flatMap((entry) => entry.leftOutOnlyByThis ?? []);
    const withRows = each.filter((entry) => entry.leftOutOnlyByThis?.length);
    merged.push({
      ...(condition !== undefined ? { condition } : {}),
      ...(rejected !== undefined ? { rejected } : {}),
      ...(alone !== undefined && (rejected === undefined || alone <= rejected) ? { alone } : {}),
      ...(leftOut.length ? { leftOutOnlyByThis: leftOut } : {}),
      ...(withRows.length && withRows.every((entry) => entry.testedLabel) ? { testedLabel: true as const } : {})
    });
  }
  return merged;
}

/** The sum of the counts given, or nothing when no pass gave one. */
function sum(values: ReadonlyArray<number | undefined>): number | undefined {
  const given = values.filter((value): value is number => value !== undefined);
  return given.length ? given.reduce((total, value) => total + value, 0) : undefined;
}
