import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const tokensPath = createRequire(import.meta.url).resolve("@fluxiq/ui-components/styles/tokens.css");
const hostCss = readFileSync(path.join(here, "..", "chat-widget.css"), "utf8").replace(/\/\*[\s\S]*?\*\//gu, "");
const panelCss = readFileSync(path.join(here, "..", "..", "..", "app", "styles", "global-foundation", "01-tokens-and-reset.css"), "utf8");

const names = (css: string): string[] => [...new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/gu)].map((match) => match[1]!))];

/** The declarations inside the first `.chat-widget-host { ... }` rule. */
function hostRule(css: string): string {
  const start = css.indexOf(".chat-widget-host {");
  return css.slice(start, css.indexOf("\n}", start));
}

describe("the chat widget's tokens", () => {
  it("defines every custom property the package's tokens.css defines, on the host", () => {
    const wanted = names(readFileSync(tokensPath, "utf8"));
    expect(wanted.length).toBeGreaterThan(30);
    const defined = new Set(names(hostRule(hostCss)));
    expect(wanted.filter((name) => !defined.has(name))).toEqual([]);
  });

  it("takes each value from a token the panel itself defines, and never repaints :root", () => {
    const panel = new Set(names(panelCss));
    const used = [...hostRule(hostCss).matchAll(/var\((--[a-z0-9-]+)\)/gu)].map((match) => match[1]!);
    const own = new Set(names(hostRule(hostCss)));
    expect(used.filter((name) => !panel.has(name) && !own.has(name))).toEqual([]);
    expect(hostCss).not.toMatch(/:root/u);
    expect(hostCss).not.toMatch(/@import/u);
  });
});
