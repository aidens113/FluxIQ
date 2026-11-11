// tokens.css: dark brand values on `:root`, and one light theme written twice,
// under `[data-theme="light"]` and under `prefers-color-scheme: light` for
// `[data-theme="system"]`. The two light copies must not drift, every colour
// must have a light value unless it is the same in both themes, and
// light-dark() must not come back (Chrome 116, the extension's floor, lacks it).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

const TOKENS = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "tokens.css"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "");

/** Colours that are the same in both themes: the amber fill and the ink written on it. */
const SAME_IN_BOTH = new Set(["--accent", "--accent-ink", "--send", "--send-text"]);

/** The declarations of the first rule whose selector is exactly `selector`. */
function block(selector: string): Map<string, string> {
  const start = TOKENS.indexOf(`${selector} {`);
  assert.ok(start >= 0, `${selector} is in tokens.css`);
  const body = TOKENS.slice(start + selector.length + 2, TOKENS.indexOf("}", start));
  return new Map([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((match) => [match[1]!, match[2]!.trim()]));
}

const isColour = (value: string): boolean => /#[0-9a-f]{3,8}\b|rgb\(/i.test(value);

test("the light theme is the same under data-theme light and under the OS preference", () => {
  const light = block(':root[data-theme="light"]');
  const system = block(':root[data-theme="system"]');
  assert.ok(TOKENS.includes("@media (prefers-color-scheme: light)"), "the system copy sits in a prefers-color-scheme query");
  assert.deepEqual([...system.entries()], [...light.entries()]);
});

test("every colour token has a light value, unless it is the same in both themes", () => {
  const dark = block(":root");
  const light = block(':root[data-theme="light"]');
  const missing = [...dark].filter(([name, value]) => isColour(value) && !SAME_IN_BOTH.has(name) && !light.has(name)).map(([name]) => name);
  assert.deepEqual(missing, []);
  const unknown = [...light.keys()].filter((name) => !dark.has(name));
  assert.deepEqual(unknown, []);
});

test("tokens.css does not use light-dark(), which the extension's oldest Chrome cannot read", () => {
  assert.doesNotMatch(TOKENS, /light-dark\(/);
});
