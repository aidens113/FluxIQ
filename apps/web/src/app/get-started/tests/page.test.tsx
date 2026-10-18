import { Suspense } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
const signedIn = vi.hoisted(() => ({ displayName: "Ada Admin", roleId: "admin" }));
const state = vi.hoisted(() => ({ authenticated: false, activeDomainId: null as string | null, domains: [] as { id: string; title: string; description: string }[] }));
vi.mock("../../../lib/auth", () => ({ currentFluxIQUser: async () => state.authenticated ? { user: signedIn } : null }));
vi.mock("../../../lib/fluxiq", () => ({ getFluxIQ: () => ({ activeDomainId: state.activeDomainId, domains: { summaries: () => state.domains } }) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }) }));
vi.mock("../GetStartedClient", () => ({ GetStartedClient: () => <section>Onboarding body</section> }));
vi.mock("../../AuthShell", () => ({
  GlobalTopbar: (props: { user: { displayName: string } }) => <nav className="global-topbar">Topbar for {props.user.displayName}</nav>,
  LoginPanel: () => <div>Login required</div>
}));
import GetStartedPage from "../page";
import { LoginPanel } from "../../AuthShell";
import { GetStartedClient } from "../GetStartedClient";
import { SetupDomainChoice } from "../SetupDomainChoice";
import { GetStartedFrame } from "../GetStartedFrame";

const alpha = { id: "alpha", title: "Alpha", description: "First domain" };
const beta = { id: "beta", title: "Beta", description: "Second domain" };
const open = (query: Record<string, string> = {}) => GetStartedPage({ searchParams: Promise.resolve(query) });
beforeEach(() => {
  state.authenticated = true;
  state.activeDomainId = null;
  state.domains = [];
});

it("keeps an unauthenticated setup request on its own inline sign-in route", async () => {
  state.authenticated = false;
  expect((await open()).type).toBe(LoginPanel);
});
it("frames authenticated setup like the other top-level pages around the Suspense/client composition", async () => {
  const result = await open();
  expect(result.type).toBe(GetStartedFrame);
  expect(result.props.user).toBe(signedIn);
  expect(result.props.children.type).toBe(Suspense);
  expect(result.props.children.props.children.type).toBe(GetStartedClient);
});
it("renders the setup page inside the directory chrome with the signed-in user's topbar", async () => {
  const html = renderToStaticMarkup(await open());
  expect(html).toMatch(/^<main class="directory-page"><nav class="global-topbar">Topbar for Ada Admin<\/nav><div class="directory-container"><header class="directory-heading">/u);
  expect(html).toContain('<h1 class="page-title">');
  expect(html).toContain("Onboarding body");
});
it("sends a domain-less setup request to the runtime's installed domain", async () => {
  state.activeDomainId = "alpha";
  state.domains = [alpha];
  await expect(open()).rejects.toThrow("redirect:/get-started?domainId=alpha");
});
it("keeps an installed requested domain without redirecting", async () => {
  state.activeDomainId = "alpha";
  state.domains = [alpha, beta];
  const result = await open({ domainId: "beta" });
  expect(result.type).toBe(GetStartedFrame);
  expect(result.props.children.props.children.type).toBe(GetStartedClient);
});
it("asks the person to choose a domain when several are installed and none is active", async () => {
  state.domains = [alpha, beta];
  const result = await open();
  expect(result.type).toBe(SetupDomainChoice);
  expect(result.props.domains).toEqual([alpha, beta]);
  expect(result.props.user).toBe(signedIn);
  const html = renderToStaticMarkup(result);
  expect(html).toMatch(/^<main class="directory-page"><nav class="global-topbar">Topbar for Ada Admin<\/nav><div class="directory-container"><header class="directory-heading">/u);
  expect(html).toContain("Choose a domain");
  expect(html).toContain('href="/get-started?domainId=beta"');
});
