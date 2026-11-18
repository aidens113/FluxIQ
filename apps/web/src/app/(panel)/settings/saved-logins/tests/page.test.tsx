import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ authenticated: false }));
vi.mock("../../../../../lib/auth", () => ({ currentFluxIQUser: async () => state.authenticated ? { user: { id: "u", displayName: "User", roleId: "r", totpEnabled: true, pinConfigured: true } } : null }));
vi.mock("../../../../../features/security", () => ({ SecurityKeysPage: () => null }));
import SavedLoginsRoute from "../page";
import { LoginPanel } from "../../../../AuthShell";
import { SecurityKeysPage } from "../../../../../features/security";

beforeEach(() => {
  state.authenticated = false;
});

it("asks a signed-out visitor to sign in", async () => {
  expect((await SavedLoginsRoute()).type).toBe(LoginPanel);
});

it("gives the page the signed-in person and whether they use two-step sign-in, and never a PIN", async () => {
  state.authenticated = true;
  const result = await SavedLoginsRoute();
  expect(result.type).toBe(SecurityKeysPage);
  expect(result.props.user).toEqual({ id: "u", displayName: "User", roleId: "r", totpEnabled: true, pinConfigured: undefined });
});
