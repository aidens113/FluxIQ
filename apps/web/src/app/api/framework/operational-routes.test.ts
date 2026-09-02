import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("operational framework route authorization", () => {
  it("binds every route module to the fail-closed disposition registry", () => {
    for (const file of ["setup/route.ts", "io/route.ts", "io/validate/route.ts"]) {
      const source = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
      expect(source).toContain("operationalRouteContract");
      expect(source).toContain("canUseOperationalRoute");
      expect(source).toContain("status: 401");
      expect(source).toContain("status: 403");
    }
  });

  it("rejects unsupported setup actions instead of treating them as setup", () => {
    const source = readFileSync(new URL("./setup/route.ts", import.meta.url), "utf8");
    expect(source).toContain("Unsupported framework setup action");
    expect(source).toContain("status: 400");
  });
});
