// Coverage of wording.ts: every tool and seam Core reports, every
// family of result code, Core's own sentences kept when they are human, and
// that no visible word is a raw id. The real t174 build is checked in
// background/activity/tests/activity-replay.test.ts, beside its fixture.

import { expect, test } from "vitest";

import { activityWording, isHeadlineEcho, type ActivityWording, type ClientGatewayActivity } from "../index.ts";

const RAW_ID = /\b[a-z]+\.[a-z_]+/u;

let sequence = 0;
function event(fields: Partial<ClientGatewayActivity> & Pick<ClientGatewayActivity, "phase" | "label">): ClientGatewayActivity {
  sequence += 1;
  return { activityId: "build:b", sequence, subject: { kind: "build", id: "b", projectId: "p" }, at: "2026-09-29T00:00:00.000Z", ...fields };
}

/** A tool event exactly as Core's observer sends it (observer.ts `toolActivity`). */
function tool(toolId: string, status: "started" | "succeeded" | "failed", resultCode?: string, extra: Partial<ClientGatewayActivity> = {}): ClientGatewayActivity {
  const drafting = toolId === "core.flow_draft";
  const title = drafting ? "Amending the draft Flow" : `Using ${toolId}`;
  return event({
    phase: drafting ? "building" : "exploring",
    label: status === "started" ? title : `${title}: ${status === "failed" ? "failed" : resultCode ?? "done"}`,
    detail: { kind: "tool", title, status, ref: toolId, ...(resultCode ? { text: `Result: ${resultCode}` } : {}) },
    ...extra
  });
}

function assertHuman(wording: ActivityWording, context: string): void {
  for (const text of [wording.action, wording.outcome ?? "", wording.sentence]) {
    expect(text, `${context}: "${text}" shows a raw id`).not.toMatch(RAW_ID);
  }
}

test("tools are named by what they do", () => {
  const cases: Array<[ClientGatewayActivity, string]> = [
    [tool("core.run_node", "started"), "Trying a step on the page"],
    [tool("web.detect_repeating_structure", "started"), "Looking for the list of items"],
    [tool("core.flow_draft", "started"), "Changing the Flow"],
    [tool("web.some_future_tool", "started"), "Working on the page"],
    [tool("", "started"), "Working on the page"]
  ];
  for (const [input, sentence] of cases) {
    const wording = activityWording(input);
    expect(wording.sentence, input.label).toBe(sentence);
    expect(wording.outcome, `${input.label}: a started tool has no outcome yet`).toBe(null);
    assertHuman(wording, input.label);
  }
});

test("core.run_node is named by the node it runs, when the event says which", () => {
  const cases: Array<[NonNullable<ClientGatewayActivity["step"]>, string]> = [
    [{ index: 1, count: 3, nodeId: "nav.start" }, "Opening the page"],
    [{ index: 1, count: 3, nodeId: "open-home" }, "Opening the page"],
    [{ index: 1, count: 3, nodeId: "click.voltbay-item" }, "Clicking on the page"],
    // D5 of the t174 UI review of run-musp8nz1-dbd3905a: a typing step names its field, as a click names its control.
    [{ index: 1, count: 3, nodeId: "n7", label: "Type the product name" }, "Type the product name"],
    [{ index: 1, count: 3, nodeId: "type.quantity", label: "Quantity" }, "Typing into “Quantity”"],
    [{ index: 1, count: 3, nodeId: "type.quantity" }, "Typing into the page"],
    [{ index: 1, count: 3, nodeId: "n7", label: "Add to cart" }, "Trying a step on the page"],
    [{ index: 1, count: 3, nodeId: "click.add", label: "Add to cart" }, "Clicking “Add to cart”"],
    [{ index: 1, count: 3, nodeId: "n8", label: "Click the Buy button" }, "Click the Buy button"],
    [{ index: 1, count: 3, nodeId: "extract.listings" }, "Reading the list"],
    [{ index: 1, count: 3, nodeId: "read-rows" }, "Reading the list"],
    [{ index: 1, count: 3, nodeId: "snap.home" }, "Looking at the page"],
    [{ index: 1, count: 3, nodeId: "inspect-page" }, "Looking at the page"],
    [{ index: 1, count: 3, nodeId: "scroll.down" }, "Scrolling the page"]
  ];
  for (const [step, sentence] of cases) {
    const wording = activityWording(tool("core.run_node", "started", undefined, { step }));
    expect(wording.sentence, JSON.stringify(step)).toBe(sentence);
    assertHuman(wording, JSON.stringify(step));
  }
});

