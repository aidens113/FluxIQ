// What a structural repair is, once read: which parts of a Flow were added,
// removed or changed. Core builds it; the chat draws it (`draw.ts`).

export type GraphDiffEntry = { id: string; label: string; detail: string | null };

export type FlowGraphDiff = {
  flowId: string | null;
  added: GraphDiffEntry[];
  removed: GraphDiffEntry[];
  changed: GraphDiffEntry[];
};
