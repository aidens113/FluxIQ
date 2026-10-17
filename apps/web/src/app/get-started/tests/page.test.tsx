import { Suspense } from "react";
import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ authenticated: false, activeDomainId: null as string | null, domains: [] as { id: string; title: string; description: string }[] }));
vi.mock("../../../lib/auth", () => ({ currentFluxIQUser: async () => state.authenticated ? { user: {} } : null }));
vi.mock("../../../lib/fluxiq", () => ({ getFluxIQ: () => ({ activeDomainId: state.activeDomainId, domains: { summaries: () => state.domains } }) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }) }));
vi.mock("../GetStartedClient", () => ({ GetStartedClient: () => null }));
import GetStartedPage from "../page";
import { LoginPanel } from "../../AuthShell";
import { GetStartedClient } from "../GetStartedClient";
import { SetupDomainChoice } from "../SetupDomainChoice";

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
it("preserves the authenticated setup Suspense/client composition", async () => {
  const result = await open();
  expect(result.type).toBe(Suspense);
  expect(result.props.children.type).toBe(GetStartedClient);
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
  expect(result.type).toBe(Suspense);
  expect(result.props.children.type).toBe(GetStartedClient);
});
it("asks the person to choose a domain when several are installed and none is active", async () => {
  state.domains = [alpha, beta];
  const result = await open();
  expect(result.type).toBe(SetupDomainChoice);
  expect(result.props.domains).toEqual([alpha, beta]);
});
