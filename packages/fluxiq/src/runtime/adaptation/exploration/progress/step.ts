export type AutomationStudioExplorationProgressStep = {
  /** What the step did and with what, independent of call id. */
  signature: string;
  /** A digest of what came back, so a repeat is recognised by content. */
  evidenceDigest: string;
  /** Bytes of evidence the step actually carried. Zero is not an answer. */
  evidenceBytes: number;
  /** Whether the domain refused it. A refusal never counts as progress. */
  refused: boolean;
};
