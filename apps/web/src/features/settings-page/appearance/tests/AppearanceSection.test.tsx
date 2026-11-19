import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppearanceSection } from "../AppearanceSection";

describe("AppearanceSection", () => {
  it("shows each choice as a framed chip with its radio beside the label", () => {
    const html = renderToStaticMarkup(createElement(AppearanceSection));
    expect(html.match(/class="settings-appearance-choice"/g)).toHaveLength(3);
    expect(html.match(/type="radio"/g)).toHaveLength(3);
  });

  it("draws the chip and its radio from tokens, with the label beside the radio and not under it", () => {
    const css = readFileSync(new URL("../../ui/settings-page.css", import.meta.url), "utf8");
    // `.settings-page label` is a grid; the chip rule must out-rank it or the label drops below the radio.
    expect(css).toMatch(/\.settings-page \.settings-appearance-choice \{[^}]*display: inline-flex/u);
    expect(css).toMatch(/\.settings-page input\[type="radio"\][^{]*\{[^}]*appearance: none/u);
  });
});
