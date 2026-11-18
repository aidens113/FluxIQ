import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../panel-shell.css", import.meta.url), "utf8");
const phone = css.slice(css.indexOf("@media (max-width: 720px)"), css.indexOf("/* The account menu"));

describe("panel shell on a phone", () => {
  it("reserves the top bar's second row, so the page does not drop when the facts mount", () => {
    expect(phone).toMatch(/\.panel-topbar \{[^}]*min-height: calc\(/u);
    expect(phone).toMatch(/\.panel-topbar-facts \{[^}]*flex: 1 1 100%/u);
  });

  it("gives the Ask button a row of its own instead of floating it over page rows", () => {
    expect(phone).toContain('grid-template-areas: "top" "page" "ask" "rail"');
    const button = /\.panel-dock-button \{([^}]*)\}/u.exec(phone)?.[1] ?? "";
    expect(button).toContain("grid-area: ask");
    expect(button).not.toContain("position: fixed");
  });
});
