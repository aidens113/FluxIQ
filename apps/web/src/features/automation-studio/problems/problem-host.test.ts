import { describe, expect, it, vi } from "vitest";
import { resolveProblemsHostState, type ProblemsValidationStatus } from "./problem-host";

describe("Problems typed host", () => {
  it.each<ProblemsValidationStatus>(["loading", "ready", "empty", "error", "permission-denied", "stale"])(
    "represents the %s lifecycle state",
    (status) => {
      const state = resolveProblemsHostState({
        problems: [],
        validation: { status }
      });
      expect(state.status).toBe(status);
    }
  );

  it("adapts the compatibility current-object fields into a typed target", () => {
    const state = resolveProblemsHostState({
      problems: [],
      currentObjectId: "node.send",
      currentObjectLabel: "Send"
    });
    expect(state.currentObject).toEqual({ id: "node.send", label: "Send" });
  });

  it("never enables validation commands while inactive, loading, or denied", () => {
    const onRequestValidation = vi.fn();
    expect(resolveProblemsHostState({
      problems: [],
      activity: "inactive",
      validation: { status: "stale" }
    }, { onRequestValidation })).toMatchObject({
      active: false,
      canRequestValidation: false,
      message: "Validation is paused while this view is inactive."
    });
    expect(resolveProblemsHostState({
      problems: [],
      validation: { status: "loading" }
    }, { onRequestValidation }).canRequestValidation).toBe(false);
    expect(resolveProblemsHostState({
      problems: [],
      validation: { status: "permission-denied" }
    }, { onRequestValidation }).canRequestValidation).toBe(false);
    expect(onRequestValidation).not.toHaveBeenCalled();
  });

  it("enables an explicit refresh command only for an active eligible state", () => {
    const state = resolveProblemsHostState({
      problems: [],
      validation: { status: "error", message: "Worker unavailable." }
    }, { onRequestValidation: () => undefined });
    expect(state).toMatchObject({
      status: "error",
      message: "Worker unavailable.",
      canRequestValidation: true
    });
  });
});
