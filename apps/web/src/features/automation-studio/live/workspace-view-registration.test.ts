import { describe, expect, it } from "vitest";
import { defaultAutomationWorkspacePrefs } from "../workspace/layout";
import { automationStudioObjectViewInstanceId, automationStudioViewId } from "../views/view-registry";
import {
  automationWorkspaceViewRegistrationEqual,
  selectAutomationWorkspaceViewRegistration
} from "./workspace-view-registration";

describe("workspace view registration selection", () => {
  it("publishes when a restored canonical tab becomes object-qualified", () => {
    const canonical = defaultAutomationWorkspacePrefs();
    canonical.panes[0] = {
      ...canonical.panes[0]!,
      activeViewId: automationStudioViewId.instructions,
      tabs: [automationStudioViewId.instructions]
    };
    const restored = structuredClone(canonical);
    const instanceId = automationStudioObjectViewInstanceId(automationStudioViewId.instructions, "flow.child");
    restored.panes[0] = { ...restored.panes[0]!, activeViewId: instanceId, tabs: [instanceId] };

    const before = selectAutomationWorkspaceViewRegistration(canonical);
    const after = selectAutomationWorkspaceViewRegistration(restored);
    expect(automationWorkspaceViewRegistrationEqual(before, after)).toBe(false);
    expect(after).toEqual({
      activeViewId: instanceId,
      openViewIds: [instanceId, automationStudioViewId.inspector]
    });
  });

  it("ignores workspace state changes that do not affect registered views", () => {
    const before = defaultAutomationWorkspacePrefs();
    const after = { ...before, bottomTimelineHeight: before.bottomTimelineHeight + 20 };

    expect(automationWorkspaceViewRegistrationEqual(
      selectAutomationWorkspaceViewRegistration(before),
      selectAutomationWorkspaceViewRegistration(after)
    )).toBe(true);
  });
});
