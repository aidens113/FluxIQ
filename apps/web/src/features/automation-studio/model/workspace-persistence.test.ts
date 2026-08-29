import { describe, expect, it } from "vitest";
import { defaultAutomationWorkspacePrefs } from "../workspace/layout";
import {
  automationWorkspacePrefsSameNonActivePersistentState,
  automationWorkspacePrefsSameRuntimeState,
  automationWorkspaceViewStatesSameRuntimeState,
  persistentAutomationWorkspacePrefs
} from "./workspace-persistence";

describe("workspace persistence", () => {
  it("removes transient selections while preserving durable view state", () => {
    const prefs = defaultAutomationWorkspacePrefs();
    const persisted = persistentAutomationWorkspacePrefs({
      ...prefs,
      viewStates: {
        "runtime-debug": { page: 2, selection: { kind: "flow", id: "flow.one" } }
      }
    });
    expect(persisted.viewStates["runtime-debug"]).toEqual({ page: 2 });
  });

  it("compares runtime state without serializing view selections", () => {
    const defaults = defaultAutomationWorkspacePrefs();
    const left = { ...defaults, viewStates: { ...defaults.viewStates, "runtime-debug": { page: 2 } } };
    const right = {
      ...left,
      viewStates: { ...left.viewStates, "runtime-debug": { page: 2, selection: { kind: "flow", id: "flow.one" } } }
    };
    expect(automationWorkspaceViewStatesSameRuntimeState(left.viewStates, right.viewStates)).toBe(true);
    expect(automationWorkspacePrefsSameRuntimeState(left, right)).toBe(true);
  });

  it("separates active focus from non-active persistent layout state", () => {
    const left = defaultAutomationWorkspacePrefs();
    const right = { ...left, activeViewId: "runtime-debug" };
    expect(automationWorkspacePrefsSameRuntimeState(left, right)).toBe(false);
    expect(automationWorkspacePrefsSameNonActivePersistentState(left, right)).toBe(true);
  });
});
