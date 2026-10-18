import { describe, expect, it } from "vitest";
import { resolveSetupDomain } from "../resolve-setup-domain";

const alpha = { id: "alpha", title: "Alpha", description: "First domain" };
const beta = { id: "beta", title: "Beta", description: "Second domain" };

describe("resolveSetupDomain", () => {
  it("keeps a requested domain that is installed", () => {
    expect(resolveSetupDomain({ requestedDomainId: "beta", activeDomainId: "alpha", domains: [alpha, beta] })).toEqual({ kind: "scoped", domainId: "beta", redirect: false });
  });
  it("carries the runtime's active domain when none was requested", () => {
    expect(resolveSetupDomain({ requestedDomainId: null, activeDomainId: "alpha", domains: [alpha, beta] })).toEqual({ kind: "scoped", domainId: "alpha", redirect: true });
  });
  it("uses the only installed domain when the runtime names none", () => {
    expect(resolveSetupDomain({ requestedDomainId: null, activeDomainId: null, domains: [beta] })).toEqual({ kind: "scoped", domainId: "beta", redirect: true });
  });
  it("asks the person to choose when several domains are installed and none is active", () => {
    expect(resolveSetupDomain({ requestedDomainId: null, activeDomainId: null, domains: [alpha, beta] })).toEqual({ kind: "choose", domains: [alpha, beta] });
  });
  it("ignores a requested domain that is not installed", () => {
    expect(resolveSetupDomain({ requestedDomainId: "gone", activeDomainId: null, domains: [alpha] })).toEqual({ kind: "scoped", domainId: "alpha", redirect: true });
    expect(resolveSetupDomain({ requestedDomainId: "gone", activeDomainId: null, domains: [alpha, beta] })).toEqual({ kind: "choose", domains: [alpha, beta] });
  });
  it("ignores an active domain that is not registered", () => {
    expect(resolveSetupDomain({ requestedDomainId: null, activeDomainId: "gone", domains: [alpha, beta] })).toEqual({ kind: "choose", domains: [alpha, beta] });
  });
  it("stays global when no domain is installed", () => {
    expect(resolveSetupDomain({ requestedDomainId: null, activeDomainId: null, domains: [] })).toEqual({ kind: "global" });
    expect(resolveSetupDomain({ requestedDomainId: "gone", activeDomainId: null, domains: [] })).toEqual({ kind: "global" });
  });
});
