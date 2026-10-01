import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import type { NextRouter } from "next/router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProgramLauncher } from "../ProgramLauncher";

const program = {
  id: "automation-studio",
  title: "Automation Studio",
  description: "Build and run deterministic automation.",
  category: "Authoring",
  route: "/programs/automation-studio",
  icon: "blocks" as const,
  status: "available" as const,
  scope: "global" as const,
  globalProgram: true
};

describe("ProgramLauncher", () => {
  it("renders compact searchable rows for domains and programs", () => {
    const html = renderToStaticMarkup(<ProgramLauncher domains={[{
      id: "web",
      title: "Web",
      description: "Browser automation",
      category: "Domain",
      route: "/domains/web",
      status: "available",
      icon: "mouse-pointer-click"
    }]} label="Programs" programs={[program]} />);
    expect(html).toContain('type="search"');
    expect(html).toContain('placeholder="Search programs and domains"');
    expect(html).toContain('class="launcher-row"');
    expect(html).toContain("Automation Studio");
    expect(html).toContain("Web");
    expect(html).not.toContain("program-card");
  });

  it("distinguishes a loaded empty directory", () => {
    const html = renderToStaticMarkup(<ProgramLauncher label="Programs" programs={[]} />);
    expect(html).toContain("No matching programs");
    expect(html).toContain("Try a different name");
  });

  it("does not eagerly prefetch every global program route", () => {
    const source = readFileSync(new URL("../ProgramLauncher.tsx", import.meta.url), "utf8");
    expect(source).toContain("prefetch={false}");
  });
});

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let renderer: ReactTestRenderer | undefined;
afterEach(async () => { if (renderer) await act(async () => renderer!.unmount()); renderer = undefined; vi.unstubAllGlobals(); });
async function mountLauncher(storage: { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void } | "denied", programs = [program]) {
  const fakeWindow = { location: { href: "https://panel.invalid/", origin: "https://panel.invalid", protocol: "https:", hostname: "panel.invalid", port: "" } };
  Object.defineProperty(fakeWindow, "localStorage", { get: () => { if (storage === "denied") throw new Error("Storage denied"); return storage; } });
  vi.stubGlobal("window", fakeWindow);
  vi.stubGlobal("self", globalThis);
  const push = vi.fn(async (_href: string, _as?: string, _options?: unknown) => true);
  const router = { push, replace: vi.fn(), prefetch: vi.fn(async () => undefined), asPath: "/", pathname: "/", basePath: "", isReady: true } as unknown as NextRouter;
  await act(async () => { renderer = create(<RouterContext.Provider value={router}><ProgramLauncher label="Programs" programs={programs} /></RouterContext.Provider>); });
  return { push, router };
}
function clickEvent(modified = false) {
  return { currentTarget: { nodeName: "A", getAttribute: () => null, hasAttribute: () => false }, defaultPrevented: false, ctrlKey: modified, nativeEvent: { which: 1 }, preventDefault: vi.fn() };
}
function row(href = program.route) { return renderer!.root.findAllByType("a").find((item) => item.props.href === href)!; }
describe("optional launcher history", () => {
  it.each(["getter", "quota"])("continues actual Next Link navigation after %s denial", async (failure) => {
    const setItem = vi.fn(() => { throw new Error("Storage quota exceeded"); });
    const { push } = await mountLauncher(failure === "getter" ? "denied" : { getItem: () => "[]", setItem });
    const event = clickEvent();
    await act(async () => expect(() => row().props.onClick(event)).not.toThrow());
    expect(push).toHaveBeenCalledTimes(1); expect(push.mock.calls[0]![0]).toBe(program.route);
    expect(row().props.href).toBe(program.route); expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(renderer!.toJSON())).toContain("Recent");
    await act(async () => row().props.onClick(clickEvent())); expect(push).toHaveBeenCalledTimes(2);
  });
  it("preserves modified-click browser defaults when storage fails", async () => {
    const { push } = await mountLauncher("denied"); const event = clickEvent(true);
    await act(async () => expect(() => row().props.onClick(event)).not.toThrow());
    expect(event.preventDefault).not.toHaveBeenCalled(); expect(push).not.toHaveBeenCalled();
  });
  it("retains bounded newest-first deduplication on successful writes", async () => {
    const routes = Array.from({ length: 8 }, (_, index) => ({ ...program, id: `program.${index}`, title: `Program ${index}`, route: `/programs/item-${index}` }));
    const setItem = vi.fn(); await mountLauncher({ getItem: () => "[]", setItem }, routes);
    for (const item of routes) await act(async () => row(item.route).props.onClick(clickEvent()));
    await act(async () => row(routes[7]!.route).props.onClick(clickEvent()));
    expect(setItem.mock.calls.at(-1)).toEqual(["fluxiq:recent-programs", JSON.stringify(routes.slice(2).reverse().map((item) => item.route))]);
    expect(renderer!.root.findAllByType("a").filter((item) => item.props.href === routes[7]!.route)).toHaveLength(1);
  });
  it("does not let malformed stored history remove launch destinations", async () => {
    const { push } = await mountLauncher({ getItem: () => "not-json", setItem: vi.fn() });
    await act(async () => row().props.onClick(clickEvent())); expect(push).toHaveBeenCalledTimes(1);
  });
});
