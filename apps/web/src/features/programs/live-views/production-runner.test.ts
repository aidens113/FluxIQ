import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { productionParameterFields } from "./production-runner";

describe("ProductionRunnerLive contract", () => {
  it("derives bounded friendly parameter controls from target schema", () => {
    expect(productionParameterFields({ properties: { retries: { title: "Retries", type: "number", default: 2 }, enabled: { type: "boolean" } } })).toEqual([
      { name: "retries", label: "Retries", type: "number", defaultValue: 2 },
      { name: "enabled", label: "enabled", type: "boolean" }
    ]);
    expect(productionParameterFields(null)).toEqual([]);
  });

  it("removes raw JSON input and bounds visible logs", () => {
    const source = readFileSync(new URL("./production-runner.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("Parameters JSON");
    expect(source).not.toContain("parametersText");
    expect(source).toContain("allLogRows.slice(0, 500)");
    expect(source).toContain("Selected Run");
    expect(source).toContain("onCancel");
    expect(source).toContain("onAdvance");
  });
});
