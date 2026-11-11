// The dock gives the chat the open project's name, so a project thread reads "<name> · <title>".

import React from "react";
import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { openProjectName } from "../open-project-name";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const shared = vi.hoisted(() => ({
  projectId: undefined as string | undefined,
  projects: [{ id: "project.one", name: "Company website" }],
  chatProps: [] as Array<Record<string, unknown>>
}));

vi.mock("../../../chat-widget", () => ({
  ProgramChatWidget: (props: Record<string, unknown>) => {
    shared.chatProps.push(props);
    return null;
  }
}));
vi.mock("../../top-bar", () => ({ useProjectChoices: () => ({ projects: shared.projects, failed: false }) }));
vi.mock("../../context", () => ({
  usePanelContext: () => ({ context: { page: "flows", projectId: shared.projectId }, read: () => ({ page: "flows" }), dispatch: () => undefined }),
  onScreenFromContext: () => ({})
}));

import { AssistantDock } from "../AssistantDock";

async function lastChatProps(projectId: string | undefined) {
  (globalThis as { window?: unknown }).window = { location: { search: "" } };
  shared.projectId = projectId;
  shared.chatProps.length = 0;
  await act(async () => {
    create(<AssistantDock />);
  });
  return shared.chatProps.at(-1)!;
}

describe("the assistant dock", () => {
  it("passes the open project's name to the chat", async () => {
    const props = await lastChatProps("project.one");
    expect(props.projectId).toBe("project.one");
    expect(props.projectName).toBe("Company website");
  });

  it("passes no name with no project open", async () => {
    expect((await lastChatProps(undefined)).projectName).toBeNull();
  });

  it("finds the name only for a listed project", () => {
    expect(openProjectName(shared.projects, "project.one")).toBe("Company website");
    expect(openProjectName(shared.projects, "project.gone")).toBeNull();
    expect(openProjectName([], "project.one")).toBeNull();
    expect(openProjectName(shared.projects, undefined)).toBeNull();
  });
});
