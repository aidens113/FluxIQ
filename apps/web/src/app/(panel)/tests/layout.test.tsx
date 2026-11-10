import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ authenticated: true }));
vi.mock("../../../lib/auth", () => ({ currentFluxIQUser: async () => state.authenticated ? { user: { id: "user.one" } } : null }));
vi.mock("../../AuthShell", () => ({ LoginPanel: () => <div>Login required</div> }));
vi.mock("../../../features/panel-shell", () => ({ PanelShell: (props: { children: React.ReactNode }) => <div data-shell>{props.children}</div> }));
import PanelLayout from "../layout";

beforeEach(() => { state.authenticated = true; });
it("puts a signed-in person's page inside the shell", async () => {
  const html = renderToStaticMarkup(await PanelLayout({ children: <p>The page</p> }));
  expect(html).toContain("data-shell");
  expect(html).toContain("The page");
});
it("keeps the sign-in surface for a signed-out person, without the shell or the page", async () => {
  state.authenticated = false;
  const html = renderToStaticMarkup(await PanelLayout({ children: <p>The page</p> }));
  expect(html).toContain("Login required");
  expect(html).not.toContain("data-shell");
  expect(html).not.toContain("The page");
});
