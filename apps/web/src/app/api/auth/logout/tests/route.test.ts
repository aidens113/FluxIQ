import { afterEach, describe, expect, it, vi } from "vitest";

const revokeSession = vi.hoisted(() => vi.fn());
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "dummy-session" }) }) }));
vi.mock("../../../../../lib/fluxiq", () => ({ getFluxIQ: () => ({ programs: { identityAccess: { revokeSession } } }) }));

afterEach(() => {
  delete process.env.FLUXIQ_PROFILE;
  delete process.env.FLUXIQ_PUBLIC_ORIGIN;
  vi.resetModules();
});

describe("logout", () => {
  it("clears a __Host- cookie with Secure and Path=/", async () => {
    process.env.FLUXIQ_PROFILE = "self-hosted";
    process.env.FLUXIQ_PUBLIC_ORIGIN = "https://panel.example.test";
    vi.resetModules();
    const { POST } = await import("../route");
    const response = await POST();
    expect(revokeSession).toHaveBeenCalledWith("dummy-session");
    const header = response.headers.get("set-cookie") ?? "";
    expect(header).toContain("__Host-fluxiq_session=;");
    expect(header).toContain("Secure");
    expect(header).toContain("Path=/");
    expect(header).toContain("HttpOnly");
    expect(header).toMatch(/Max-Age=0/i);
  });

  it("clears the plain cookie on the local profile", async () => {
    vi.resetModules();
    const { POST } = await import("../route");
    const header = (await POST()).headers.get("set-cookie") ?? "";
    expect(header).toContain("fluxiq_session=;");
    expect(header).not.toContain("Secure");
  });
});
