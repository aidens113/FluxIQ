// What the person has picked on the panel, for a message that says what is on screen.
// Every field is optional: a client sends the ones it knows, and never invents one.

/** The panel selection a message carries in `onScreen.selection`. */
export type ChatSelection = {
  projectId?: string;
  flowId?: string;
  stepNumbers?: readonly number[];
  nodeIds?: readonly string[];
  runId?: string;
  datasetId?: string;
  keyId?: string;
  folder?: string;
};
