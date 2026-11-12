import type React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vitest";
import { TOOL_CAPABILITIES } from "../capabilities";
import { TechnicalDetails } from "../TechnicalDetails";

vi.mock("../../components", () => ({
  Drawer: (props: { title: string; description: string; children: React.ReactNode; onClose(): void }) => <section data-drawer={props.title} data-description={props.description}>{props.children}</section>
}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
// The drawer listens for Escape on the window; a bare event target stands in for it here.
vi.stubGlobal("window", new EventTarget());
let renderer: ReactTestRenderer | undefined;
const text = () => JSON.stringify(renderer!.toJSON());
afterEach(() => {
  if (renderer) act(() => renderer!.unmount());
  renderer = undefined;
});

it("keeps every retired program page's inventory", () => {
  expect(Object.keys(TOOL_CAPABILITIES).sort()).toEqual(["background-tasks", "compute-control", "database-manager", "deployment-sync", "docs", "identity-access", "production-runner", "secret-keys"]);
});

it("opens the inventory on request, switches tabs and closes on Escape", () => {
  act(() => {
    renderer = create(<TechnicalDetails toolId="database-manager" title="Database Manager" />);
  });
  expect(text()).not.toContain("data-drawer");
  act(() => renderer!.root.findByType("button").props.onClick());
  expect(text()).toContain("Framework interfaces exposed by Database Manager.");
  expect(text()).toContain("snapshot");
  const storage = renderer!.root.findAll((node) => node.props.role === "tab" && node.props.id === "technical-tab-storage")[0]!;
  act(() => storage.props.onClick());
  expect(text()).toContain("Scoped records");
  act(() => {
    window.dispatchEvent(Object.assign(new Event("keydown"), { key: "Escape" }));
  });
  expect(text()).not.toContain("data-drawer");
});

it("falls back to the generic inventory for a tool without its own", () => {
  act(() => {
    renderer = create(<TechnicalDetails toolId="runtime" title="Runtime" />);
  });
  act(() => renderer!.root.findByType("button").props.onClick());
  act(() => renderer!.root.findAll((node) => node.props.id === "technical-tab-runtime")[0]!.props.onClick());
  expect(text()).toContain("Program service");
});
