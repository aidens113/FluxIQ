// The key card's sheet: the card keeps its own height inside the transcript's scroller instead of being cut by it.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

const SHEET = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "model-access.css"), "utf8");

test("the key card and its bar are not shrunk or clipped by the scroller around them", () => {
  const rule = SHEET.match(/\.chat-key-card,\s*\.chat-key-bar\s*\{([^}]*)\}/);
  assert.ok(rule, "a rule covers both");
  assert.match(rule![1]!, /flex:\s*none/);
  assert.match(rule![1]!, /overflow:\s*visible/);
});