test("a node's result code names the step when nothing else does", () => {
  expect(activityWording(tool("core.run_node", "succeeded", "web.inspect.succeeded")).sentence).toBe("Looking at the page — done");
  expect(activityWording(tool("core.run_node", "succeeded", "core.replay.replayed")).sentence).toBe("Trying the Flow out — done");
  expect(activityWording(tool("core.run_node", "succeeded", "web.action.succeeded")).sentence).toBe("Trying a step on the page — done");
});

test("result codes become a short outcome, never the code", () => {
  const cases: Array<[string | undefined, "succeeded" | "failed", string]> = [
    ["web.action.succeeded", "succeeded", "done"],
    ["web.structure.detected", "succeeded", "done"],
    ["core.replay.replayed", "succeeded", "done"],
    ["web.action.rejected.not_at_start_location", "succeeded", "not tried"],
    ["web.action.rejected.target_unobserved", "succeeded", "not tried: the step named something it hadn't seen on the page"],
    ["web.action.rejected.target_covered", "succeeded", "not tried: a popup or banner on the page was covering it"],
    // Looked up by what FluxIQ saved of it, and not found that way: never "not on the page" (R4a, moment 06).
    ["web.action.target_not_found", "succeeded", "FluxIQ couldn't find it where it was saved"],
    ["web.target.not_found", "succeeded", "FluxIQ couldn't find it where it was saved"],
    ["web.structure.not_detected", "succeeded", "couldn't find it on the page"],
    ["web.action.timeout", "succeeded", "that didn't work: the page took too long"],
    ["web.action.failed", "succeeded", "that didn't work"],
    ["web.something.new", "succeeded", "done"],
    [undefined, "succeeded", "done"],
    [undefined, "failed", "that didn't work"]
  ];
  for (const [code, status, outcome] of cases) {
    const input = tool("web.detect_repeating_structure", status, code);
    const wording = activityWording(input);
    expect(wording.outcome, input.label).toBe(outcome);
    expect(wording.sentence, input.label).toBe(`Looking for the list of items — ${outcome}`);
    assertHuman(wording, input.label);
  }
});

test("the draft tool's end reads as the Flow changed", () => {
  expect(activityWording(tool("core.flow_draft", "succeeded")).sentence).toBe("Changing the Flow — done");
  expect(activityWording(tool("core.flow_draft", "failed")).sentence).toBe("Changing the Flow — that didn't work");
});

test("an event that carries only Core's sentence is read from it", () => {
  expect(activityWording(event({ phase: "exploring", label: "Using core.run_node" })).sentence).toBe("Trying a step on the page");
  expect(activityWording(event({ phase: "exploring", label: "Using web.detect_repeating_structure: web.action.rejected.target_unobserved" })).sentence).toBe("Looking for the list of items — not tried: the step named something it hadn't seen on the page");
  expect(activityWording(event({ phase: "building", label: "Amending the draft Flow" })).sentence).toBe("Changing the Flow");
  expect(activityWording(event({ phase: "thinking", label: "Deciding the next step" })).sentence).toBe("Thinking about the next step");
});

