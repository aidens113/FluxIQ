import type { AutomationStudioTrialSiteLines } from "../../flow-bootstrap/trial-change/index.ts";

/** One row's number move read from its lines: the line gone, the line added in its place, and by how much its one differing whole number moved. */
export type AutomationStudioResultLineMove = { gone: string; added: string; by: number };

/** A number as a page writes it: digits, with any `.` or `,` groups inside it, so a price or a grouped total is one token and never a whole number. */
const NUMBER = /(\d+(?:[.,]\d+)*)/u;
/** The packet's mark of a line cut to its length cap, and that cap (`../../flow-bootstrap/trial-change/packet.ts`): a page's own line ending in the mark is not cut. */
const CUT_MARK = "…";
const CUT_LENGTH = 200;

/**
 * The number moves a witness's readable lines show (t775): each pair of a gone
 * line and an added line that are identical except for exactly one whole
 * number is one row whose number moved by (after - before). Closed and
 * page-language-neutral: no word is read and no unit guessed, only text equal
 * character for character around one differing whole number.
 *
 * Lines that pair with no other are left alone (rows added or removed whole).
 * Nothing (no reading) where the lines were cut, where a line pairs with
 * several others by different moves, or where the pairs cannot be told apart
 * one to one. A line whose numbers differ in two places pairs with nothing.
 */
export function automationStudioResultLineMoves(lines: AutomationStudioTrialSiteLines | undefined): AutomationStudioResultLineMove[] | undefined {
  if (!lines) return [];
  if (lines.cut && (lines.cut.gone || lines.cut.added)) return undefined;
  if ([...lines.gone, ...lines.added].some((line) => line.length >= CUT_LENGTH && line.endsWith(CUT_MARK))) return undefined;
  const edges: Array<{ gone: number; added: number; by: number }> = [];
  lines.gone.forEach((gone, g) => lines.added.forEach((added, a) => {
    const by = oneNumberMoved(gone, added);
    if (by !== undefined) edges.push({ gone: g, added: a, by });
  }));
  // Lines joined by a pair are one group: every pair in a group must move by the same, and the group must pair one to one as far as it can.
  const group = groups(lines.gone.length, lines.added.length, edges);
  const moves: AutomationStudioResultLineMove[] = [];
  for (const members of group.values()) {
    const own = edges.filter((edge) => members.gone.has(edge.gone));
    if (new Set(own.map((edge) => edge.by)).size > 1) return undefined;
    const usedGone = new Set<number>();
    const usedAdded = new Set<number>();
    for (const edge of own) {
      if (usedGone.has(edge.gone) || usedAdded.has(edge.added)) continue;
      usedGone.add(edge.gone);
      usedAdded.add(edge.added);
      moves.push({ gone: lines.gone[edge.gone]!, added: lines.added[edge.added]!, by: edge.by });
    }
    if (usedGone.size !== Math.min(members.gone.size, members.added.size)) return undefined;
  }
  return moves;
}

/** (after - before) where the two lines are identical except for exactly one whole number; nothing otherwise. */
function oneNumberMoved(before: string, after: string): number | undefined {
  const from = before.split(NUMBER);
  const to = after.split(NUMBER);
  if (from.length !== to.length) return undefined;
  let moved: number | undefined;
  for (let index = 0; index < from.length; index += 1) {
    if (from[index] === to[index]) continue;
    // Odd indexes are numbers; any other difference is text, and text is never read.
    if (index % 2 === 0 || moved !== undefined) return undefined;
    if (!/^\d+$/u.test(from[index]!) || !/^\d+$/u.test(to[index]!)) return undefined;
    const by = Number(to[index]) - Number(from[index]);
    if (!Number.isSafeInteger(Number(to[index])) || !Number.isSafeInteger(Number(from[index])) || by === 0) return undefined;
    moved = by;
  }
  return moved;
}

type Group = { gone: Set<number>; added: Set<number> };

/** The groups of lines pairs join, by union of each pair's two lines; lines in no pair are in no group. */
function groups(goneCount: number, addedCount: number, edges: ReadonlyArray<{ gone: number; added: number }>): Map<number, Group> {
  const parent = Array.from({ length: goneCount + addedCount }, (_, index) => index);
  const root = (node: number): number => {
    while (parent[node] !== node) node = parent[node] = parent[parent[node]!]!;
    return node;
  };
  for (const edge of edges) parent[root(edge.gone)] = root(goneCount + edge.added);
  const out = new Map<number, Group>();
  for (const edge of edges) {
    const key = root(edge.gone);
    const members = out.get(key) ?? { gone: new Set<number>(), added: new Set<number>() };
    members.gone.add(edge.gone);
    members.added.add(edge.added);
    out.set(key, members);
  }
  return out;
}
