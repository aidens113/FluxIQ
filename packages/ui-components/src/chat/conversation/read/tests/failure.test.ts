import assert from "node:assert/strict";
import { test } from "vitest";
import { readFailureNotice } from "../failure.ts";

test("a failure code the chat knows names its own cause", () => {
  assert.equal(readFailureNotice("list", { ok: false, sentence: "x", code: "unreachable" }), "This chat isn't updating: finding this chat in FluxIQ failed (FluxIQ can't be reached).");
  assert.equal(readFailureNotice("thread", { ok: false, sentence: "x", code: "not_paired" }), "This chat isn't updating: reading this chat's messages from FluxIQ failed (this browser isn't paired with FluxIQ).");
});

test("the host's own words for a failure only it can name are the cause, ahead of the detail and the sentence", () => {
  const failure = { ok: false as const, sentence: "The extension restarted.", detail: "port closed", cause: "the extension's background didn't answer" };
  assert.equal(readFailureNotice("list", failure), "This chat isn't updating: finding this chat in FluxIQ failed (the extension's background didn't answer).");
});

test("with no cause the detail, then the sentence, then a plain admission", () => {
  assert.match(readFailureNotice("list", { ok: false, sentence: "Sentence.", detail: "Detail text" }), /\(Detail text\)/);
  assert.match(readFailureNotice("list", { ok: false, sentence: "Sentence." }), /\(Sentence\)/);
  assert.match(readFailureNotice("list", { ok: false, sentence: "  " }), /\(no reason was given\)/);
});
