import { describe, expect, it } from "vitest";
import { createAutomationStudioStores } from "../stores";
import { defaultAutomationWorkspacePrefs } from "../workspace/layout";
import { createAutomationWorkspaceRenderStore } from "../workspace/render-store";
import { createAutomationSessionProjectViewReader } from "./session-project-view";

describe("Automation Studio Session project view reader", () => {
  it("retains empty project model identities across unrelated Session renders", () => {
    const stores = createAutomationStudioStores();
    const workspace = createAutomationWorkspaceRenderStore(defaultAutomationWorkspacePrefs());
    const read = createAutomationSessionProjectViewReader({
      activeProjectId: "project.one",
      stores,
      workspace
    });

    const first = read();
    const second = read();

    expect(second).toBe(first);
    expect(second.availableNodeDefinitions).toBe(first.availableNodeDefinitions);
    expect(second.hierarchyNodes).toBe(first.hierarchyNodes);
  });
});
