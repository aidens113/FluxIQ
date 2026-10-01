// Core's activity as FluxIQ's step messages: one per decision, repair and
// check, with its reason, and the actions each led to as cards.

import { describe, expect, it } from "vitest";
import type { ConversationActivity, ConversationActivityDetail } from "../../contracts";
import { conversationStepMessages } from "..";

function event(sequence: number, phase: ConversationActivity["phase"], detail: ConversationActivityDetail | undefined, overrides: Partial<ConversationActivity> = {}): ConversationActivity {
  const atMs = 1_790_000_000_000 + sequence * 1_000;
  return {
    activityId: "build.1",
    sequence,
    subject: { kind: "build", id: "build.1", projectId: "project.one" },
    phase,
    label: detail?.title ?? "Working",
    ...(detail ? { detail } : {}),
    at: new Date(atMs).toISOString(),
    atMs,
    ...overrides
  };
}

const decide = (sequence: number) => event(sequence, "thinking", { kind: "thought", title: "Deciding the next step", status: "started" });
const thought = (sequence: number, title: string, text: string, phase: ConversationActivity["phase"] = "exploring") =>
  event(sequence, phase, { kind: "thought", title, text, status: "succeeded" });
const tool = (sequence: number, title: string, status: "started" | "succeeded" | "failed", text?: string, ref = "core.run_node", phase: ConversationActivity["phase"] = "exploring") =>
  event(sequence, phase, { kind: "tool", title, status, ref, ...(text ? { text } : {}) }, { label: `${title}${status === "started" ? "" : status === "failed" ? " — didn't work" : " — done"}` });

const CHECK = "Asked the person to complete a check";
const PERMISSION = "Asked a question (permission)";
/** The row that opens a wait on the person, as Core's `emitAutomationStudioActivityWaitingOnAsk` says it. */
const waitingAsk = (sequence: number, title: string, askId: string) =>
  event(sequence, "waiting_permission", { kind: "ask", title, status: "started", ref: askId }, { label: "Waiting for an answer before going on" });
/** The row that settles it, as Core's `emitAutomationStudioActivityAskResolved` says it. */
const settledAsk = (sequence: number, title: string, askId: string, resolution: NonNullable<ConversationActivityDetail["resolution"]>, text: string, status: "succeeded" | "failed" = "succeeded") =>
  event(sequence, "building", { kind: "ask", title, status, ref: askId, resolution, text }, { label: text });

/** A card's fields a person sees, without its key. */
const seen = (message: { actions: readonly { kind: string; target: string | null; outcome: string; why: string | null; said?: string }[] }) =>
  message.actions.map(({ kind, target, outcome, why, said }) => ({ kind, target, outcome, why, ...(said === undefined ? {} : { said }) }));

