// Following new content: at the bottom it scrolls into view; scrolled up the
// view stays where the person put it and "Jump to latest" shows, until they
// come back down or press it.

import assert from "node:assert/strict";
import { test } from "vitest";
import { FOLLOW_SLACK_PX, isAtBottom } from "../scroll-follow.ts";
import { createScrollFollower, type ScrollHost } from "../scroll-follower.ts";

test("at the bottom means within the slack of the very end", () => {
  assert.equal(isAtBottom({ scrollTop: 600, scrollHeight: 1000, clientHeight: 400 }), true);
  assert.equal(isAtBottom({ scrollTop: 600 - FOLLOW_SLACK_PX, scrollHeight: 1000, clientHeight: 400 }), true);
  assert.equal(isAtBottom({ scrollTop: 600 - FOLLOW_SLACK_PX - 1, scrollHeight: 1000, clientHeight: 400 }), false);
  assert.equal(isAtBottom({ scrollTop: 0, scrollHeight: 300, clientHeight: 400 }), true, "content shorter than the view");
});

// A browser clamps `scrollTop` to the bottom; so does this host. `scroll` is
// the person scrolling (a wheel turn, then the scroll it causes); `shift` is
// the browser moving the view on its own (scroll anchoring, a clamp), with no
// input from the person.
function host(): ScrollHost & { scroll(to: number): void; shift(to: number): void; grow(by: number): void; bottom(): number } {
  const listeners = new Map<string, Array<(event: Event) => void>>();
  const fire = (type: string, event: object = {}) => { for (const next of listeners.get(type) ?? []) next(event as Event); };
  let top = 0;
  const made = {
    get scrollTop() {
      return top;
    },
    set scrollTop(to: number) {
      top = Math.max(0, Math.min(to, made.scrollHeight - made.clientHeight));
    },
    scrollHeight: 400,
    clientHeight: 400,
    addEventListener(type: string, next: (event: Event) => void) {
      listeners.set(type, [...(listeners.get(type) ?? []), next]);
    },
    scroll(to: number) {
      fire("wheel", { deltaY: to - top });
      made.scrollTop = to;
      fire("scroll");
    },
    shift(to: number) {
      made.scrollTop = to;
      fire("scroll");
    },
    grow(by: number) {
      made.scrollHeight += by;
    },
    bottom: () => made.scrollHeight - made.clientHeight
  };
  return made;
}

test("at the bottom, new content is followed and no jump button shows", () => {
  const view = host();
  const jumps: boolean[] = [];
  const follower = createScrollFollower(view, (show) => jumps.push(show));
  view.grow(300);
  follower.contentChanged();
  assert.equal(view.scrollTop, view.bottom());
  assert.deepEqual(jumps, []);
});

test("scrolled up, new content does not move the view and Jump to latest shows", () => {
  const view = host();
  const jumps: boolean[] = [];
  const follower = createScrollFollower(view, (show) => jumps.push(show));
  view.grow(600);
  follower.contentChanged();
  view.scroll(100);
  assert.equal(follower.following(), false);
  assert.deepEqual(jumps, [true]);
  view.grow(200);
  follower.contentChanged();
  assert.equal(view.scrollTop, 100);
  // Jump to latest goes down and follows again.
  follower.followNow();
  assert.equal(view.scrollTop, view.bottom());
  assert.equal(follower.following(), true);
  assert.deepEqual(jumps, [true, false]);
});

test("scrolling back to the bottom by hand follows again", () => {
  const view = host();
  const follower = createScrollFollower(view, () => undefined);
  view.grow(600);
  follower.contentChanged();
  view.scroll(0);
  assert.equal(follower.following(), false);
  view.scroll(view.scrollHeight - view.clientHeight - 10);
  assert.equal(follower.following(), true);
  view.grow(50);
  follower.contentChanged();
  assert.equal(view.scrollTop, view.bottom());
});

test("content that grows after the follower scrolled does not let go: the late scroll event is not the person", () => {
  const view = host();
  const jumps: boolean[] = [];
  const follower = createScrollFollower(view, (show) => jumps.push(show));
  view.grow(600);
  follower.contentChanged();
  const settled = view.scrollTop;
  // A card lands before the follower's own scroll event is dispatched; the
  // event then reports the view off the bottom though nothing moved up.
  view.grow(300);
  view.shift(settled);
  assert.equal(follower.following(), true);
  assert.deepEqual(jumps, []);
  view.grow(100);
  follower.contentChanged();
  assert.equal(view.scrollTop, view.bottom());
  assert.deepEqual(jumps, []);
});

