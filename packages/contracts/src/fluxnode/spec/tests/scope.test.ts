// The scope: normalising the grant and matching sites against it.
import { describe, expect, it } from "vitest";
import { fluxNodeScopeAllowsSite, fluxNodeScopeSchema } from "../index.ts";

describe("fluxNodeScopeSchema", () => {
  it("lowercases sites, drops repeats and the read act", () => {
    expect(fluxNodeScopeSchema.parse({ sites: ["Market.Example", "market.example"], apps: ["notepad.exe", "notepad.exe"], acts: ["read", "send", "send"] })).toEqual({
      sites: ["market.example"],
      apps: ["notepad.exe"],
      acts: ["send"]
    });
  });

  it("refuses an address in place of a host, and unknown keys", () => {
    expect(fluxNodeScopeSchema.safeParse({ sites: ["https://market.example/"], acts: [] }).success).toBe(false);
    expect(fluxNodeScopeSchema.safeParse({ acts: [], pages: [] }).success).toBe(false);
    expect(fluxNodeScopeSchema.safeParse({ sites: [] }).success).toBe(false);
  });
});

describe("fluxNodeScopeAllowsSite", () => {
  it("covers a site and its subdomains, never a lookalike", () => {
    const scope = fluxNodeScopeSchema.parse({ sites: ["market.example"], acts: [] });
    expect(fluxNodeScopeAllowsSite(scope, "market.example")).toBe(true);
    expect(fluxNodeScopeAllowsSite(scope, "www.market.example")).toBe(true);
    expect(fluxNodeScopeAllowsSite(scope, "evilmarket.example")).toBe(false);
    expect(fluxNodeScopeAllowsSite(scope, "market.example.evil")).toBe(false);
  });

  it("matches a port only when the entry names one, and allows any site with no sites listed", () => {
    const scope = fluxNodeScopeSchema.parse({ sites: ["localhost:3000", "shop.example"], acts: [] });
    expect(fluxNodeScopeAllowsSite(scope, "localhost:3000")).toBe(true);
    expect(fluxNodeScopeAllowsSite(scope, "localhost:4000")).toBe(false);
    expect(fluxNodeScopeAllowsSite(scope, "shop.example:8443")).toBe(true);
    expect(fluxNodeScopeAllowsSite(fluxNodeScopeSchema.parse({ acts: [] }), "anything.example")).toBe(true);
  });
});
