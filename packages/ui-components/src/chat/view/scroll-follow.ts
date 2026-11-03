// Whether a scrolled view is at its bottom, give or take a little: the rule
// the chat follows new content by. At the bottom, new content scrolls into
// view; scrolled up, the person is reading, so it stays put and "Jump to
// latest" shows instead.

/** What decides it; an element's own scroll properties fit. */
export type ScrollMetrics = { readonly scrollTop: number; readonly scrollHeight: number; readonly clientHeight: number };

/** How far from the very bottom still counts as at the bottom, in px. */
export const FOLLOW_SLACK_PX = 32;

/** True when `metrics` show the view at (or within `slack` of) its bottom. */
export function isAtBottom(metrics: ScrollMetrics, slack = FOLLOW_SLACK_PX): boolean {
  return metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight <= slack;
}