test("a card growing in place while following ends at the bottom", () => {
  const originalObserver = (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
  const callbacks: Array<() => void> = [];
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    constructor(callback: () => void) {
      callbacks.push(callback);
    }
    observe(): void {}
    disconnect(): void {}
  };
  try {
    const view = host();
    const content = {} as Element;
    const follower = createScrollFollower(view, () => undefined, content);
    view.grow(600);
    follower.contentChanged();
    // "Working on it" becomes "Didn't work: ..." without contentChanged().
    view.grow(120);
    for (const callback of callbacks) callback();
    assert.equal(view.scrollTop, view.bottom());
    assert.equal(follower.following(), true);
  } finally {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = originalObserver;
  }
});

test("the person scrolling up stops following, is never pulled down, and Jump to latest resumes", () => {
  const view = host();
  const jumps: boolean[] = [];
  const follower = createScrollFollower(view, (show) => jumps.push(show));
  view.grow(600);
  follower.contentChanged();
  view.scroll(view.scrollTop - 200);
  assert.equal(follower.following(), false);
  assert.deepEqual(jumps, [true]);
  const reading = view.scrollTop;
  view.grow(300);
  view.shift(reading);
  follower.contentChanged();
  assert.equal(view.scrollTop, reading, "a reader is never pulled down");
  assert.equal(follower.following(), false);
  follower.followNow();
  assert.equal(view.scrollTop, view.bottom());
  assert.equal(follower.following(), true);
  assert.deepEqual(jumps, [true, false]);
});

// D16 (run musq0b1m): with nobody touching the panel the chat stopped
// following and stayed parked above the hand-off question and the build's
// ending. A layout change that keeps the content's height (a card above the
// view shrinks while the newest grows) fires no ResizeObserver, and Chrome's
// scroll anchoring moves the view up to keep the top line in place: a scroll
// that moved the view and left it off the bottom, with no person behind it.
test("the browser moving the view up on its own never ends following: only the person scrolling does", () => {
  const view = host();
  const jumps: boolean[] = [];
  const follower = createScrollFollower(view, (show) => jumps.push(show));
  view.grow(14_000);
  follower.contentChanged();
  // Measured in Chromium: anchoring moved scrollTop 14346 -> 14278 at the same height.
  view.shift(view.bottom() - 68);
  assert.equal(follower.following(), true, "scroll anchoring is not the person scrolling up");
  assert.equal(view.scrollTop, view.bottom(), "and the view goes back to the bottom");
  assert.deepEqual(jumps, []);
  view.grow(200);
  follower.contentChanged();
  assert.equal(view.scrollTop, view.bottom(), "the hand-off question that lands next is on screen");
  // The person's own scroll up still ends following at once.
  view.scroll(view.bottom() - 68);
  assert.equal(follower.following(), false);
  assert.deepEqual(jumps, [true]);
});

test("dragging the scroll bar or a scroll key counts as the person; a click inside a card does not", () => {
  const listeners = new Map<string, Array<(event: Event) => void>>();
  const fire = (type: string, event: object = {}) => { for (const next of listeners.get(type) ?? []) next(event as Event); };
  let top = 0;
  const view: ScrollHost = {
    get scrollTop() { return top; },
    set scrollTop(to: number) { top = Math.max(0, Math.min(to, 2000 - 400)); },
    scrollHeight: 2000,
    clientHeight: 400,
    addEventListener(type: string, next: (event: Event) => void) { listeners.set(type, [...(listeners.get(type) ?? []), next]); }
  };
  const follower = createScrollFollower(view, () => undefined);
  follower.followNow();
  // A click on a button inside the conversation, then the browser moves the view.
  fire("pointerdown", { target: {} });
  view.scrollTop = 1000;
  fire("scroll");
  assert.equal(follower.following(), true, "a click on content is not scrolling");
  assert.equal(view.scrollTop, 1600);
  // The scroll bar belongs to the scrolled element itself.
  fire("pointerdown", { target: view });
  view.scrollTop = 900;
  fire("scroll");
  assert.equal(follower.following(), false, "dragging the scroll bar up is the person");
  follower.followNow();
  fire("pointerup", {});
  fire("keydown", { key: "PageUp" });
  view.scrollTop = 1200;
  fire("scroll");
  assert.equal(follower.following(), false, "PageUp is the person");
});

// Round 5: the welcome opened scrolled, its title cut off at the top.
test("resting holds the view at its top through content changes and its own scrolls, then follows from the bottom", () => {
  const view = host();
  const jumps: boolean[] = [];
  const follower = createScrollFollower(view, (show) => jumps.push(show));
  view.grow(500);
  follower.contentChanged();
  assert.equal(view.scrollTop, view.bottom(), "a conversation follows its newest");
  follower.rest(true);
  assert.equal(view.scrollTop, 0, "the welcome starts at its top");
  view.grow(100);
  follower.contentChanged();
  view.shift(0);
  assert.equal(view.scrollTop, 0, "nothing pins a welcome to the bottom");
  assert.equal(jumps.includes(true), false, "and Jump to latest never shows over it");
  follower.rest(false);
  assert.equal(view.scrollTop, view.bottom(), "the first message is followed from the bottom");
  assert.equal(follower.following(), true);
});
