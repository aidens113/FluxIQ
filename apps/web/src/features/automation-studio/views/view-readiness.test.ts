import { describe, expect, it, vi } from "vitest";
import { createAutomationViewReadinessOwner, readyAutomationView } from "./view-readiness";

describe("Automation view-local readiness owner", () => {
  it("uses explicit loading, ready, empty, error, and stale-ready states", () => {
    const owner = createAutomationViewReadinessOwner<{ value: string }>();
    expect(Object.keys(owner).sort()).toEqual(["begin", "complete", "fail", "getSnapshot", "subscribe"]);
    expect(owner.getSnapshot().status).toBe("loading");

    const first = owner.begin(1);
    expect(owner.complete(first, { status: "ready", data: { value: "first" } })).toBe(true);
    expect(owner.getSnapshot()).toMatchObject({ status: "ready", data: { value: "first" } });

    const refresh = owner.begin(1);
    expect(owner.getSnapshot()).toMatchObject({ status: "stale-ready", data: { value: "first" } });
    expect(owner.complete(refresh, { status: "empty", message: "Nothing matched." })).toBe(true);
    expect(owner.getSnapshot()).toMatchObject({ status: "empty", message: "Nothing matched." });

    const failed = owner.begin(1);
    expect(owner.fail(failed, "offline")).toBe(true);
    expect(owner.getSnapshot()).toMatchObject({ status: "error", error: new Error("offline") });
  });

  it("preserves previous ready data while refreshing and after refresh failure", () => {
    const model = { rows: ["cached"] };
    const owner = createAutomationViewReadinessOwner(readyAutomationView(model));
    const token = owner.begin(4);

    expect(owner.getSnapshot()).toMatchObject({ status: "stale-ready", data: model });
    owner.fail(token, new Error("refresh failed"));
    expect(owner.getSnapshot()).toMatchObject({
      status: "stale-ready",
      data: model,
      error: new Error("refresh failed")
    });
  });

  it("rejects stale query tokens and stale project generations", () => {
    const owner = createAutomationViewReadinessOwner<{ value: string }>();
    const oldQuery = owner.begin(7);
    const currentQuery = owner.begin(7);
    expect(owner.complete(oldQuery, { status: "ready", data: { value: "old query" } })).toBe(false);
    expect(owner.getSnapshot().status).toBe("loading");

    const currentProject = owner.begin(8);
    expect(owner.complete(currentQuery, { status: "ready", data: { value: "old project" } })).toBe(false);
    expect(owner.complete(currentProject, { status: "ready", data: { value: "current" } })).toBe(true);
    expect(owner.getSnapshot()).toMatchObject({ status: "ready", data: { value: "current" } });
  });

  it("cannot activate, redirect, close, or reopen a view on completion or failure", () => {
    const navigation = {
      activate: vi.fn(),
      close: vi.fn(),
      redirect: vi.fn(),
      reopen: vi.fn()
    };
    const owner = createAutomationViewReadinessOwner<{ value: string }>();
    const completed = owner.begin(1);
    owner.complete(completed, { status: "ready", data: { value: "done" } });
    const failed = owner.begin(1);
    owner.fail(failed, new Error("nope"));

    expect(navigation.activate).not.toHaveBeenCalled();
    expect(navigation.close).not.toHaveBeenCalled();
    expect(navigation.redirect).not.toHaveBeenCalled();
    expect(navigation.reopen).not.toHaveBeenCalled();
  });
});
