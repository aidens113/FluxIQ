import React from "react";
import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const shared = vi.hoisted(() => ({
  list: { state: "ready", projects: [{ id: "p1", name: "Shop" }], reload: () => undefined, add: () => undefined } as Record<string, unknown>,
  dispatched: [] as unknown[],
  created: [] as unknown[]
}));

vi.mock("next/link", () => ({ default: (props: { href: string; children?: React.ReactNode }) => React.createElement("a", { href: props.href }, props.children) }));
vi.mock("../../../automation-studio/data/use-program-transport", () => ({ useProgramTransport: () => ({}) }));
vi.mock("../../../automation-studio/project", () => ({
  useProjectList: () => shared.list,
  createAutomationProject: async (_api: unknown, input: unknown) => {
    shared.created.push(input);
    return { ok: true, payload: { project: { id: "p9", name: "New" } } };
  }
}));
vi.mock("../../../panel-shell", () => ({ notifyProjectsChanged: () => shared.dispatched.push("notified"), usePanelContext: () => ({ context: { page: "flows" }, dispatch: (action: unknown) => shared.dispatched.push(action), read: () => ({}) }) }));

import { FlowsProjectPicker } from "../FlowsProjectPicker";

describe("the Flows project picker", () => {
  it("chooses a listed project as the panel project", async () => {
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<FlowsProjectPicker />); });
    const open = renderer.root.findAllByType("button").find((item) => item.props["aria-label"] === "Open Shop")!;
    await act(async () => { open.props.onClick(); });
    expect(shared.dispatched).toEqual([{ type: "project", projectId: "p1" }]);
  });
  it("creates a project and chooses it", async () => {
    shared.dispatched.length = 0;
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<FlowsProjectPicker />); });
    await act(async () => { renderer.root.findByType("input").props.onChange({ target: { value: " Blog " } }); });
    await act(async () => { await renderer.root.findByType("form").props.onSubmit({ preventDefault: () => undefined }); });
    expect(shared.created).toEqual([{ name: "Blog", description: "", categoryId: null, authorizationPin: "" }]);
    expect(shared.dispatched).toEqual(["notified", { type: "project", projectId: "p9" }]);
  });
  it("shows a failed read with a retry", async () => {
    shared.list = { state: "error", message: "offline", reload: () => undefined };
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<FlowsProjectPicker />); });
    expect(JSON.stringify(renderer.toJSON())).toContain("offline");
    expect(renderer.root.findAllByType("button").some((item) => JSON.stringify(item.children) === JSON.stringify(["Try again"]))).toBe(true);
  });
});
