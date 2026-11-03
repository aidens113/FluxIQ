// Brings a turn to the top of the transcript by moving the transcript's own
// scroll, never the page's. `scrollIntoView` would also scroll every scroller
// around it: the chat sits in a floating window over the host's page, and the
// page behind would move as well. The distance is measured between the two
// boxes, so it holds wherever the scroller sits in the layout.

/** Scrolls `scroller` so `target` is at its top edge; a turn not on screen is left alone. */
export function showTurn(scroller: HTMLElement, target: HTMLElement | undefined): void {
  if (target === undefined) return;
  scroller.scrollTop += target.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
}