test("decisions and the completion check", () => {
  // t193: every decision read "Thinking about the next step", before and after the model answered.
  expect(activityWording(event({ phase: "thinking", label: "Deciding the next step", detail: { kind: "thought", title: "Deciding the next step", status: "started" } })).sentence).toBe("Deciding the next step");
  const reason = "Closing the sign-up popup that covers the store picker.";
  expect(activityWording(event({ phase: "exploring", label: "Clicking “No thanks”", detail: { kind: "thought", title: "Clicking “No thanks”", text: reason, status: "succeeded" } })).sentence).toBe(reason);
  expect(activityWording(event({ phase: "exploring", label: "Clicking “No thanks”", detail: { kind: "thought", title: "Clicking “No thanks”", text: "Run web.output.dom-click on t332.", status: "succeeded" } })).sentence, "a reason naming an id gives way to the action").toBe("Clicking “No thanks”");
  expect(activityWording(event({ phase: "thinking", label: "The AI model provider did not answer", detail: { kind: "thought", title: "Deciding the next step", status: "failed", text: "The AI model provider did not answer this request. Asking it again; the build stops if it keeps not answering." } })).sentence).toBe("The AI model provider did not answer this request. Asking it again; the build stops if it keeps not answering.");
  const check = (status: "started" | "succeeded" | "failed", label: string) => activityWording(event({ phase: "verifying", label, detail: { kind: "check", title: "Completion check", status, ...(status === "failed" ? { text: "bootstrap.instructed_act_missing" } : {}) } }));
  expect(check("started", "Checking the proposed result").sentence).toBe("Checking the Flow does what you asked");
  expect(check("succeeded", "The proposed result passed its check").sentence).toBe("Checking the Flow does what you asked — done");
  expect(check("failed", "The proposed result was refused").sentence).toBe("Checking the Flow does what you asked — not yet, trying another way");
  expect(activityWording(event({ phase: "verifying", label: "The proposed result was refused" })).outcome).toBe("not yet, trying another way");
});

test("Core's human sentences are kept: run steps, saved records, settles", () => {
  const kept: ClientGatewayActivity[] = [
    event({ phase: "building", label: "Building the Flow", detail: { kind: "step", title: "Build started", status: "started", ref: "flow-1" } }),
    event({ phase: "done", label: "Build finished: a Flow is proposed", final: true }),
    event({ phase: "failed", label: "Build failed", final: true }),
    event({ phase: "running", label: "Run started", detail: { kind: "note", title: "Run started", status: "started", ref: "run-1" } }),
    event({ phase: "extracting", label: "Saved 12 records", detail: { kind: "step", title: "Records saved", status: "succeeded", ref: "extract.listings" } }),
    event({ phase: "extracting", label: "Saved 1 record" }),
    event({ phase: "repairing", label: "Recovering from a failed step: Open search" }),
    event({ phase: "waiting_permission", label: "Waiting for an answer before going on", detail: { kind: "ask", title: "Asked a question (confirm)", status: "started", ref: "ask.confirm" } })
  ];
  for (const input of kept) expect(activityWording(input).sentence).toBe(input.label);
});

test("run steps read 'Running step N of M: label', without a node id standing in for the label", () => {
  const step = (label: string, index: number, count: number, stepLabel?: string) => activityWording(event({ phase: "running", label, step: { index, count, nodeId: "nav.start", ...(stepLabel ? { label: stepLabel } : {}) }, detail: { kind: "step", title: stepLabel ?? "nav.start", status: "started", ref: "nav.start" } })).sentence;
  expect(step("Running step 2 of 5: Open search", 2, 5, "Open search")).toBe("Running step 2 of 5: Open search");
  expect(step("Running step 2 of 5", 2, 5)).toBe("Running step 2 of 5");
  expect(step("Running step 7", 7, 5, "Next page")).toBe("Running step 7: Next page");
  expect(step("Running step 3 of 5: nav.start", 3, 5, "nav.start")).toBe("Running step 3 of 5");
});

