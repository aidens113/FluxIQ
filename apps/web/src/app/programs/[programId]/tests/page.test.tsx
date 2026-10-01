import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ authenticated: false, directory: vi.fn((): { domain: { id: string; title: string } | null } => ({ domain: { id: "web", title: "Web" } })), catalog: vi.fn(() => [{ id: "docs", title: "Docs", icon: "book-open" }]) }));
vi.mock("../../../../lib/auth", () => ({ currentFluxIQUser: async () => state.authenticated ? { user: { id: "u", displayName: "User", roleId: "r", totpEnabled: true, pinConfigured: true } } : null }));
vi.mock("../../../../lib/fluxiq", () => ({ getFluxIQ: () => ({ programDirectory: state.directory }) }));
vi.mock("fluxiq", () => ({ defaultGlobalProgramCatalog: state.catalog }));
vi.mock("next/navigation", () => ({ redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }) }));
vi.mock("../ProgramWorkspace", () => ({ ProgramWorkspace: () => null }));
import ProgramPage from "../page";
import { LoginPanel } from "../../../AuthShell";
import { ProgramWorkspace } from "../ProgramWorkspace";
beforeEach(() => { vi.clearAllMocks(); state.authenticated = false; });
function context(domainId: string | string[] = "web") { return { params: Promise.resolve({ programId: "docs" }), searchParams: Promise.resolve({ domainId }) }; }
it("returns inline login before domain/catalog loaders", async () => { expect((await ProgramPage(context())).type).toBe(LoginPanel); expect(state.directory).not.toHaveBeenCalled(); expect(state.catalog).not.toHaveBeenCalled(); });
it("preserves authenticated domain workspace and configured factor metadata", async () => { state.authenticated = true; const result = await ProgramPage(context()); expect(result.type).toBe(ProgramWorkspace); expect(result.props).toMatchObject({ domainName: "Web", backHref: "/domains/web", user: { totpEnabled: true, pinConfigured: true } }); expect(state.catalog).toHaveBeenCalledWith({ domainId: "web" }); });
it("keeps repeated domain parameters from becoming domain authority", async () => { state.authenticated = true; const result = await ProgramPage(context(["web", "other"])); expect(state.directory).not.toHaveBeenCalled(); expect(result.props.backHref).toBe("/"); expect(state.catalog).toHaveBeenCalledWith({}); });
it("preserves authenticated invalid-domain fallback", async () => { state.authenticated = true; state.directory.mockReturnValueOnce({ domain: null }); const result = await ProgramPage(context("missing")); expect(result.props.backHref).toBe("/"); expect(result.props.domainName).toBe("Global"); expect(state.catalog).toHaveBeenCalledWith({}); });
it("preserves authenticated missing-program feedback", async () => { state.authenticated = true; state.catalog.mockReturnValueOnce([]); const result = await ProgramPage(context()); expect(result.props.programId).toBe("docs"); });
