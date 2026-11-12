import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("global program request ownership", () => {
  it("routes all program API reads and mutations through the shared coordinator", () => {
    const source = readFileSync(new URL("../program-api.ts", import.meta.url), "utf8");
    expect(source.match(/coordinateProgramRequest\(/g)).toHaveLength(2);
    expect(source).toContain("programRequestPolicy");
  });
});
