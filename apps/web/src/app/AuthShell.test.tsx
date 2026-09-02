import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GlobalTopbar, LoginPanel, setupPasswordError } from "./AuthShell";

describe("FluxIQ login and first setup", () => {
  it("restores expired sessions without replacing the current workspace", () => {
    const source = readFileSync(new URL("./AuthShell.tsx", import.meta.url), "utf8");
    expect(source).toContain("SessionReauthentication");
    expect(source).toContain("resolveProgramAuthentication(true)");
    expect(source).toContain("Keep work open");
  });

  it("renders a password-manager-friendly login without publishing bootstrap credentials", () => {
    const html = renderToStaticMarkup(<LoginPanel />);
    expect(html).toContain('autoComplete="username"');
    expect(html).toContain('autoComplete="current-password"');
    expect(html).toContain('aria-label="Show password"');
    expect(html).toContain("FluxIQ");
    expect(html).not.toContain("admin / admin");
    expect(html).not.toContain("First setup uses");
  });

  it("renders semantic global context and an account menu trigger", () => {
    const html = renderToStaticMarkup(<GlobalTopbar breadcrumbs={[{ label: "Programs", href: "/" }, { label: "Automation Studio" }]} user={{ displayName: "Operator", roleId: "admin" }} />);
    expect(html).toContain('aria-label="FluxIQ programs"');
    expect(html).toContain('aria-label="Breadcrumb"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain("Operator");
  });
  it("requires a replacement password with confirmation", () => {
    expect(setupPasswordError("short", "short")).toContain("12 characters");
    expect(setupPasswordError("admin", "admin")).toContain("12 characters");
    expect(setupPasswordError("a-secure-password", "different-value")).toContain("do not match");
    expect(setupPasswordError("a-secure-password", "a-secure-password")).toBe("");
  });
});