test("a sentence carrying an id is replaced by its phase's plain words", () => {
  const phases: Array<[ClientGatewayActivity["phase"], string]> = [
    ["thinking", "Thinking about the next step"],
    ["exploring", "Working on the page"],
    ["building", "Building the Flow"],
    ["running", "Running the Flow"],
    ["extracting", "Saving what was found"],
    ["verifying", "Checking the Flow does what you asked"],
    ["repairing", "Fixing a step that didn't work"],
    ["waiting_permission", "Waiting for your answer"],
    ["done", "Done"],
    ["failed", "That didn't work"]
  ];
  for (const [phase, sentence] of phases) {
    const wording = activityWording(event({ phase, label: `Something about web.action.rejected (${phase})` }));
    expect(wording.sentence, phase).toBe(sentence);
    assertHuman(wording, phase);
  }
});

/** A tool event as Core's observer sends it once it names the call's action (Core `activity/tool-call.ts`). */
function named(fields: { phase: ClientGatewayActivity["phase"]; kind?: "tool" | "note"; title: string; label: string; status: "started" | "succeeded" | "failed"; text?: string }): ClientGatewayActivity {
  return event({ phase: fields.phase, label: fields.label, detail: { kind: fields.kind ?? "tool", title: fields.title, status: fields.status, ref: "core.run_node", ...(fields.text ? { text: fields.text } : {}) } });
}

test("Core's own words for a call are used as they come, with the outcome read from the code", () => {
  const started = activityWording(named({ phase: "exploring", title: "Clicking “Get a free quote”", label: "Clicking “Get a free quote”", status: "started" }));
  expect(started).toStrictEqual({ action: "Clicking “Get a free quote”", outcome: null, sentence: "Clicking “Get a free quote”", internal: false });
  const ended = activityWording(named({ phase: "exploring", title: "Opening a page", label: "Opening a page — done", status: "succeeded", text: "Result: web.action.succeeded · Node: web.output.browser-navigate" }));
  expect(ended.sentence).toBe("Opening a page — done");
  const refused = activityWording(named({ phase: "exploring", title: "Clicking on the page", label: "Clicking on the page — didn't work", status: "succeeded", text: "Result: web.action.rejected.target_unobserved · Node: web.output.dom-click" }));
  expect(refused.sentence).toBe("Clicking on the page — not tried: the step named something it hadn't seen on the page");
  for (const wording of [started, ended, refused]) assertHuman(wording, wording.sentence);
});

test("a dry run reads as trying the Flow from the start, and a step that did not repeat says so", () => {
  const label = "Trying the Flow from the start: clicking “Get a free quote”";
  const started = activityWording(named({ phase: "verifying", title: "Clicking “Get a free quote”", label, status: "started" }));
  expect(started.sentence).toBe(label);
  expect(started.outcome, "a started call whose sentence has a colon has not ended").toBe(null);
  const changed = activityWording(named({ phase: "verifying", title: "Clicking “Get a free quote”", label: `${label} — didn't work the same way again`, status: "succeeded", text: "Result: core.replay.unreproducible · Node: web.output.dom-click" }));
  // Core's reason for the code (`fluxiq/ui` `activityActionFailureReason`), as the step's card says it (t174-lead-1003).
  expect(changed.sentence).toBe(`${label} — the page wasn't in the same state when the test got there`);
  expect(activityWording(named({ phase: "verifying", title: "Running a step", label: "Trying the Flow from the start: running a step — done", status: "succeeded", text: "Result: core.replay.replayed" })).sentence).toBe("Trying the Flow from the start: running a step — done");
});

