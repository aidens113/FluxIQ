import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Problems transport boundary", () => {
  it("keeps Program API and transport ownership outside the Problems component", () => {
    const viewSource = readFileSync(new URL("./ProblemsView.tsx", import.meta.url), "utf8");
    const hostSource = readFileSync(new URL("./problem-host.ts", import.meta.url), "utf8");

    expect(viewSource).not.toContain("useProgramApi");
    expect(viewSource).not.toContain("useProgramTransport");
    expect(viewSource).not.toMatch(/\b(?:api|transport|programApi)\.(?:get|post)\s*\(/u);
    expect(viewSource).not.toMatch(/\bfetch\s*\(/u);
    expect(hostSource).not.toContain("useProgramApi");
    expect(hostSource).not.toContain("useProgramTransport");
    expect(hostSource).toContain("ProblemsViewHostModel");
    expect(hostSource).toContain("ProblemsViewHostCommands");
  });
});
