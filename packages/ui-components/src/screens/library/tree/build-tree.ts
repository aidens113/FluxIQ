import type { SubflowCard } from "../types.ts";
import { distinctBelow } from "./distinct-below.ts";
import { siteHosts } from "./site-hosts.ts";
import type { LibraryTreeNode, LibrarySite } from "./tree-types.ts";

/** Deep enough for any real library; a deeper chain stops here rather than grow without end. */
const MAX_DEPTH = 12;

/**
 * Groups the subflows by site host. Under a site: the subflows nothing listed calls, and under each, what it
 * calls, recursively. A subflow called by another shows under its caller. A cycle, or a group of subflows that
 * only call each other, never hangs and never drops one: the first of them not yet shown becomes a top-level
 * row, and a call back up its own path is a row that is not opened again. A call to something not listed is a
 * row with no card.
 */
export function buildTree(cards: readonly SubflowCard[]): LibrarySite[] {
  const byId = new Map<string, SubflowCard>();
  for (const card of cards) {
    const known = byId.get(card.partId);
    if (known === undefined || known.version < card.version) byId.set(card.partId, card);
  }
  const listed = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  const called = new Set(listed.flatMap((card) => card.calls.map((call) => call.partId).filter((id) => id !== card.partId)));
  const roots = listed.filter((card) => !called.has(card.partId));
  const shown = new Set<string>();

  const open = (card: SubflowCard, path: readonly string[], parentKey: string): LibraryTreeNode => {
    const key = `${parentKey}/${card.partId}`;
    shown.add(card.partId);
    const below = new Set<string>();
    const children: LibraryTreeNode[] = [];
    for (const partId of new Set(card.calls.map((call) => call.partId))) {
      if (partId === card.partId) continue;
      const callee = byId.get(partId);
      if (callee === undefined) {
        children.push({ key: `${key}/${partId}`, partId, card: undefined, children: [], uses: 0, repeat: false, matched: true });
        continue;
      }
      below.add(partId);
      if (path.includes(partId) || path.length >= MAX_DEPTH) {
        children.push({ key: `${key}/${partId}`, partId, card: callee, children: [], uses: 0, repeat: true, matched: true });
        continue;
      }
      const child = open(callee, [...path, card.partId], key);
      children.push(child);
      for (const id of distinctBelow(child)) below.add(id);
    }
    below.delete(card.partId);
    return { key, partId: card.partId, card, children, uses: below.size, repeat: false, matched: true };
  };

  const top: LibraryTreeNode[] = [];
  const addRoot = (card: SubflowCard): void => {
    top.push(open(card, [], "site"));
  };
  roots.forEach(addRoot);
  for (const card of listed) if (!shown.has(card.partId)) addRoot(card);

  const sites = new Map<string, LibraryTreeNode[]>();
  for (const node of top) {
    for (const host of siteHosts(node.card!)) sites.set(host, [...(sites.get(host) ?? []), node]);
  }
  return [...sites.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([host, nodes]) => ({ host, nodes, count: new Set(nodes.flatMap(distinctBelow)).size }));
}

