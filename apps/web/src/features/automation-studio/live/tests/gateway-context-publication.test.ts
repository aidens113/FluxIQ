import { describe, expect, it } from "vitest";
import { observeAutomationStudioGatewayContext } from "../gateway-context-publication";
import {
  AUTOMATION_STUDIO_CONTEXT_LEASE_MS,
  resolveClientRecordingProject,
  setAutomationStudioContext,
  type AutomationStudioWebContext
} from "../../../../lib/automation-studio-context";

const OPERATOR = "operator.alpha";
const CLIENT = "client.extension";
const PROJECT = "project.alpha";

/**
 * Drives the publication rules against the real context store and the real
 * `client.start_recording` resolver, so a test says what an operator's sequence
 * actually produces rather than what the listeners were called.
 */
function openStudio(projectId: string | null = PROJECT) {
  const contexts: Record<string, AutomationStudioWebContext> = {};
  const listeners = new Map<string, Set<() => void>>();
  const timers = new Map<number, () => void>();
  const revocations: ("beacon" | "request")[] = [];
  let nextTimerId = 1;
  let visibilityState: DocumentVisibilityState = "visible";
  let clock = 0;

  const source = (owner: string) => ({
    addEventListener(type: string, listener: () => void) {
      const key = `${owner}:${type}`;
      const registered = listeners.get(key) ?? new Set<() => void>();
      registered.add(listener);
      listeners.set(key, registered);
    },
    removeEventListener(type: string, listener: () => void) {
      listeners.get(`${owner}:${type}`)?.delete(listener);
    }
  });

  const dispatch = (key: string) => {
    for (const listener of [...(listeners.get(key) ?? [])]) listener();
  };
  const flushTimers = () => {
    const pending = [...timers.values()];
    timers.clear();
    for (const run of pending) run();
  };
  const stamp = (activeProjectId: string | null) =>
    setAutomationStudioContext(contexts, { operatorUserId: OPERATOR, activeProjectId, activeFlowId: null }, clock);

  const stopObserving = observeAutomationStudioGatewayContext({
    window: {
      ...source("window"),
      setTimeout(handler: () => void) {
        const id = nextTimerId++;
        timers.set(id, handler);
        return id;
      },
      clearTimeout(handle: number) {
        timers.delete(handle);
      }
    },
    document: {
      ...source("document"),
      get visibilityState() {
        return visibilityState;
      }
    },
    publisher: {
      publish: () => stamp(projectId),
      revoke: (mode) => {
        revocations.push(mode);
        stamp(null);
      }
    }
  });

  return {
    contexts,
    revocations,
    stopObserving,
    /** Time the operator spends somewhere the Studio page hears nothing about. */
    wait(ms: number) {
      clock += ms;
    },
    /** The operator switches to the tab they mean to record. */
    leaveStudio() {
      visibilityState = "hidden";
      dispatch("document:visibilitychange");
      flushTimers();
    },
    /** The operator comes back to the Studio tab. */
    returnToStudio() {
      visibilityState = "visible";
      dispatch("document:visibilitychange");
      dispatch("window:focus");
      flushTimers();
    },
    /** The tab, window, or browser goes away: hidden, then goodbye, one task. */
    closeStudio() {
      visibilityState = "hidden";
      dispatch("document:visibilitychange");
      dispatch("window:pagehide");
      flushTimers();
    },
    focusWithoutShowing() {
      dispatch("window:focus");
      flushTimers();
    },
    /** What Core answers when the extension sends `client.start_recording` now. */
    pressRecord(freshnessMs?: number) {
      return freshnessMs === undefined
        ? resolveClientRecordingProject(contexts, { operatorUserId: OPERATOR, clientId: CLIENT }, clock)
        : resolveClientRecordingProject(contexts, { operatorUserId: OPERATOR, clientId: CLIENT }, clock, freshnessMs);
    },
    stampedAt() {
      return Object.values(contexts)[0]?.updatedAt ?? null;
    },
    activeProject() {
      return Object.values(contexts)[0]?.activeProjectId ?? null;
    }
  };
}

describe("Automation Studio gateway context publication", () => {
  it("accepts the ordinary extension-initiated start: leave Studio, find the page, press Record", () => {
    const studio = openStudio();

    // The operator sets a project up in Studio. Nothing here refocuses the
    // window or changes the project, so nothing restamps the context.
    studio.wait(45_000);
    studio.leaveStudio();
    const leftAt = studio.stampedAt();
    // Opening the target site, signing in, reaching the right screen.
    studio.wait(32_000);

    expect(leftAt).toBe(45_000);
    expect(studio.pressRecord()).toEqual({ ok: true, projectId: PROJECT });
  });

  it("is refused at the old ten-second window, which is what made that start fail", () => {
    const studio = openStudio();

    studio.wait(45_000);
    studio.leaveStudio();
    studio.wait(32_000);

    expect(studio.pressRecord(10_000)).toMatchObject({
      ok: false,
      code: "recording.project_required",
      activeProjectId: PROJECT
    });
  });

  it("stamps on the way out, so the lease measures the excursion and not the last click on Studio", () => {
    const studio = openStudio();

    studio.wait(600_000);
    studio.leaveStudio();

    expect(studio.stampedAt()).toBe(600_000);
    expect(studio.pressRecord()).toEqual({ ok: true, projectId: PROJECT });
  });

  it("revokes immediately when the tab closes, well inside the lease", () => {
    const studio = openStudio();

    studio.wait(5_000);
    studio.closeStudio();
    studio.wait(1_000);

    expect(studio.revocations).toEqual(["beacon"]);
    expect(studio.pressRecord()).toMatchObject({
      ok: false,
      code: "recording.project_required",
      activeProjectId: null
    });
  });

  it("does not let the hide that starts a close resurrect the context behind the goodbye", () => {
    const studio = openStudio();

    // A closing tab is hidden first and says goodbye in the same task. The
    // stamp queued by the hide must never land after the revoke.
    studio.closeStudio();

    expect(studio.revocations).toEqual(["beacon"]);
    expect(studio.activeProject()).toBeNull();
    expect(studio.pressRecord()).toMatchObject({ ok: false, activeProjectId: null });
  });

  it("still ends the lease for a Studio that died without saying goodbye", () => {
    const studio = openStudio();

    studio.leaveStudio();
    studio.wait(AUTOMATION_STUDIO_CONTEXT_LEASE_MS + 1);

    expect(studio.pressRecord()).toMatchObject({
      ok: false,
      code: "recording.project_required",
      activeProjectId: PROJECT
    });
  });

  it("recovers a lapsed lease when the operator returns to the Studio tab", () => {
    const studio = openStudio();

    studio.leaveStudio();
    studio.wait(AUTOMATION_STUDIO_CONTEXT_LEASE_MS + 1);
    expect(studio.pressRecord()).toMatchObject({ ok: false });

    studio.returnToStudio();
    studio.leaveStudio();
    studio.wait(20_000);

    expect(studio.pressRecord()).toEqual({ ok: true, projectId: PROJECT });
  });

  it("ignores focus while the page is hidden, and never publishes on a timer", () => {
    const studio = openStudio();

    studio.leaveStudio();
    const leftAt = studio.stampedAt();
    studio.wait(4_000);
    studio.focusWithoutShowing();

    expect(studio.stampedAt()).toBe(leftAt);
  });

  it("clears the context with an ordinary request when the page merely changes project", () => {
    const studio = openStudio();

    studio.wait(1_000);
    studio.stopObserving();

    expect(studio.revocations).toEqual(["request"]);
    expect(studio.pressRecord()).toMatchObject({ ok: false, activeProjectId: null });
  });
});
