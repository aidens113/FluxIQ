// The humanness sheet: the value keeps one width from 0 to 100, so the label beside it never rewraps and the
// control below never moves when the value gains a digit.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

const SHEET = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "humanness.css"), "utf8");

test("the value is wide enough for 100 and never shrinks or grows with its digits", () => {
  const rule = SHEET.match(/\.humanness-value\s*\{([^}]*)\}/);
  assert.ok(rule, "the value has a rule");
  assert.match(rule![1]!, /min-width:\s*3ch/);
  assert.match(rule![1]!, /flex:\s*none/);
  assert.match(rule![1]!, /tabular-nums/);
});