// t193 1002-M (`run-murzln6g-11debe1d`, C10): the overlay said "done" for a step
// the test only checked, and "that didn't work, trying another way" for the
// drawer's "×" the Flow passes over, while the card said "Done" and "Didn't
// work". What the test did with such a step is Core's to say, in the words its
// card says it in (`activityActionTested`), so the overlay takes Core's.
test("a dry run step the test only checked, found already done, or passed over says what the test did, in Core's words", () => {
  const label = "Trying the Flow from the start: clicking “Add to cart”";
  const said = (outcome: string, text: string) => activityWording(named({ phase: "verifying", title: "Clicking “Add to cart”", label: `${label} — ${outcome}`, status: "succeeded", text })).sentence;
  expect(said("checked, not pressed", "Result: core.replay.verified · Node: web.output.dom-click")).toBe(`${label} — checked, not pressed`);
  expect(said("already done on the site", "Result: core.replay.present · Node: web.output.dom-click")).toBe(`${label} — already done on the site`);
  expect(said("already done on the site", "Result: core.replay.remembered · Node: web.output.dom-click")).toBe(`${label} — already done on the site`);
  expect(said("skipped: not there, optional", "Result: core.replay.failed · Excused: interruption · Node: web.output.dom-click")).toBe(`${label} — skipped: not there, optional`);
  // A step that did not hold and is not excused reads as before.
  expect(said("didn't work the same way again", "Result: core.replay.unreproducible · Node: web.output.dom-click")).toBe(`${label} — the page wasn't in the same state when the test got there`);
  expect(said("didn't work the same way again", "Result: core.replay.changed · Node: web.output.dom-click")).toBe(`${label} — it did nothing this time, where it did something before`);
  // An older Core, whose sentence said only "done", is read as it was.
  expect(said("done", "Result: core.replay.verified · Node: web.output.dom-click")).toBe(`${label} — done`);
});

test("Core's bookkeeping calls are marked internal, and nothing else is", () => {
  const reset = activityWording(named({ phase: "verifying", kind: "note", title: "Putting the page back to where the Flow starts", label: "Trying the Flow from the start", status: "started" }));
  expect(reset.internal).toBe(true);
  expect(reset.sentence).toBe("Trying the Flow from the start");
  expect(activityWording(named({ phase: "exploring", kind: "note", title: "Looking at the page", label: "Looking at the page", status: "started" })).internal).toBe(true);
  expect(activityWording(event({ phase: "running", label: "Run started", detail: { kind: "note", title: "Run started", status: "started", ref: "run-1" } })).internal).toBe(false);
  expect(activityWording(tool("core.run_node", "started")).internal).toBe(false);
});

// D3 of the t174 UI review of run-musp8nz1-dbd3905a: "the plan checks out, it
// still has to run cleanly" is Core's bookkeeping ("the plan"), not a person's words.
test("a passed completion check says, in plain words, that the Flow looks right and is tested next", () => {
  const check = (status: "started" | "succeeded" | "failed", label: string) => activityWording(event({ phase: "verifying", label, detail: { kind: "check", title: "Completion check", status } })).sentence;
  expect(check("started", "Checking the proposed Flow")).toBe("Checking the Flow does what you asked");
  expect(check("succeeded", "The proposed Flow’s plan checks out; it still has to run cleanly")).toBe("Checking the Flow does what you asked — looks right, testing it next");
  expect(check("succeeded", "The proposed Flow’s plan checks out; it still has to run cleanly")).not.toMatch(/\bplan\b|run cleanly/u);
  expect(check("failed", "The proposed Flow was sent back to be fixed")).toBe("Checking the Flow does what you asked — not yet, trying another way");
  expect(activityWording(event({ phase: "verifying", label: "The proposed Flow was sent back to be fixed" })).outcome).toBe("not yet, trying another way");
});

test("a run step keeps Core's action, and never a node id", () => {
  const step = (label: string) => activityWording(event({ phase: "running", label, step: { index: 1, count: 7, nodeId: "node.bootstrap.a.b" }, detail: { kind: "step", title: "x", status: "started", ref: "node.bootstrap.a.b" } })).sentence;
  expect(step("Running step 1 of 7: Clicking “Get a free quote”")).toBe("Running step 1 of 7: Clicking “Get a free quote”");
  expect(step("Running step 1 of 7")).toBe("Running step 1 of 7");
  expect(step("Running step 1 of 7: node.bootstrap.a.b")).toBe("Running step 1 of 7");
});

