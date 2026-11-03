// Coverage of raw-codes.ts and its use in FluxIQ's turns: a dotted code in
// brackets ("(flow_bootstrap.blank_target_required)") is Core's record, not
// words, and the chat never shows it (U1 of the run-muw60unq-591e23bd UI
// review: the panel opened on a thread ending "Flow Bootstrap generation
// failed (flow_bootstrap.blank_target_required) (pre_provider_validation:
// flow_bootstrap.blank_target_required)").

import assert from "node:assert/strict";
import { test } from "vitest";
import { parseAssistantText, parseRuns } from "../assistant-text.ts";
import { withoutRawCodes } from "../raw-codes.ts";

const U1 = "\"Improve a Flow that already has steps\" stopped because the build failed: Flow Bootstrap generation failed (flow_bootstrap.blank_target_required) (pre_provider_validation: flow_bootstrap.blank_target_required). Before that I saved what should change as an instruction on the Flow.";

test("a bracketed code, alone or after a label, is left out with the space before it", () => {
  assert.equal(withoutRawCodes(U1), "\"Improve a Flow that already has steps\" stopped because the build failed: Flow Bootstrap generation failed. Before that I saved what should change as an instruction on the Flow.");
  assert.equal(withoutRawCodes("It stopped (web.action.rejected.not_at_start_location, core.replay.failed)."), "It stopped.");
  assert.equal(withoutRawCodes("It stopped [code: llm_evidence_loop.repeat_refused]"), "It stopped");
});

test("brackets that hold words, an address or a file name are kept", () => {
  for (const kept of [
    "Open the form (the blue button) and send it.",
    "Saved as report.csv (12 rows).",
    "The store (shop.example.com) is open.",
    "Read it on www.example.com (see the help page).",
    "It took 2.5 s (about 3 tries)."
  ]) assert.equal(withoutRawCodes(kept), kept);
});

test("FluxIQ's turns read without the codes, while inline code it marked as code stays as it was written", () => {
  const blocks = parseAssistantText(U1);
  assert.equal(blocks.length, 1);
  const text = blocks[0]!.kind === "paragraph" ? blocks[0]!.runs.map((run) => run.text).join("") : "";
  assert.doesNotMatch(text, /flow_bootstrap|pre_provider_validation|\(\s*\)/u);
  assert.ok(text.endsWith("generation failed. Before that I saved what should change as an instruction on the Flow."), text);
  assert.deepEqual(parseRuns("Run `web.dom.click` now"), [{ kind: "text", text: "Run " }, { kind: "code", text: "web.dom.click" }, { kind: "text", text: " now" }]);
});
