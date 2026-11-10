/**
 * Something the outline cannot show as plain nesting. The words are for a
 * person; the graph view (Advanced) shows the part as it is.
 */
export type OutlineIssue = {
  code: "unstructured" | "several-entries" | "unreached";
  words: string;
  /** The step that carries it, when one does. */
  step?: string;
  nodeIds: string[];
};
