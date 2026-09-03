import { describe, expect, it } from "vitest";
import { defaultAutomationWorkspacePrefs } from "../workspace/layout";
import {
  automationWorkspacePrefsSameNonActivePersistentState,
  automationWorkspacePrefsSameRuntimeState,
  automationWorkspaceViewStatesSameRuntimeState,
  persistentAutomationWorkspacePrefs
} from "./workspace-persistence";

describe("workspace persistence", () => {
  it("preserves each view's complete state for project reload and reopen", () => {
    const prefs = defaultAutomationWorkspacePrefs();
    const persisted = persistentAutomationWorkspacePrefs({
      ...prefs,
      viewStates: {
        "runtime-debug": { page: 2, selection: { kind: "flow", id: "flow.one" } }
      }
    });
    expect(persisted.viewStates["runtime-debug"]).toEqual({
      page: 2,
      selection: { kind: "flow", id: "flow.one" }
    });
  });

  it("treats view selections as durable workspace state", () => {
    const defaults = defaultAutomationWorkspacePrefs();
    const left = { ...defaults, viewStates: { ...defaults.viewStates, "runtime-debug": { page: 2 } } };
    const right = {
      ...left,
      viewStates: { ...left.viewStates, "runtime-debug": { page: 2, selection: { kind: "flow", id: "flow.one" } } }
    };
    expect(automationWorkspaceViewStatesSameRuntimeState(left.viewStates, right.viewStates)).toBe(false);
    expect(automationWorkspacePrefsSameRuntimeState(left, right)).toBe(false);
  });

  it("separates active focus from non-active persistent layout state", () => {
    const left = defaultAutomationWorkspacePrefs();
    const right = { ...left, activeViewId: "runtime-debug" };
    expect(automationWorkspacePrefsSameRuntimeState(left, right)).toBe(false);
    expect(automationWorkspacePrefsSameNonActivePersistentState(left, right)).toBe(true);
  });
});
