// What a key press in the composer does. Enter sends; Shift+Enter is a new
// line; and nothing sends while an input method is composing, because there
// Enter confirms the characters being composed (Japanese, Chinese, Korean
// and others). Browsers say "composing" three ways, and each is honoured:
// `isComposing` on the event, the legacy `keyCode` 229 some fire for the
// Enter that ends a composition, and the composition events themselves,
// which the composer tracks as `composing`. No DOM.

/** The parts of a keydown this decides by. */
export type ComposerKey = { key: string; shiftKey: boolean; isComposing?: boolean; keyCode?: number };

/** `send` sends the message; `none` leaves the key to the textarea. */
export type ComposerKeyAction = "send" | "none";

/** What `event` does, given whether a composition is under way. */
export function composerKeyAction(event: ComposerKey, composing: boolean): ComposerKeyAction {
  if (event.key !== "Enter" || event.shiftKey) return "none";
  if (composing || event.isComposing === true || event.keyCode === 229) return "none";
  return "send";
}