describe("FluxIQ's step messages", () => {
  it("makes one message per explained decision, with the action it led to as its card, and none for the decision being made", () => {
    const messages = conversationStepMessages([
      decide(1),
      thought(2, "Clicking “Get a free quote”", "The quote form is behind this button, so I'm opening it."),
      tool(3, "Clicking “Get a free quote”", "started"),
      tool(4, "Clicking “Get a free quote”", "succeeded", "Result: web.click.succeeded"),
      decide(5),
      thought(6, "Typing the postcode", "The form asks where the job is."),
      tool(7, "Typing the postcode", "started"),
      tool(8, "Typing the postcode", "failed", "The field was covered by a banner.")
    ]);
    expect(messages.map((message) => [message.key, message.kind, message.title, message.text])).toEqual([
      ["step:build.1#2", "decision", "Clicking “Get a free quote”", "The quote form is behind this button, so I'm opening it."],
      ["step:build.1#6", "decision", "Typing the postcode", "The form asks where the job is."]
    ]);
    // The result code is dropped; Core's sentence in words is kept.
    expect(seen(messages[0]!)).toEqual([{ kind: "click", target: "Get a free quote", outcome: "done", why: null }]);
    expect(seen(messages[1]!)).toEqual([{ kind: "type", target: null, outcome: "failed", why: null, said: "The field was covered by a banner." }]);
    // Each card keeps the key of the event that started it.
    expect(messages.map((message) => message.actions.map((action) => action.key))).toEqual([["action:build.1#3"], ["action:build.1#7"]]);
    expect(messages.map((message) => message.latest)).toEqual([false, true]);
  });

  it("keeps a message's key and place, and its card's key, while its action starts and ends", () => {
    const start = [thought(1, "Opening the listing", "It has the price."), tool(2, "Opening the listing", "started")];
    const before = conversationStepMessages(start);
    const after = conversationStepMessages([...start, tool(3, "Opening the listing", "succeeded")]);
    expect(before.map((message) => [message.key, message.atMs])).toEqual(after.map((message) => [message.key, message.atMs]));
    expect(before[0]!.actions.map((action) => [action.key, action.outcome])).toEqual([["action:build.1#2", "working"]]);
    expect(after[0]!.actions.map((action) => [action.key, action.outcome])).toEqual([["action:build.1#2", "done"]]);
  });

  it("gives a failure its reason from the result code, never the code", () => {
    const messages = conversationStepMessages([
      thought(1, "Clicking “Buy”", "It adds the item to the basket."),
      tool(2, "Clicking “Buy”", "failed", "Result: web.target.not_found · Node: web.output.dom-click")
    ]);
    expect(seen(messages[0]!)).toEqual([{ kind: "click", target: "Buy", outcome: "failed", why: "it wasn't on the page" }]);
  });

  it("tells a repair and a check as their own messages, each action a card, the check updated in place when it ends", () => {
    const messages = conversationStepMessages([
      thought(1, "Working out what went wrong", "The button moved.", "repairing"),
      tool(2, "Fixing the step", "succeeded", undefined, "core.run_node", "repairing"),
      thought(3, "Saving the fix", "The Flow needs the new button.", "repairing"),
      tool(4, "Editing the Flow", "succeeded", undefined, "core.flow_draft", "repairing"),
      event(5, "verifying", { kind: "check", title: "Result check", status: "started" }, { label: "Checking the result" }),
      event(6, "verifying", { kind: "check", title: "Result check", status: "failed", text: "Only three listings were saved." }, { label: "The result doesn't answer the request" })
    ]);
    expect(messages.map((message) => [message.kind, message.title, message.text, message.actions.map((action) => [action.kind, action.outcome])])).toEqual([
      ["repair", "Working out what went wrong", "The button moved.", [["repair", "done"]]],
      ["repair", "Saving the fix", "The Flow needs the new button.", [["draft", "done"]]],
      ["check", "The result doesn't answer the request", "Only three listings were saved.", [["test", "failed"]]]
    ]);
    expect(messages[2]!.key).toBe("step:build.1#5");
    expect(messages[2]!.actions[0]!.key).toBe("action:build.1#5");
  });

  it("gives a second action its own message with its card, and never a tool id or a result code", () => {
    const messages = conversationStepMessages([
      thought(1, "Closing the banner", "It covers the field."),
      tool(2, "Closing the banner", "succeeded"),
      event(3, "exploring", { kind: "tool", title: "core.run_node", status: "succeeded", ref: "core.run_node", text: "Result: web.inspect.succeeded" }, { label: "Using core.run_node: web.inspect.succeeded" })
    ]);
    expect(messages.map((message) => [message.kind, message.title, message.actions.length])).toEqual([["decision", "Closing the banner", 1], ["action", "Working on the page", 1]]);
    expect(JSON.stringify(messages.map((message) => ({ ...message, key: "", actions: seen(message) })))).not.toMatch(/core\.|web\./u);
  });

  it("leaves out Core's bookkeeping, which is never a decision's card", () => {
    const messages = conversationStepMessages([
      thought(1, "Clicking “Next”", "The results continue on page two."),
      event(2, "exploring", { kind: "tool", title: "Using core.state_digest", status: "succeeded", ref: "core.state_digest" }),
      event(3, "exploring", { kind: "note", title: "Putting the page back" }),
      tool(4, "Clicking “Next”", "failed")
    ]);
    expect(messages).toHaveLength(1);
    expect(seen(messages[0]!)).toEqual([{ kind: "click", target: "Next", outcome: "failed", why: null }]);
  });

  it("shows a permission ask as a waiting card beside the decision, and marks it only from the row that settles it", () => {
    const asked = [
      thought(1, "Placing the order", "Everything in the basket matches the request."),
      waitingAsk(2, PERMISSION, "request.1")
    ];
    const waiting = conversationStepMessages(asked);
    expect(waiting).toHaveLength(1);
    expect(seen(waiting[0]!)).toEqual([{ kind: "permission", target: null, outcome: "waiting", why: null }]);
    const allowed = conversationStepMessages([...asked, settledAsk(3, PERMISSION, "request.1", "allowed", "You allowed it.")]);
    expect(allowed).toHaveLength(1);
    expect(allowed[0]!.actions.map((action) => [action.key, action.outcome])).toEqual([["action:build.1#2", "done"]]);
    expect(seen(allowed[0]!)).toEqual([{ kind: "permission", target: null, outcome: "done", why: null, said: "You allowed it." }]);
  });

  it("never marks a wait over from what the work does next", () => {
    const messages = conversationStepMessages([
      waitingAsk(1, CHECK, "person-needed.1"),
      event(2, "building", undefined, { label: "Building the Flow" }),
      tool(3, "Clicking “Next”", "succeeded", "Result: web.click.succeeded"),
      event(4, "failed", { kind: "step", title: "Build failed", status: "failed" }, { label: "Build failed", final: true })
    ]);
    expect(messages[0]!.actions.map((action) => [action.key, action.kind, action.outcome])).toEqual([["action:build.1#1", "person_check", "waiting"]]);
  });

  it.each([
    ["answered", "succeeded", "You pressed Continue.", { outcome: "done", why: null, said: "You pressed Continue." }],
    ["waited_out", "succeeded", "The check cleared by itself.", { outcome: "done", why: null, said: "The check cleared by itself." }],
    ["declined", "failed", "You pressed Stop.", { outcome: "failed", why: "you pressed Stop", said: "You pressed Stop." }],
    ["timed_out", "failed", "Nobody answered in time.", { outcome: "failed", why: "nobody answered in time", said: "Nobody answered in time." }],
    ["cancelled", "failed", "The work stopped before this was answered.", { outcome: "failed", why: "the work stopped first", said: "The work stopped before this was answered." }]
  ] as const)("marks a robot check's one card %s in place, keeping its key and message", (resolution, status, text, card) => {
    const waiting = [waitingAsk(1, CHECK, "person-needed.1")];
    const before = conversationStepMessages(waiting);
    const after = conversationStepMessages([...waiting, settledAsk(2, CHECK, "person-needed.1", resolution, text, status)]);
    expect(after).toHaveLength(1);
    expect(after[0]!.key).toBe(before[0]!.key);
    expect(after[0]!.actions.map((action) => action.key)).toEqual(before[0]!.actions.map((action) => action.key));
    expect(seen(after[0]!)).toEqual([{ kind: "person_check", target: null, ...card }]);
  });

  it("keeps each ask's card apart by its ask id", () => {
    const messages = conversationStepMessages([
      waitingAsk(1, CHECK, "person-needed.1"),
      settledAsk(2, CHECK, "person-needed.1", "answered", "You pressed Continue."),
      waitingAsk(3, CHECK, "person-needed.2"),
      settledAsk(4, CHECK, "person-needed.2", "declined", "You pressed Stop.", "failed")
    ]);
    expect(messages.map((message) => message.actions.map((action) => [action.key, action.outcome]))).toEqual([
      [["action:build.1#1", "done"]],
      [["action:build.1#3", "failed"]]
    ]);
  });

  it("makes a robot check one card with the tool that met it, whichever comes first", () => {
    const met = (sequence: number) => tool(sequence, "Checking the page", "succeeded", "Result: web.page.intervention_required", "web.inspect", "waiting_permission");
    const askFirst = conversationStepMessages([waitingAsk(1, CHECK, "person-needed.1"), met(2), settledAsk(3, CHECK, "person-needed.1", "answered", "You pressed Continue.")]);
    const toolFirst = conversationStepMessages([met(1), waitingAsk(2, CHECK, "person-needed.1"), settledAsk(3, CHECK, "person-needed.1", "answered", "You pressed Continue.")]);
    for (const [messages, key] of [[askFirst, "action:build.1#1"], [toolFirst, "action:build.1#1"]] as const) {
      expect(messages).toHaveLength(1);
      expect(messages[0]!.actions.map((action) => [action.key, action.kind, action.outcome])).toEqual([[key, "person_check", "done"]]);
    }
    // While it waits, the one card waits.
    const waiting = conversationStepMessages([waitingAsk(1, CHECK, "person-needed.1"), met(2)]);
    expect(waiting.map((message) => seen(message))).toEqual([[{ kind: "person_check", target: null, outcome: "waiting", why: null }]]);
  });

  it("reads an ask row with no ask id, while another ask waits, as that same wait said again", () => {
    const messages = conversationStepMessages([
      waitingAsk(1, CHECK, "check.attempt.2"),
      event(2, "waiting_permission", { kind: "ask", title: "Run is waiting for an answer", status: "started" }, { label: "Run is waiting for an answer" })
    ]);
    expect(messages).toHaveLength(1);
    expect(messages[0]!.actions).toHaveLength(1);
  });

  it("tells a run's steps as cards without a count, and closes a step once the run moves on", () => {
    const run = { activityId: "run.7", subject: { kind: "run" as const, id: "run.7", projectId: "project.one" } };
    const messages = conversationStepMessages([
      event(1, "running", { kind: "step", title: "Step 2", status: "started", ref: "n2" }, { ...run, step: { index: 2, count: 5, nodeId: "n2", label: "Open the listing" } }),
      event(2, "running", { kind: "step", title: "Step 3", status: "started", ref: "n3" }, { ...run, step: { index: 3, count: 5, nodeId: "n3" } })
    ]);
    expect(messages.map((message) => [message.kind, message.title, message.actions.map((action) => [action.target, action.outcome])])).toEqual([
      ["step", "Step 2: Open the listing", [["Open the listing", "done"]]],
      ["step", "Step 3", [[null, "working"]]]
    ]);
  });

  it("says how a unit of work ended when it failed and nothing else did", () => {
    const messages = conversationStepMessages([
      thought(1, "Clicking “Search”", "It lists the jobs."),
      event(2, "failed", undefined, { label: "The build stopped: the page never loaded", final: true })
    ]);
    expect(messages.map((message) => [message.kind, message.title, message.text, message.actions.length])).toEqual([
      ["decision", "Clicking “Search”", "It lists the jobs.", 0],
      ["ended", "Build failed", "The build stopped: the page never loaded", 0]
    ]);
  });

  it("keeps the newest messages when there are more than the limit", () => {
    const events = Array.from({ length: 30 }, (_, index) => thought(index + 1, `Step ${index + 1} action`, "Because."));
    const messages = conversationStepMessages(events, 10);
    expect(messages).toHaveLength(10);
    expect(messages[0]!.key).toBe("step:build.1#21");
  });
});
