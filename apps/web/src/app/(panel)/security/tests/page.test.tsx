import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ authenticated: true, totpEnabled: false }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`REDIRECT ${path}`); } }));
vi.mock("../../../../lib/auth", () => ({ currentFluxIQUser: async () => state.authenticated ? { user: { id: "u", username: "a@example.test", displayName: "A", roleId: "admin", totpEnabled: state.totpEnabled, pinConfigured: false } } : null }));
vi.mock("../../../../features/security", () => ({
  SecurityDevicesPage: () => <div data-tab="devices" />,
  SecurityActivityPage: () => <div data-tab="activity" />,
  SecurityPeoplePage: (props: { twoStep: boolean }) => <div data-tab="people" data-two-step={String(props.twoStep)} />,
  SecurityAdvancedPage: () => <div data-tab="advanced" />
}));
import SecurityRoute from "../page";
import SecurityDevicesRoute from "../devices/page";
import SecurityActivityRoute from "../activity/page";
import SecurityPeopleRoute from "../people/page";
import { LoginPanel } from "../../../AuthShell";

beforeEach(() => {
  state.authenticated = true;
  state.totpEnabled = false;
});

it("opens the first tab, Your sign-in, from /security", () => {
  expect(() => SecurityRoute()).toThrow("REDIRECT /security/sign-in");
});

it("serves the devices and activity tabs", () => {
  expect(renderToStaticMarkup(<SecurityDevicesRoute />)).toContain('data-tab="devices"');
  expect(renderToStaticMarkup(<SecurityActivityRoute />)).toContain('data-tab="activity"');
});

it("tells the people tab whether the viewer has two-step sign-in on, and asks a signed-out visitor to sign in", async () => {
  state.totpEnabled = true;
  const page = await SecurityPeopleRoute();
  expect(page.props.twoStep).toBe(true);
  state.authenticated = false;
  expect((await SecurityPeopleRoute()).type).toBe(LoginPanel);
});
