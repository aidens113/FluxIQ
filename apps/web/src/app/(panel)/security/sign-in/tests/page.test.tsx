import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ authenticated: false }));
vi.mock("../../../../../lib/auth", () => ({ currentFluxIQUser: async () => state.authenticated ? { user: { id: "u", username: "member@example.test", displayName: "User", roleId: "r", totpEnabled: true, pinConfigured: false } } : null }));
vi.mock("../../../../../features/security", () => ({ SecuritySignInPage: () => null }));
import SecuritySignInRoute from "../page";
import { LoginPanel } from "../../../../AuthShell";
import { SecuritySignInPage } from "../../../../../features/security";

beforeEach(() => {
  state.authenticated = false;
});

it("asks a signed-out visitor to sign in", async () => {
  expect((await SecuritySignInRoute()).type).toBe(LoginPanel);
});

it("gives the page the signed-in person and their configured factors", async () => {
  state.authenticated = true;
  const result = await SecuritySignInRoute();
  expect(result.type).toBe(SecuritySignInPage);
  expect(result.props.user).toEqual({ id: "u", username: "member@example.test", displayName: "User", roleId: "r", totpEnabled: true, pinConfigured: false });
});
