import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const runtimeControlsCss = readFileSync(
  new URL("../styles/runtime/04-controls-details.css", import.meta.url),
  "utf8"
);

function runtimeModeGridRule(): string {
  const match = runtimeControlsCss.match(
    /\.automation-runtime-mode-control\s*>\s*div\s*\{(?<body>[^}]*)\}/u
  );
  expect(match?.groups?.body).toBeDefined();
  return match!.groups!.body!;
}

describe("Runtime Debug layout contract", () => {
  it("wraps execution modes from the available pane width without clipping them", () => {
    const rule = runtimeModeGridRule();

    expect(rule).toMatch(
      /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(150px,\s*100%\),\s*1fr\)\)/u
    );
    expect(rule).not.toMatch(/grid-template-columns:\s*repeat\(3,/u);
    expect(rule).not.toMatch(/overflow:\s*hidden/u);
  });
});