test("U6: a control's name is quoted once, with one space between words", () => {
  const click = (label: string) => activityWording(tool("core.run_node", "started", undefined, { step: { index: 1, count: 3, nodeId: "click.x", label } })).sentence;
  expect(click("  “Add   to cart” ")).toBe("Clicking “Add to cart”");
  expect(click("\"Get a free quote\"")).toBe("Clicking “Get a free quote”");
  expect(click("Clicker game")).toBe("Clicking “Clicker game”");
});

// R2-U-6 (run-muwansvz-a2b4a987, moment 07; steps 0034, 0039, 0046): the
// overlay said "— couldn't find it on the page" for a read Core refused before
// sending it (`web.action.rejected.target_unobserved`, reason
// `malformed_handle`), while the list was on screen. A rejected call was never
// tried on the page, so it never says the page lacked anything: it says it was
// not tried and, when the row carries the reason, why.
test("a call Core rejected before sending it says it was not tried, and why when the row says, never that it wasn't on the page", () => {
  const read = "Trying again: reading the list of “name, price, rating and 3 more”";
  const rejected = (title: string, label: string, text: string) => activityWording(named({ phase: "repairing", title, label: `${label} — didn't work`, status: "succeeded", text }));
  const list = rejected("Reading the list of “name, price, rating and 3 more”", read, "Result: web.action.rejected.target_unobserved · Reason: malformed_handle · Node: web.output.dom-extract_list");
  expect(list.sentence).toBe(`${read} — not tried: the step didn't name its list the way FluxIQ needs`);
  const click = rejected("Clicking “Add to cart”", "Clicking “Add to cart”", "Result: web.action.rejected.target_unobserved · Reason: target_not_a_handle · Node: web.output.dom-click");
  expect(click.sentence).toBe("Clicking “Add to cart” — not tried: the step didn't name its control the way FluxIQ needs");
  const older = rejected("Clicking “Add to cart”", "Clicking “Add to cart”", "Result: web.action.rejected.target_unobserved · Reason: handle_from_older_view · Node: web.output.dom-click");
  expect(older.sentence).toBe("Clicking “Add to cart” — not tried: FluxIQ was looking at an older view of the page");
  const bare = rejected("Clicking “Add to cart”", "Clicking “Add to cart”", "Result: web.action.rejected.target_unobserved · Node: web.output.dom-click");
  expect(bare.sentence).toBe("Clicking “Add to cart” — not tried: the step named something it hadn't seen on the page");
  // A repeat whose first refusal Core did not see says it is the same as before (t277 lead).
  const again = rejected("Clicking “Add to cart”", "Clicking “Add to cart”", "Result: web.action.rejected.target_unobserved · Reason: answered_the_same_again · Node: web.output.dom-click");
  expect(again.sentence).toBe("Clicking “Add to cart” — not tried, for the same reason as the time before");
  for (const wording of [list, click, older, bare, again]) {
    expect(wording.sentence).not.toMatch(/couldn't find|wasn't on the page|trying another way/u);
    assertHuman(wording, wording.sentence);
  }
  // A call that ran and missed its target still says so, by where FluxIQ saved it.
  expect(rejected("Clicking “Add to cart”", "Clicking “Add to cart”", "Result: web.action.target_not_found · Node: web.output.dom-click").outcome).toBe("FluxIQ couldn't find it where it was saved");
});

