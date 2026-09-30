// Core's activity as FluxIQ's step messages: one per decision, repair and
// check, with its reason, and the action after a decision as its outcome.

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
const tool = (sequence: number, title: string, status: "started" | "succeeded" | "failed", text?: string, ref = "core.run_node") =>
  event(sequence, "exploring", { kind: "tool", title, status, ref, ...(text ? { text } : {}) }, { label: `${title}${status === "started" ? "" : status === "failed" ? " — didn't work" : " — done"}` });

describe("FluxIQ's step messages", () => {
  it("makes one message per explained decision, with the action as its outcome, and none for the decision being made", () => {
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
    expect(messages[0]!.outcome).toEqual({ status: "succeeded" });
    expect(messages[1]!.outcome).toEqual({ status: "failed", text: "The field was covered by a banner." });
    expect(messages.map((message) => message.latest)).toEqual([false, true]);
  });

  it("keeps a message's key and place while its action starts and ends", () => {
    const start = [thought(1, "Opening the listing", "It has the price."), tool(2, "Opening the listing", "started")];
    const before = conversationStepMessages(start);
    const after = conversationStepMessages([...start, tool(3, "Opening the listing", "succeeded")]);
    expect(before.map((message) => [message.key, message.atMs])).toEqual(after.map((message) => [message.key, message.atMs]));
    expect(before[0]!.outcome?.status).toBe("started");
    expect(after[0]!.outcome?.status).toBe("succeeded");
  });

  it("tells a repair and a check as their own messages, the check updated in place when it ends", () => {
    const messages = conversationStepMessages([
      thought(1, "Working out what went wrong", "The button moved.", "repairing"),
      event(2, "verifying", { kind: "check", title: "Result check", status: "started" }, { label: "Checking the result" }),
      event(3, "verifying", { kind: "check", title: "Result check", status: "failed", text: "Only three listings were saved." }, { label: "The result doesn't answer the request" })
    ]);
    expect(messages.map((message) => [message.kind, message.title, message.text, message.outcome?.status])).toEqual([
      ["repair", "Working out what went wrong", "The button moved.", undefined],
      ["check", "The result doesn't answer the request", "Only three listings were saved.", "failed"]
    ]);
    expect(messages[1]!.key).toBe("step:build.1#2");
  });

  it("gives a second action its own message, and never a tool id or a result code", () => {
    const messages = conversationStepMessages([
      thought(1, "Closing the banner", "It covers the field."),
      tool(2, "Closing the banner", "succeeded"),
      event(3, "exploring", { kind: "tool", title: "core.run_node", status: "succeeded", ref: "core.run_node", text: "Result: web.inspect.succeeded" }, { label: "Using core.run_node: web.inspect.succeeded" })
    ]);
    expect(messages.map((message) => [message.kind, message.title])).toEqual([["decision", "Closing the banner"], ["action", "Working on the page"]]);
    expect(JSON.stringify(messages)).not.toMatch(/core\.|web\./u);
  });

  it("leaves out Core's bookkeeping, which is never a decision's outcome", () => {
    const messages = conversationStepMessages([
      thought(1, "Clicking “Next”", "The results continue on page two."),
      event(2, "exploring", { kind: "tool", title: "Using core.state_digest", status: "succeeded", ref: "core.state_digest" }),
      event(3, "exploring", { kind: "note", title: "Putting the page back" }),
      tool(4, "Clicking “Next”", "failed")
    ]);
    expect(messages).toHaveLength(1);
    expect(messages[0]!.outcome).toEqual({ status: "failed" });
  });

  it("tells a run's steps without a count, and closes a step once the run moves on", () => {
    const run = { activityId: "run.7", subject: { kind: "run" as const, id: "run.7", projectId: "project.one" } };
    const messages = conversationStepMessages([
      event(1, "running", { kind: "step", title: "Step 2", status: "started", ref: "n2" }, { ...run, step: { index: 2, count: 5, nodeId: "n2", label: "Open the listing" } }),
      event(2, "running", { kind: "step", title: "Step 3", status: "started", ref: "n3" }, { ...run, step: { index: 3, count: 5, nodeId: "n3" } })
    ]);
    expect(messages.map((message) => [message.title, message.outcome?.status])).toEqual([["Step 2: Open the listing", "succeeded"], ["Step 3", "started"]]);
  });

  it("says how a unit of work ended when it failed and nothing else did", () => {
    const messages = conversationStepMessages([
      thought(1, "Clicking “Search”", "It lists the jobs."),
      event(2, "failed", undefined, { label: "The build stopped: the page never loaded", final: true })
    ]);
    expect(messages.map((message) => [message.kind, message.title, message.text])).toEqual([
      ["decision", "Clicking “Search”", "It lists the jobs."],
      ["ended", "Build failed", "The build stopped: the page never loaded"]
    ]);
  });

  it("keeps the newest messages when there are more than the limit", () => {
    const events = Array.from({ length: 30 }, (_, index) => thought(index + 1, `Step ${index + 1} action`, "Because."));
    const messages = conversationStepMessages(events, 10);
    expect(messages).toHaveLength(10);
    expect(messages[0]!.key).toBe("step:build.1#21");
  });
});
