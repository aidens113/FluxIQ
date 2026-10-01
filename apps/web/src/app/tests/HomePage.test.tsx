import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ authenticated: true }));
vi.mock("../../lib/auth", () => ({ currentFluxIQUser: async () => state.authenticated ? { user: { id: "user.one" } } : null }));
vi.mock("../../lib/fluxiq", () => ({ getFluxIQ: () => ({ domains: { summaries: () => [] } }) }));
vi.mock("fluxiq", () => ({ defaultGlobalProgramCatalog: () => [] }));
vi.mock("../AuthShell", () => ({ GlobalTopbar: () => <nav>Topbar</nav>, LoginPanel: () => <div>Login required</div> }));
vi.mock("../ProgramLauncher", () => ({ ProgramLauncher: () => <section>Programs preserved</section> }));
import HomePage from "../page";

beforeEach(() => { state.authenticated = true; });
it("makes setup discoverable beside the authenticated program directory", async () => {
  const html = renderToStaticMarkup(await HomePage());
  expect(html).toContain('href="/get-started"');
  expect(html).toContain("Get started");
  expect(html).toContain("Programs preserved");
});
it("keeps the unauthenticated login surface", async () => {
  state.authenticated = false;
  const html = renderToStaticMarkup(await HomePage());
  expect(html).toContain("Login required");
  expect(html).not.toContain("/get-started");
});
