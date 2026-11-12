import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ authenticated: false }));
vi.mock("../../../../../lib/auth", () => ({ currentFluxIQUser: async () => state.authenticated ? { user: { id: "u", displayName: "User", roleId: "r", totpEnabled: true, pinConfigured: true } } : null }));
vi.mock("next/navigation", () => ({ notFound: vi.fn(() => { throw new Error("not-found"); }) }));
vi.mock("../../../../../features/settings-page/tools", () => ({ SettingsToolPage: () => null, SettingsToolView: () => null }));
import SettingsToolRoute from "../page";
import { LoginPanel } from "../../../../AuthShell";
import { SettingsToolPage } from "../../../../../features/settings-page";

const props = (tool: string) => ({ params: Promise.resolve({ tool }) });
beforeEach(() => {
  state.authenticated = false;
});

it("asks a signed-out visitor to sign in before reading anything", async () => {
  expect((await SettingsToolRoute(props("docs"))).type).toBe(LoginPanel);
});

it("shows each retired program's tool with the signed-in person's factors", async () => {
  state.authenticated = true;
  for (const id of ["background-tasks", "compute-control", "database-manager", "deployment-sync", "docs", "production-runner", "runtime"]) {
    const result = await SettingsToolRoute(props(id));
    expect(result.type).toBe(SettingsToolPage);
    expect(result.props.tool).toMatchObject({ id, href: `/settings/${id}` });
    expect(result.props.user).toMatchObject({ id: "u", totpEnabled: true, pinConfigured: true });
  }
});

it("has no page for an id that is not a Settings tool", async () => {
  state.authenticated = true;
  await expect(SettingsToolRoute(props("secret-keys"))).rejects.toThrow("not-found");
  await expect(SettingsToolRoute(props("nothing"))).rejects.toThrow("not-found");
});
