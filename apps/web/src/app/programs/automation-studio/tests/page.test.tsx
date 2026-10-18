import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ authenticated: false, activeDomainId: null as string | null, domains: [] as Array<{ id: string; title: string; description: string }>, directory: vi.fn(() => ({ domain: { id: "web", title: "Web" } })), catalog: vi.fn(() => [{ id: "automation-studio", title: "Studio" }]) }));
vi.mock("../../../../lib/auth", () => ({ currentFluxIQUser: async () => state.authenticated ? { user: { id: "u", displayName: "User", roleId: "r", totpEnabled: false, pinConfigured: false } } : null }));
vi.mock("../../../../lib/fluxiq", () => ({ getFluxIQ: () => ({ programDirectory: state.directory, activeDomainId: state.activeDomainId, domains: { summaries: () => state.domains } }) }));
vi.mock("fluxiq", () => ({ defaultGlobalProgramCatalog: state.catalog }));
vi.mock("next/navigation", () => ({ redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }) }));
vi.mock("../../[programId]/ProgramWorkspace", () => ({ ProgramWorkspace: () => null }));
import AutomationStudioPage from "../page";
import { LoginPanel } from "../../../AuthShell";
import { ProgramWorkspace } from "../../[programId]/ProgramWorkspace";
import { StudioDomainChoice } from "../StudioDomainChoice";
const web = { id: "web", title: "Web", description: "Web domain" };
const shop = { id: "shop", title: "Shop", description: "Shop domain" };
beforeEach(() => { vi.clearAllMocks(); state.authenticated = false; state.activeDomainId = null; state.domains = []; });
it("retains an unauthenticated Studio deep-link URL through inline login before loaders", async () => { const result = await AutomationStudioPage({ searchParams: Promise.resolve({ domainId: "web", project: "p", flow: "f", subflow: "s", view: "runtime-debug" }) }); expect(result.type).toBe(LoginPanel); expect(state.directory).not.toHaveBeenCalled(); expect(state.catalog).not.toHaveBeenCalled(); });
it("preserves authenticated domain validation/workspace composition", async () => { state.authenticated = true; state.domains = [web]; const result = await AutomationStudioPage({ searchParams: Promise.resolve({ domainId: "web" }) }); expect(result.type).toBe(ProgramWorkspace); expect(result.props).toMatchObject({ domainName: "Web", backHref: "/domains/web" }); expect(state.catalog).toHaveBeenCalledWith({ domainId: "web" }); });
it("preserves authenticated missing-program fallback", async () => { state.authenticated = true; state.catalog.mockReturnValueOnce([]); await expect(AutomationStudioPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect:/"); });

it("carries the only installed domain into a plain Studio entry, keeping the rest of the link", async () => {
  state.authenticated = true;
  state.domains = [web];
  const opened = AutomationStudioPage({ searchParams: Promise.resolve({ project: "p" }) });
  await expect(opened).rejects.toThrow("redirect:/programs/automation-studio?domainId=web&project=p");
});
it("carries the runtime's active domain when several are installed", async () => {
  state.authenticated = true;
  state.domains = [web, shop];
  state.activeDomainId = "shop";
  const opened = AutomationStudioPage({ searchParams: Promise.resolve({}) });
  await expect(opened).rejects.toThrow("redirect:/programs/automation-studio?domainId=shop");
});
it("replaces a requested domain that is not installed", async () => {
  state.authenticated = true;
  state.domains = [web];
  const opened = AutomationStudioPage({ searchParams: Promise.resolve({ domainId: "gone" }) });
  await expect(opened).rejects.toThrow("redirect:/programs/automation-studio?domainId=web");
});
it("asks the person to choose when several domains are installed and none is active", async () => {
  state.authenticated = true;
  state.domains = [web, shop];
  const result = await AutomationStudioPage({ searchParams: Promise.resolve({ project: "p" }) });
  expect(result.type).toBe(StudioDomainChoice);
  expect(result.props).toMatchObject({ domains: [web, shop], query: { project: "p" } });
  expect(state.catalog).not.toHaveBeenCalled();
});
it("stays global when no domain is installed", async () => {
  state.authenticated = true;
  const result = await AutomationStudioPage({ searchParams: Promise.resolve({}) });
  expect(result.type).toBe(ProgramWorkspace);
  expect(result.props).toMatchObject({ domainName: "Global", backHref: "/" });
  expect(state.catalog).toHaveBeenCalledWith({});
});
