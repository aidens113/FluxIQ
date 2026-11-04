import { cardMatches } from "./card-matches.ts";
import { distinctBelow } from "./distinct-below.ts";
import type { LibrarySite, LibraryTreeNode } from "./tree-types.ts";

/** What a search leaves: the sites and rows that remain, and how many different subflows matched. */
export type LibraryFilter = { sites: LibrarySite[]; matches: number };

/**
 * Keeps every row that matches and the path down to it, so a match is never shown without what it sits under.
 * A row kept only for the match beneath it is marked `matched: false`. No text keeps everything.
 */
export function filterTree(sites: readonly LibrarySite[], text: string): LibraryFilter {
  if (text.trim() === "") return { sites: [...sites], matches: sites.flatMap((site) => site.nodes.flatMap(distinctBelow)).filter((id, at, all) => all.indexOf(id) === at).length };
  const matched = new Set<string>();
  const keep = (node: LibraryTreeNode): LibraryTreeNode | undefined => {
    const children = node.children.map(keep).filter((child): child is LibraryTreeNode => child !== undefined);
    const self = node.card !== undefined && cardMatches(node.card, text);
    if (self) matched.add(node.partId);
    if (!self && children.length === 0) return undefined;
    return { ...node, children, matched: self };
  };
  const kept = sites
    .map((site) => {
      const nodes = site.nodes.map(keep).filter((node): node is LibraryTreeNode => node !== undefined);
      return { host: site.host, nodes, count: new Set(nodes.flatMap(distinctBelow)).size };
    })
    .filter((site) => site.nodes.length > 0);
  return { sites: kept, matches: matched.size };
}
