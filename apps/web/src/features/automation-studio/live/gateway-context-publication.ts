"use client";

/**
 * When the Automation Studio page tells the shared runtime which project it has
 * open, and when it takes that back.
 *
 * The stamp this publishes is what lets a paired client start a recording:
 * `resolveClientRecordingProject` accepts `client.start_recording` only while a
 * Studio page is known to be alive with a project open. So the events chosen
 * here decide whether extension-initiated recording works at all.
 *
 * The one that matters is `visibilitychange` to hidden. That is the operator
 * leaving Studio for the page they mean to record, and it is the last thing
 * this page will say until they come back: a background tab receives no focus,
 * and its timers are throttled to roughly once a minute, so nothing else will
 * speak for it during the excursion. Stamping on the way out is what makes the
 * lease measure the excursion rather than measuring from whenever the operator
 * last happened to click on Studio.
 *
 * Nothing here runs on a timer. An idle Studio does no application polling, and
 * pointer and keyboard listeners were deliberately removed from this path: they
 * put a request behind every interaction and still said nothing about a tab
 * nobody is touching.
 */
export type AutomationStudioGatewayContextPublisher = {
  /** Stamps the page's current project and flow as live. */
  publish(): void;
  /**
   * Clears the stamp. `beacon` means the page itself is going away, where a
   * normal request can be torn down before it leaves; `request` is an ordinary
   * teardown, such as the operator navigating to another project.
   */
  revoke(mode: "beacon" | "request"): void;
};

export type AutomationStudioContextEventSource = {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
};

export type AutomationStudioGatewayContextObserverInput = {
  window: AutomationStudioContextEventSource & {
    setTimeout(handler: () => void, timeout: number): number;
    clearTimeout(handle: number): void;
  };
  document: AutomationStudioContextEventSource & { readonly visibilityState: DocumentVisibilityState };
  publisher: AutomationStudioGatewayContextPublisher;
};

export function observeAutomationStudioGatewayContext(input: AutomationStudioGatewayContextObserverInput): () => void {
  const { window: view, document: page, publisher } = input;
  let gone = false;
  let deferredStamp: number | undefined;

  const cancelDeferredStamp = () => {
    if (deferredStamp === undefined) return;
    view.clearTimeout(deferredStamp);
    deferredStamp = undefined;
  };
  const stamp = () => {
    if (gone) return;
    publisher.publish();
  };

  const onFocus = () => {
    if (page.visibilityState === "visible") stamp();
  };
  const onVisibilityChange = () => {
    cancelDeferredStamp();
    if (gone) return;
    if (page.visibilityState === "visible") {
      stamp();
      return;
    }
    // Hidden is also how a closing tab starts, and the goodbye that follows is
    // dispatched in the same task. Deferring by a task lets `pagehide` cancel
    // this: a stamp that landed after the goodbye would resurrect a dead Studio
    // for a whole lease, which is the exact thing the lease exists to prevent.
    deferredStamp = view.setTimeout(() => {
      deferredStamp = undefined;
      stamp();
    }, 0);
  };
  const onPageShow = () => {
    gone = false;
    stamp();
  };
  const onPageHide = () => {
    if (gone) return;
    gone = true;
    cancelDeferredStamp();
    publisher.revoke("beacon");
  };

  stamp();
  view.addEventListener("focus", onFocus);
  page.addEventListener("visibilitychange", onVisibilityChange);
  view.addEventListener("pageshow", onPageShow);
  view.addEventListener("pagehide", onPageHide);

  return () => {
    cancelDeferredStamp();
    view.removeEventListener("focus", onFocus);
    page.removeEventListener("visibilitychange", onVisibilityChange);
    view.removeEventListener("pageshow", onPageShow);
    view.removeEventListener("pagehide", onPageHide);
    if (gone) return;
    gone = true;
    publisher.revoke("request");
  };
}
