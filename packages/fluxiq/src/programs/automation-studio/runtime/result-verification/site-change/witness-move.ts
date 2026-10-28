import type { AutomationStudioRunResultSummary } from "../contracts/index.ts";
import { automationStudioResultLineMoves, type AutomationStudioResultLineMove } from "./line-moves.ts";

type Witness = NonNullable<AutomationStudioRunResultSummary["siteChange"]>["witnesses"][number];

/**
 * A list witness's whole move from just before a trial to just after it
 * (t775): each row added +1, each row removed -1, and each changed row the
 * move its one differing whole number shows (`./line-moves.ts`). `total` is
 * their sum; `words` says it in Core's words.
 */
export type AutomationStudioResultWitnessMove = { added: number; removed: number; moves: AutomationStudioResultLineMove[]; total: number; words: string };

/** How many moved lines the words quote at most. */
const QUOTED = 3;

/**
 * The move a witness shows, where Core can read all of it; nothing where it
 * cannot: a control place (its states' direction cannot be told), a side not
 * read, no change, or a changed row whose lines do not read as one whole
 * number moved (every changed row must pair with exactly one move).
 */
export function automationStudioResultWitnessMove(witness: Witness): AutomationStudioResultWitnessMove | undefined {
  const change = witness.change;
  if (typeof change !== "object" || !("added" in change)) return undefined;
  const moves = automationStudioResultLineMoves(change.lines);
  if (!moves || moves.length !== change.changed) return undefined;
  const total = change.added - change.removed + moves.reduce((sum, move) => sum + move.by, 0);
  return { added: change.added, removed: change.removed, moves, total, words: words(change.added, change.removed, moves, total) };
}

function words(added: number, removed: number, moves: readonly AutomationStudioResultLineMove[], total: number): string {
  if (!moves.length) {
    if (!removed) return `${rows(added)} added, none removed or changed`;
    if (!added) return `${rows(removed)} removed, none added or changed`;
    return `${rows(added)} added and ${removed} removed, none changed`;
  }
  const whole = !added && !removed ? "no row added or removed" : `${rows(added)} added and ${removed} removed`;
  const quoted = moves.slice(0, QUOTED).map((move) => `"${move.gone}" became "${move.added}" (${signed(move.by)})`).join(", ");
  const more = moves.length > QUOTED ? `, and ${moves.length - QUOTED} more` : "";
  return `${whole}; ${rows(moves.length)} changed with only one whole number moved: ${quoted}${more}; a move of ${signed(total)} in all`;
}

function rows(count: number): string {
  return `${count} row${count === 1 ? "" : "s"}`;
}

function signed(by: number): string {
  return by > 0 ? `+${by}` : String(by);
}
