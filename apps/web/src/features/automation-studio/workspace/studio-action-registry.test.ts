import { afterEach, describe, expect, it, vi } from "vitest";
import {
  automationStudioActionSnapshot,
  invokeAutomationStudioGraphAction,
  invokeAutomationStudioRuntimeAction,
  registerAutomationStudioGraphActions,
  registerAutomationStudioRuntimeActions,
  resetAutomationStudioActionsForTests,
  saveActiveAutomationStudioGraph
} from "./studio-action-registry";

afterEach(resetAutomationStudioActionsForTests);

describe("Automation Studio global action registry", () => {
  it("routes history commands only to the active graph", () => {
    const inactiveUndo = vi.fn();
    const activeUndo = vi.fn();
    registerAutomationStudioGraphActions("inactive", { active: () => false, canUndo: true, canRedo: false, undo: inactiveUndo, redo: vi.fn(), save: vi.fn() });
    registerAutomationStudioGraphActions("active", { active: () => true, canUndo: true, canRedo: false, undo: activeUndo, redo: vi.fn(), save: vi.fn() });

    expect(automationStudioActionSnapshot().graph).toEqual({ canUndo: true, canRedo: false });
    invokeAutomationStudioGraphAction("undo");
    expect(activeUndo).toHaveBeenCalledOnce();
    expect(inactiveUndo).not.toHaveBeenCalled();
  });

  it("saves through the active editor so pending in-memory edits cannot be skipped", async () => {
    const save = vi.fn(async () => ({ ok: true, message: "saved" }));
    registerAutomationStudioGraphActions("active", {
      active: () => true, canUndo: false, canRedo: false, undo: vi.fn(), redo: vi.fn(), save
    });

    await expect(saveActiveAutomationStudioGraph("1234")).resolves.toEqual({ ok: true, message: "saved" });
    expect(save).toHaveBeenCalledWith("1234");
  });

  it("exposes runtime availability and rejects unavailable pause", () => {
    const play = vi.fn();
    const pause = vi.fn();
    registerAutomationStudioRuntimeActions("runtime", { canPlay: true, canPause: false, canStop: false, play, pause, stop: vi.fn() });

    expect(invokeAutomationStudioRuntimeAction("play")).toBe(true);
    expect(invokeAutomationStudioRuntimeAction("pause")).toBe(false);
    expect(play).toHaveBeenCalledOnce();
    expect(pause).not.toHaveBeenCalled();
  });
});
