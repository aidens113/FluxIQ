import { useEffect, useState, type ComponentProps } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vitest";
import { StudioStartJourney } from "../StudioStartJourney";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
type Props = ComponentProps<typeof StudioStartJourney>;
let renderer: ReactTestRenderer | undefined;
afterEach(async () => { if (renderer) await act(async () => renderer!.unmount()); renderer = undefined; });
function props(overrides: Partial<Props> = {}): Props {
  return { intent: "describe", entryKey: "/programs/automation-studio?start=describe", domainId: "web/team", state: "project", projectId: "p", consumeIntent: vi.fn(() => true), createAutomation: vi.fn(), openConnectedBrowsers: vi.fn(), children: <div>Workspace retained</div>, ...overrides };
}
async function mount(input: Props) { await act(async () => { renderer = create(<StudioStartJourney {...input} />); }); }
function button(text: string) { return renderer!.root.findAllByType("button").find((item) => item.children.includes(text))!; }
function text(): string { return JSON.stringify(renderer!.toJSON()); }
it.each(["describe", "demonstrate", "extract"] as const)("offers %s only as an explicit existing command", async (intent) => {
  const input = props({ intent }); await mount(input);
  expect(input.createAutomation).not.toHaveBeenCalled(); expect(input.openConnectedBrowsers).not.toHaveBeenCalled(); expect(input.consumeIntent).not.toHaveBeenCalled();
  expect(renderer!.root.findByType("a").props.href).toBe("/get-started?domainId=web%2Fteam");
  const next = button(intent === "describe" ? "Create automation" : "Open Connected browsers").props.onClick;
  await act(async () => { next(); next(); });
  expect(input.consumeIntent).toHaveBeenCalledTimes(1);
  expect(input.createAutomation).toHaveBeenCalledTimes(intent === "describe" ? 1 : 0);
  expect(input.openConnectedBrowsers).toHaveBeenCalledTimes(intent === "describe" ? 0 : 1);
  if (intent === "extract") { expect(text()).toContain("Open the extension on the target page"); expect(text()).toContain("inspect its preview there"); }
});
it.each(["catalog", "restoring"] as const)("keeps %s inert and its child visible", async (state) => {
  const input = props({ state, projectId: null }); await mount(input);
  expect(text()).toContain("Workspace retained");
  if (state === "catalog") { expect(text()).toContain("Choose a project below"); expect(renderer!.root.findAllByType("button")).toHaveLength(1); }
  else { expect(button("Create automation").props.disabled).toBe(true); await act(async () => button("Create automation").props.onClick()); }
  expect(input.consumeIntent).not.toHaveBeenCalled(); expect(input.createAutomation).not.toHaveBeenCalled();
});
it("keeps the start choice when the person explicitly chooses a project", async () => {
  const input = props({ state: "catalog", projectId: null }); await mount(input);
  await act(async () => renderer!.update(<StudioStartJourney {...input} state="project" projectId="selected" />));
  expect(input.consumeIntent).not.toHaveBeenCalled(); expect(input.createAutomation).not.toHaveBeenCalled();
  await act(async () => button("Create automation").props.onClick());
  expect(input.createAutomation).toHaveBeenCalledTimes(1);
});
it("dismisses without invoking a command", async () => {
  const input = props(); await mount(input);
  await act(async () => button("Dismiss").props.onClick());
  expect(input.consumeIntent).toHaveBeenCalledTimes(1);
  expect(input.createAutomation).not.toHaveBeenCalled(); expect(input.openConnectedBrowsers).not.toHaveBeenCalled();
});
it("does not dispatch when the current URL guard refuses consumption", async () => {
  const input = props({ consumeIntent: vi.fn(() => false) }); await mount(input);
  await act(async () => button("Create automation").props.onClick());
  expect(input.createAutomation).not.toHaveBeenCalled();
});
it.each([{ projectId: "other" }, { intent: "extract" as const }, { state: "restoring" as const }, { entryKey: "new-url" }])("rejects retained action and dismiss handlers after %j", async (change) => {
  const input = props(); await mount(input);
  const next = button("Create automation").props.onClick; const dismiss = button("Dismiss").props.onClick;
  await act(async () => renderer!.update(<StudioStartJourney {...input} {...change} />));
  await act(async () => { next(); dismiss(); });
  expect(input.consumeIntent).not.toHaveBeenCalled(); expect(input.createAutomation).not.toHaveBeenCalled(); expect(input.openConnectedBrowsers).not.toHaveBeenCalled();
});
it("rejects retained handlers after unmount", async () => {
  const input = props(); await mount(input); const next = button("Create automation").props.onClick;
  await act(async () => renderer!.unmount()); renderer = undefined; next();
  expect(input.consumeIntent).not.toHaveBeenCalled(); expect(input.createAutomation).not.toHaveBeenCalled();
});
it("preserves child state and mount when the banner is consumed or returns", async () => {
  const mounted = vi.fn(); const unmounted = vi.fn();
  function Workspace() { const [draft, setDraft] = useState("original"); useEffect(() => { mounted(); return unmounted; }, []); return <button onClick={() => setDraft("newer draft")}>{draft}</button>; }
  const input = props({ children: <Workspace /> }); await mount(input);
  await act(async () => button("original").props.onClick());
  await act(async () => renderer!.update(<StudioStartJourney {...input} intent={null} />));
  expect(text()).toContain("newer draft"); expect(mounted).toHaveBeenCalledTimes(1); expect(unmounted).not.toHaveBeenCalled();
  await act(async () => renderer!.update(<StudioStartJourney {...input} intent="extract" entryKey="new-start" />));
  expect(text()).toContain("newer draft"); expect(mounted).toHaveBeenCalledTimes(1);
});
