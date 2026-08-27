import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

describe("web typography contract", () => {
  it("does not use sub-caption literal type", () => {
    expect(css).not.toMatch(/font-size:\s*(?:[0-9]|10)px/);
  });

  it("keeps letter spacing neutral and avoids viewport-scaled text", () => {
    const letterSpacings = [...css.matchAll(/letter-spacing:\s*([^;]+)/g)].map((match) => match[1]?.trim());
    expect(new Set(letterSpacings)).toEqual(new Set(["0"]));
    expect(css).not.toMatch(/font-size:[^;]*(?:vw|vh|vmin|vmax)/);
  });
});