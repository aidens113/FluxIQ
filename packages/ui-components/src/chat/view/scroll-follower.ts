// Keeps the chat pinned to its newest content while the person is at the
// bottom (`isAtBottom`), and lets go the moment they scroll up. Following is
// decided by the person's own scrolling, not by the content: content that
// grows below a reader never pulls them down, and "Jump to latest" shows for
// as long as they are away from the bottom.
//
// Only the person ends following: a scroll that left the view off the bottom
// while they were turning the wheel, touching, pressing a scroll key or
// dragging the scroll bar. Every other scroll is the browser's. It fires for
// the follower's own `scrollTop` write (and content can grow before that
// event is dispatched), and Chrome's scroll anchoring moves the view on its
// own when content above the top line changes size: a card above shrinking
// while the newest grows keeps the content's height, so no ResizeObserver
// fires, and anchoring moves the view up off the bottom. Treating that as the
// person parked the chat above the hand-off question and the build's ending
// (D16, run musq0b1m). After a scroll that is not the person's, a follower
// goes back down. Content that grows in place (a card's status changing, a
// line replaced) is followed through a ResizeObserver on the scrolled content.
//
// While the chat is empty its welcome is all there is, and it is read from its
// top: `rest(true)` holds the view there, and nothing pins it to the bottom or
// shows "Jump to latest" until `rest(false)`, when following starts from the
// bottom. Pinned while empty, a welcome taller than the view opened scrolled,
// with its title cut off at the top (round 5).

import { isAtBottom } from "./scroll-follow.ts";

/** How long after a wheel turn, touch or scroll key a scroll is still the person's (a smooth scroll runs on), in ms. */
export const PERSON_SCROLL_MS = 1_000;

// Keys that scroll a view; the same keys typed into a field do not.
const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]);

type Listen = (type: string, listener: (event: Event) => void, options?: { passive?: boolean }) => void;

/** What the follower needs of the scrolled element. */
export type ScrollHost = {
  scrollTop: number;
  readonly scrollHeight: number;
  readonly clientHeight: number;
  /** Hears "scroll" and the person's input: "wheel", "touchmove", "keydown", "pointerdown", "pointerup", "pointercancel". */
  addEventListener: Listen;
  /** Where key presses and a drag's release outside the view are heard, when there is one. */
  readonly ownerDocument?: { addEventListener: Listen } | null;
};

export type ScrollFollower = {
  /** Call after new content is on screen: follows it when the person was at the bottom. */
  contentChanged(): void;
  /** Goes to the bottom and follows from there (a send, or "Jump to latest"). */
  followNow(): void;
  /** Re-reads the position after something the person did changed the height. */
  recheck(): void;
  /** True holds the view at its top (an empty chat's welcome); false follows from the bottom again. `followNow` while resting goes to the top. */
  rest(atTop: boolean): void;
  following(): boolean;
};

/**
 * Follows `host`; `showJump` is told whether "Jump to latest" should show.
 * `content`, the element inside `host` that holds the conversation, is
 * watched for growth where the browser has a ResizeObserver.
 */
export function createScrollFollower(host: ScrollHost, showJump: (show: boolean) => void, content?: Element): ScrollFollower {
  let following = true;
  let lastTop = host.scrollTop;
  let jump = false;
  let resting = false;
  const setJump = (next: boolean): void => {
    if (next === jump) return;
    jump = next;
    showJump(next);
  };
  const toBottom = (): void => {
    host.scrollTop = host.scrollHeight;
    lastTop = host.scrollTop;
  };
  const contentChanged = (): void => {
    if (resting) return setJump(false);
    if (following) toBottom();
    setJump(!following && !isAtBottom(host));
  };
  // The person's own input, which alone can end following.
  let personAt = Number.NEGATIVE_INFINITY;
  let dragging = false;
  const person = (): boolean => dragging || Date.now() - personAt <= PERSON_SCROLL_MS;
  const touched = (): void => { personAt = Date.now(); };
  const key = (event: Event): void => {
    const target = event.target as { tagName?: string; isContentEditable?: boolean } | null | undefined;
    const typing = target?.isContentEditable === true || target?.tagName === "TEXTAREA" || target?.tagName === "INPUT" || target?.tagName === "SELECT";
    if (!typing && SCROLL_KEYS.has((event as { key?: string }).key ?? "")) touched();
  };
  const released = (): void => {
    if (!dragging) return;
    dragging = false;
    touched();
  };
  host.addEventListener("wheel", touched, { passive: true });
  host.addEventListener("touchmove", touched, { passive: true });
  host.addEventListener("keydown", key);
  // The scroll bar is the scrolled element's own; a press on what it holds (a card's button) is not scrolling.
  host.addEventListener("pointerdown", (event) => { if (event.target === (host as unknown)) dragging = true; }, { passive: true });
  host.addEventListener("pointerup", released, { passive: true });
  host.addEventListener("pointercancel", released, { passive: true });
  const page = host.ownerDocument;
  if (page) {
    page.addEventListener("keydown", key);
    page.addEventListener("pointerup", released, { passive: true });
    page.addEventListener("pointercancel", released, { passive: true });
  }
  host.addEventListener("scroll", () => {
    if (resting) {
      lastTop = host.scrollTop;
      return setJump(false);
    }
    const top = host.scrollTop;
    const moved = Math.abs(top - lastTop) >= 1;
    lastTop = top;
    if (isAtBottom(host)) following = true;
    else if (moved && person()) following = false;
    else if (following) toBottom();
    setJump(!following);
  }, { passive: true });
  if (content && typeof ResizeObserver !== "undefined") new ResizeObserver(contentChanged).observe(content);
  return {
    contentChanged,
    followNow() {
      following = true;
      // A welcome's start is its top.
      if (resting) host.scrollTop = 0; else toBottom();
      lastTop = host.scrollTop;
      setJump(false);
    },
    recheck() {
      if (resting) return setJump(false);
      lastTop = host.scrollTop;
      following = isAtBottom(host);
      setJump(!following);
    },
    rest(atTop) {
      if (atTop === resting) return;
      resting = atTop;
      following = true;
      if (atTop) {
        host.scrollTop = 0;
        lastTop = host.scrollTop;
      } else if (following) toBottom();
      setJump(false);
    },
    following: () => following
  };
}
