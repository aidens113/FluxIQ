// What a host may change about the composer. Absent, the box has no length
// limit or hint, keeps its draft in this page's storage, and its send button
// says "Send (Enter)".

export type ChatComposerOptions = {
  /** The most characters the box takes. */
  maxLength?: number;
  /** Under this many characters left, "N characters left." shows under the box (needs `maxLength`). */
  remainingHintBelow?: number;
  /** False: the draft is kept in memory only, never in the page's storage. */
  keepDraft?: boolean;
  /** Said on hover over the send button. */
  sendHint?: string;
};
