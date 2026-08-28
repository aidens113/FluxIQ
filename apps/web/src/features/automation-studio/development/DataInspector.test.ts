import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Automation Studio data inspector", () => {
  it("provides separate data views without adding an inspector polling loop", () => {
    const source = readFileSync(new URL("./DataInspector.tsx", import.meta.url), "utf8");
    expect(source).toContain('options={["Overview", "Requests", "SQL", "Browser"]}');
    expect(source).toContain('"get-performance-metrics"');
    expect(source).not.toContain("setInterval");
  });
});
