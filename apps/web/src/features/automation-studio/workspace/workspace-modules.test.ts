import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const moduleDirectories = ["layout", "components"] as const;

function implementationFiles(directory: string): string[] {
  return readdirSync(new URL(`./${directory}/`, import.meta.url))
    .filter((file) => file.endsWith(".ts") || file.endsWith(".tsx"));
}

describe("workspace module ownership", () => {
  it("keeps compatibility barrels declarative and tiny", () => {
    for (const file of ["layout.ts", "components.tsx"]) {
      const source = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
      const lines = source.trim().split(/\r?\n/);
      expect(lines.length).toBeLessThanOrEqual(10);
      expect(lines.every((line) => line.startsWith("export * from "))).toBe(true);
    }
  });

  it("keeps precise workspace implementations below the 300-line target", () => {
    for (const directory of moduleDirectories) {
      for (const file of implementationFiles(directory)) {
        const source = readFileSync(new URL(`./${directory}/${file}`, import.meta.url), "utf8");
        expect(source.split(/\r?\n/).length, `${directory}/${file}`).toBeLessThanOrEqual(300);
      }
    }
  });
});
