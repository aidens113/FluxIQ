// The six model-access states: each one's badge, sentence and single action, word for word.

import assert from "node:assert/strict";
import { test } from "vitest";
import { modelAccessWords, type ModelAccessState } from "../index.ts";

const CASES: ReadonlyArray<[ModelAccessState, string, string, string, string]> = [
  [{ kind: "ready", provider: "Anthropic", keyName: "Work key" }, "Ready", "Anthropic is ready, using Work key.", "change-model", "Change model"],
  [{ kind: "no-key" }, "No key", "Add an AI key to start. FluxIQ uses it to understand and build what you ask.", "add-key", "Add a key"],
  [{ kind: "cant-open", keyName: "Work key" }, "Can't open", "FluxIQ saved Work key but can't read it any more. Paste it again to keep going.", "paste-again", "Paste it again"],
  [{ kind: "not-accepted", provider: "DeepSeek", keyName: "Home key" }, "Not accepted", "DeepSeek did not accept Home key. Check that it was copied in full.", "replace-key", "Replace key"],
  [{ kind: "unreachable", provider: "Anthropic" }, "Can't reach Anthropic", "FluxIQ couldn't reach Anthropic just now. It tries again on your next message.", "try-now", "Try now"],
  [{ kind: "update-fluxiq" }, "Update FluxIQ", "This FluxIQ is too old to use your AI key. Update it.", "how-to-update", "How to update"]
];

test("each state has its fixed badge, sentence and one action", () => {
  for (const [state, badge, sentence, id, label] of CASES) {
    const words = modelAccessWords(state);
    assert.equal(words.badge, badge);
    assert.equal(words.sentence, sentence);
    assert.deepEqual(words.action, { id, label });
  }
});

test("no state uses a banned word", () => {
  for (const [state] of CASES) {
    const words = modelAccessWords(state);
    assert.doesNotMatch(`${words.badge} ${words.sentence} ${words.action.label}`, /unlock|vault|seal|credential|scope|token/iu);
  }
});
