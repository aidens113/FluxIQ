import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Problems architecture", () => {
  it("has no direct Program API, cross-domain private imports, browser globals, or graph recomputation", () => {
    const sources = readdirSync(new URL(".", import.meta.url))
      .filter((name) => /\.(?:ts|tsx)$/u.test(name) && !name.includes(".test."))
      .map((name) => ({ name, source: readFileSync(new URL(name, import.meta.url), "utf8") }));

    for (const { name, source } of sources) {
      expect(source, name).not.toContain("program-api");
      expect(source, name).not.toContain("useProgramApi");
      expect(source, name).not.toContain("useProgramTransport");
      expect(source, name).not.toMatch(/from\s+["']\.\.\/(?!data\/program-transport|views\/view-registry)/u);
      expect(source, name).not.toMatch(/\b(?:window|document|localStorage|sessionStorage)\b/u);
      expect(source, name).not.toContain("automationPolicyGraphProblems");
      expect(source, name).not.toContain("scheduleAutomationGraphIdleTask");
    }
  });

  it("keeps production files focused and bounded", () => {
    for (const name of ["ProblemsView.tsx", "problem-host.ts", "problem-model.ts"]) {
      const source = readFileSync(new URL(name, import.meta.url), "utf8");
      expect(source.split(/\r?\n/u).length, name).toBeLessThanOrEqual(300);
    }
  });
});
