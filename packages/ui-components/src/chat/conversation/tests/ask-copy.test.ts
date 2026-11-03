// How each kind of question FluxIQ asks is shown, and what each answer sends
// (Core's answer kinds: grant or deny, choice by option id, text).

import assert from "node:assert/strict";
import { test } from "vitest";
import { askPresentation } from "../ask-copy.ts";
import { parseThreadPage, type CoreAsk } from "../core-thread.ts";

function ask(overrides: Partial<CoreAsk>): CoreAsk {
  return { askId: "ask-1", kind: "confirm", status: "pending", options: null, answer: null, ...overrides };
}

test("pending questions offer the answers Core accepts for their kind", () => {
  assert.deepEqual(askPresentation(ask({ kind: "permission" })), {
    state: "choices", choices: [{ label: "Allow", kind: "grant" }, { label: "Don't allow", kind: "deny" }]
  });
  assert.deepEqual(askPresentation(ask({ kind: "confirm" })), {
    state: "choices", choices: [{ label: "Yes", kind: "grant" }, { label: "No", kind: "deny" }]
  });
  assert.deepEqual(askPresentation(ask({ kind: "choice", options: [{ id: "csv", label: "CSV" }, { id: "json", label: "JSON" }] })), {
    state: "choices", choices: [{ label: "CSV", kind: "choice", value: "csv" }, { label: "JSON", kind: "choice", value: "json" }]
  });
  assert.deepEqual(askPresentation(ask({ kind: "open" })), { state: "words" });
});

test("questions this panel cannot answer point to FluxIQ", () => {
  assert.deepEqual(askPresentation(ask({ kind: "choice", options: [] })), { state: "elsewhere", sentence: "Answer this in FluxIQ." });
  assert.deepEqual(askPresentation(ask({ kind: "signature" })), { state: "elsewhere", sentence: "Answer this in FluxIQ." });
});

test("settled questions say how they were settled", () => {
  const answered = (kind: string, answerKind: string, value: string | null = null, options: CoreAsk["options"] = null) =>
    askPresentation(ask({ kind, status: "answered", options, answer: { kind: answerKind, value } }));
  assert.deepEqual(answered("permission", "grant"), { state: "settled", sentence: "You allowed this." });
  assert.deepEqual(answered("permission", "deny"), { state: "settled", sentence: "You didn't allow this." });
  assert.deepEqual(answered("confirm", "grant"), { state: "settled", sentence: "You said yes." });
  assert.deepEqual(answered("confirm", "deny"), { state: "settled", sentence: "You said no." });
  assert.deepEqual(answered("choice", "choice", "csv", [{ id: "csv", label: "CSV" }]), { state: "settled", sentence: "You chose \"CSV\"." });
  assert.deepEqual(answered("open", "text", "only under $50"), { state: "settled", sentence: "You answered." });
  assert.deepEqual(askPresentation(ask({ status: "expired" })), { state: "settled", sentence: "FluxIQ stopped waiting for an answer." });
});

test("Core's person-needed ask at a robot check offers Continue and Stop, as Core writes it", () => {
  // Core `runtime/parking/person-needed-ask.ts` (t197): kind `choice`, two
  // options with routes, `parks`, `onTimeout` and a `control` marker the panel
  // does not read. The thread reader keeps what this card shows and drops the
  // rest, so the ask reaches the person as two buttons.
  const page = parseThreadPage({
    conversation: { conversationId: "c1", projectId: "p1", revision: 3 },
    turns: [{
      turnId: "t9",
      author: "automation",
      text: "FluxIQ needs you: complete the check on this page, then press Continue.",
      ask: {
        askId: "ask-person-1",
        kind: "choice",
        status: "pending",
        options: [
          { id: "person_done", label: "Continue", route: null },
          { id: "person_stop", label: "Stop", route: "failed" }
        ],
        parks: true,
        onTimeout: "deny",
        timeoutMs: 300_000,
        control: { kind: "person_check" },
        answer: null
      }
    }],
    hasMore: false
  });
  const turnAsk = page?.turns[0]?.ask;
  assert.ok(turnAsk, "the ask is read");
  assert.deepEqual(askPresentation(turnAsk), {
    state: "choices",
    choices: [{ label: "Continue", kind: "choice", value: "person_done" }, { label: "Stop", kind: "choice", value: "person_stop" }]
  });
  // D7 of the run-murwd8le-79e735a8 UI review: one press of Continue was told
  // three times. The check's own card ("Robot check · Done. You pressed
  // Continue.") tells it; the ask under the turn says nothing more.
  assert.deepEqual(askPresentation({ ...turnAsk, status: "answered", answer: { kind: "choice", value: "person_done" } }), { state: "silent" });
  assert.deepEqual(askPresentation({ ...turnAsk, status: "answered", answer: { kind: "choice", value: "person_stop" } }), { state: "silent" });
  assert.deepEqual(askPresentation({ ...turnAsk, status: "expired" }), { state: "settled", sentence: "FluxIQ stopped waiting for an answer." }, "an ask nobody answered still says so");
});
