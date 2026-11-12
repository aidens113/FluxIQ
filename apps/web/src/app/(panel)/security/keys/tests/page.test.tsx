import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ authenticated: false }));
vi.mock("../../../../../lib/auth", () => ({ currentFluxIQUser: async () => state.authenticated ? { user: { id: "u", displayName: "User", roleId: "r", totpEnabled: true, pinConfigured: false } } : null }));
vi.mock("../../../../../features/security", () => ({ SecurityKeysPage: () => null }));
import SecurityKeysRoute from "../page";
import { LoginPanel } from "../../../../AuthShell";
import { SecurityKeysPage } from "../../../../../features/security";

beforeEach(() => {
  state.authenticated = false;
});

it("asks a signed-out visitor to sign in", async () => {
  expect((await SecurityKeysRoute()).type).toBe(LoginPanel);
});

it("gives the page the signed-in person and their configured factors", async () => {
  state.authenticated = true;
  const result = await SecurityKeysRoute();
  expect(result.type).toBe(SecurityKeysPage);
  expect(result.props.user).toEqual({ id: "u", displayName: "User", roleId: "r", totpEnabled: true, pinConfigured: false });
});
