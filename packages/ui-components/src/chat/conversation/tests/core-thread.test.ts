// Reading Core's thread page: a turn keeps Core's own write time when Core
// sent a finite number, and a missing or malformed one is left out rather
// than guessed.

import assert from "node:assert/strict";
import { test } from "vitest";
import { parseThreadPage } from "../core-thread.ts";

function page(turn: Record<string, unknown>): unknown {
  return {
    conversation: { conversationId: "c1", projectId: "p1", revision: 1 },
    turns: [{ turnId: "t1", author: "automation", text: "Hello", ask: null, ...turn }],
    hasMore: false
  };
}

test("a turn keeps the time Core wrote it", () => {
  assert.equal(parseThreadPage(page({ createdAt: 1_700_000_000_000 }))?.turns[0]?.createdAt, 1_700_000_000_000);
});

test("a turn without a usable time has none", () => {
  for (const createdAt of [undefined, "2026-09-29", Number.NaN, Number.POSITIVE_INFINITY]) {
    const turn = parseThreadPage(page({ createdAt }))?.turns[0];
    assert.ok(turn, "the turn is still read");
    assert.equal("createdAt" in turn, false);
  }
});
