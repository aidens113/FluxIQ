// The library as a tree: sites, the subflows on each, and under each what it calls.
import type { SubflowCard } from "../types.ts";

/** One row. `card` is absent for a call to a subflow that is not in the list; `repeat` marks one already above it on its path. */
export type LibraryTreeNode = {
  /** Unique among the rows: the path to it. */
  key: string;
  partId: string;
  card: SubflowCard | undefined;
  children: LibraryTreeNode[];
  /** How many different listed subflows it calls, at any depth. */
  uses: number;
  repeat: boolean;
  /** False for a row kept only because a match lies beneath it. */
  matched: boolean;
};

/** The subflows of one site. */
export type LibrarySite = { host: string; nodes: LibraryTreeNode[]; count: number };