// Lane C (run-mv0fuotv-805294d7, defect 3): "Not done: saving the Flow's steps — that didn't work,
// trying another way" was said before the same Flow was sent again unchanged and the build ended.
test("a failed or refused call never says what FluxIQ does next", () => {
  const resent = activityWording(event({
    phase: "building",
    label: "Not done: saving the Flow's steps",
    detail: { kind: "tool", title: "Saving the Flow's steps", status: "failed", ref: "core.submit_candidate", text: "Result: llm_evidence_loop.repeat_refused · Reason: failed" }
  }));
  expect(resent.sentence).toMatch(/^Not done: saving the Flow's steps — \S/u);
  expect(resent.sentence).not.toMatch(/trying another way|— not done/u);
  assertHuman(resent, resent.sentence);
  const slowed = activityWording(tool("core.run_node", "failed", "web.action.rate_limited"));
  expect(slowed.outcome ?? "").toMatch(/^that didn't work: /u);
  for (const wording of [slowed, activityWording(tool("core.flow_draft", "failed")), activityWording(tool("core.run_node", "failed", "web.action.failed"))]) {
    expect(wording.sentence).not.toMatch(/trying another way/u);
  }
});

// t423: a Flow sent back because a step answering a popup pressed its offer, not its way out.
test("a Flow sent back for pressing a popup's offer says so plainly, never with its code", () => {
  const sentBack = activityWording(event({
    phase: "building",
    label: "Not done: saving the Flow's steps",
    detail: { kind: "tool", title: "Saving the Flow's steps", status: "failed", ref: "core.submit_candidate", text: "Result: candidate.way_out_refused:1a2b3c4d · Reason: failed" }
  }));
  expect(sentBack.outcome).toBe("a step would accept the offer instead of closing it, so it was sent back");
  expect(sentBack.sentence).not.toMatch(/way_out|candidate\./u);
  assertHuman(sentBack, sentBack.sentence);
});

// R4a (`run-mv2nlh9l-52e476da`, moment 10): the overlay read a bare "Build failed" while the
// chat's ending said why. Core's ending row now says the reason, and the overlay's detail
// line keeps it under the "Build failed" headline.
test("a failed build's ending says its reason under the headline, never only the headline again", () => {
  const label = "Build failed: it kept trying without getting any further, so it was stopped";
  const ending = activityWording(event({ phase: "failed", label, final: true, detail: { kind: "step", title: label, status: "failed", text: "It kept trying without getting any further, so it was stopped." } }));
  expect(ending.sentence).toBe(label);
  expect(isHeadlineEcho("Build failed", ending.sentence)).toBe(false);
});

// R4a attempt 2 (run-mv2pgqkj-f3552c70, trial 3, moment 12): the Flow's clear
// step (`web.output.dom-clear`) failed with `web.validation.output_not_observed`,
// the site putting "1" back in the quantity box. That code matched none of the
// outcome words and read "done"; and R4a's exploration clear
// (`web.action.rejected.output_not_observed`, run-mv2nlh9l-52e476da) read "not
// tried: it ran, ..." though it ran. Both now say what the card says, worded
// for the text (round 12: a typing step into a span read "the site set the box
// back", where no box existed).
test("a clear or typing step whose text did not change says so, never done or not tried", () => {
  const clear = (code: string) => activityWording(named({ phase: "exploring", title: "Clearing “Quantity”", label: "Clearing “Quantity”", status: "succeeded", text: `Result: ${code} · Node: web.output.dom-clear` }));
  expect(clear("web.validation.output_not_observed").sentence).toBe("Clearing “Quantity” — that didn't work: it ran, but the text there didn't change the way it should have");
  expect(clear("web.action.rejected.output_not_observed").sentence).toBe("Clearing “Quantity” — that didn't work: it ran, but the text there didn't change the way it should have");
  const typed = activityWording(named({ phase: "exploring", title: "Typing \"3\" into “Quantity”", label: "Typing \"3\" into “Quantity”", status: "succeeded", text: "Result: web.validation.output_not_observed · Node: web.output.dom-type" }));
  expect(typed.outcome).toBe("that didn't work: it ran, but the text there didn't change the way it should have");
  const press = activityWording(named({ phase: "exploring", title: "Clicking “collect the store coupon”", label: "Clicking “collect the store coupon”", status: "succeeded", text: "Result: web.validation.output_not_observed · Node: web.output.dom-click" }));
  expect(press.outcome).toBe("that didn't work: it ran, but the page didn't change the way it should have");
});
