import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, "$1");
function sheets(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "tests" ? [] : sheets(path);
    return name.endsWith(".css") ? [path] : [];
  });
}

describe("one select height", () => {
  it("defines the height once, as a token", () => {
    expect(readFileSync(join(root, "global-foundation", "01-tokens-and-reset.css"), "utf8")).toMatch(/--select-height:\s*\d+px/u);
  });

  it("lets no panel stylesheet give a select a height of its own", () => {
    const own: string[] = [];
    for (const path of sheets(root)) {
      for (const [, selectors, body] of readFileSync(path, "utf8").matchAll(/([^{}]+)\{([^{}]*)\}/gu)) {
        const names = selectors!.split(",").map((part) => part.trim());
        const forSelect = names.some((part) => /\bselect\b(?!ed)/u.test(part));
        const alone = names.every((part) => /\bselect\b(?!ed)/u.test(part));
        if (!forSelect || !alone) continue;
        if (/(^|;|\s)(min-)?height:\s*\d+px/u.test(body!)) own.push(`${path}: ${selectors!.trim()}`);
      }
    }
    expect(own).toEqual([]);
  });
});
