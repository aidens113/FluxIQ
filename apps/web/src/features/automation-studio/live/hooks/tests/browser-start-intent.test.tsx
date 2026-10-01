import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ query: "", pathname: "/programs/automation-studio" }));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname, useSearchParams: () => new URLSearchParams(state.query) }));
import { useAutomationBrowserEntry } from "../useAutomationBrowserEntry";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let renderer: ReactTestRenderer | undefined;
let entry: ReturnType<typeof useAutomationBrowserEntry> & { startIntent?: string | null; consumeStartIntent?: () => boolean };
function Host() { entry = useAutomationBrowserEntry(); return null; }
afterEach(async () => { if (renderer) await act(async () => renderer!.unmount()); renderer = undefined; vi.unstubAllGlobals(); state.pathname = "/programs/automation-studio"; });
async function mount(query: string) {
  state.query = query;
  const location = { pathname: state.pathname, search: query ? `?${query}` : "", hash: "#keep" };
  const history = { state: { marker: "retained" }, replaceState: vi.fn((_state: unknown, _title: string, next: string) => { const url = new URL(next, "https://panel.invalid"); location.pathname = url.pathname; location.search = url.search; location.hash = url.hash; }) };
  vi.stubGlobal("window", { location, history });
  await act(async () => { renderer = create(<Host />); });
  return { location, history };
}
it.each(["describe", "demonstrate", "extract"])("recognizes %s without mutation", async (intent) => {
  const { history } = await mount(`start=${intent}`);
  expect(entry.startIntent).toBe(intent);
  expect(history.replaceState).not.toHaveBeenCalled();
});
it.each(["", "start=", "start=unknown", "start=describe&start=extract", "start=describe&start=describe"])("ignores invalid/repeated start in %s", async (query) => {
  await mount(query);
  expect(entry.startIntent).toBeNull();
});
it("keeps project/domain/unrelated params and deletes only start using replace", async () => {
  const query = "domainId=web&project=p&extra=retained&start=describe";
  const { location, history } = await mount(query);
  expect(entry.deepLink.projectId).toBe("p");
  await act(async () => expect(entry.consumeStartIntent?.()).toBe(true));
  const expected = new URLSearchParams(query); expected.delete("start");
  expect(location.search).toBe(`?${expected}`);
  expect(location.hash).toBe("#keep");
  expect(history.replaceState).toHaveBeenCalledWith(history.state, "", `${state.pathname}?${expected}#keep`);
  expect(entry.startIntent).toBeNull();
  expect(entry.consumeStartIntent?.()).toBe(false);
});
it.each(["flow=f&subflow=s&view=runtime-debug&detail=run%3Ar", "view=runtime-debug", "detail=run%3Ar"])("leaves explicit canonical target %s authoritative", async (target) => {
  const query = `project=p&${target}&start=describe&domainId=web`;
  const { location, history } = await mount(query);
  expect(entry.startIntent).toBeNull();
  expect(entry.consumeStartIntent?.()).toBe(false);
  expect(entry.deepLink.projectId).toBe("p");
  if (target.startsWith("flow=")) expect(entry.deepLink).toMatchObject({ flowId: "f", subflowId: "s", viewId: "runtime-debug", detail: { kind: "run", id: "r" } });
  expect(location.search).toBe(`?${query}`);
  expect(history.replaceState).not.toHaveBeenCalled();
});
it("rejects a retained handler when the same intent is later revisited", async () => {
  const { location, history } = await mount("start=describe");
  const stale = entry.consumeStartIntent;
  state.query = "start=extract"; location.search = `?${state.query}`;
  await act(async () => renderer!.update(<Host />));
  state.query = "start=describe"; location.search = `?${state.query}`;
  await act(async () => renderer!.update(<Host />));
  expect(entry.startIntent).toBe("describe");
  expect(stale?.()).toBe(false);
  expect(history.replaceState).not.toHaveBeenCalled();
  await act(async () => expect(entry.consumeStartIntent?.()).toBe(true));
});
it.each(["start=extract&project=p", "start=describe&project=other", "start=describe&project=p&domainId=other"])("rejects retained handlers after navigation to %s", async (next) => {
  const { location, history } = await mount("start=describe&project=p");
  const stale = entry.consumeStartIntent;
  location.search = `?${next}`;
  expect(stale?.()).toBe(false);
  expect(history.replaceState).not.toHaveBeenCalled();
});
it("rejects a handler after unmount", async () => {
  const { history } = await mount("start=describe");
  const stale = entry.consumeStartIntent;
  await act(async () => renderer!.unmount()); renderer = undefined;
  expect(stale?.()).toBe(false);
  expect(history.replaceState).not.toHaveBeenCalled();
});
it("keeps refresh and back/forward entry passive before and after consumption", async () => {
  const original = "project=p&domainId=web&start=demonstrate";
  const { location, history } = await mount(original);
  await act(async () => renderer!.unmount());
  await act(async () => { renderer = create(<Host />); });
  expect(entry.startIntent).toBe("demonstrate"); expect(history.replaceState).not.toHaveBeenCalled();
  await act(async () => expect(entry.consumeStartIntent?.()).toBe(true));
  state.query = new URLSearchParams(location.search).toString();
  await act(async () => renderer!.unmount());
  await act(async () => { renderer = create(<Host />); });
  expect(entry.startIntent).toBeNull(); expect(history.replaceState).toHaveBeenCalledTimes(1);
  state.query = original; location.search = `?${original}`;
  await act(async () => renderer!.update(<Host />));
  expect(entry.startIntent).toBe("demonstrate"); expect(history.replaceState).toHaveBeenCalledTimes(1);
  state.query = "project=p&domainId=web"; location.search = `?${state.query}`;
  await act(async () => renderer!.update(<Host />));
  expect(entry.startIntent).toBeNull(); expect(history.replaceState).toHaveBeenCalledTimes(1);
});
it("rejects a retained handler on another route", async () => {
  const { location, history } = await mount("start=describe");
  location.pathname = "/get-started";
  expect(entry.consumeStartIntent?.()).toBe(false);
  expect(history.replaceState).not.toHaveBeenCalled();
});
