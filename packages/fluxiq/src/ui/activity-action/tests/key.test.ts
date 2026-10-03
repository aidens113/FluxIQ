import { describe, expect, it } from "vitest";
import { activityActionKey } from "../index.ts";

describe("activityActionKey", () => {
  it("is the ask id for both rows of one wait on the person, whatever phase each is in", () => {
    const waiting = activityActionKey({ phase: "waiting_permission", detail: { kind: "ask", title: "Asked the person to complete a check", status: "started", ref: "person-needed.1" } });
    const settled = activityActionKey({ phase: "building", detail: { kind: "ask", title: "Asked the person to complete a check", status: "succeeded", ref: "person-needed.1", resolution: "answered" } });
    expect(waiting).toBe("ask:person-needed.1");
    expect(settled).toBe(waiting);
    expect(activityActionKey({ phase: "waiting_permission", detail: { kind: "ask", title: "Asked a question (permission)", ref: "request.2" } })).not.toBe(waiting);
  });

  it("is null for an ask that names no ask id", () => {
    expect(activityActionKey({ phase: "waiting_permission", detail: { kind: "ask", title: "Run is waiting for an answer", status: "started" } })).toBeNull();
    expect(activityActionKey({ phase: "waiting_permission", detail: { kind: "ask", title: "Run is waiting for an answer", ref: "  " } })).toBeNull();
  });

  it("ties a tool call's or a check's start to its end", () => {
    const started = activityActionKey({ phase: "exploring", detail: { kind: "tool", title: "Clicking “Buy”", status: "started", ref: "web.click" } });
    expect(started).toBe("tool:web.click");
    expect(activityActionKey({ phase: "exploring", detail: { kind: "tool", title: "Clicked “Buy”", status: "succeeded", ref: "web.click" } })).toBe(started);
    expect(activityActionKey({ phase: "verifying", detail: { kind: "check", title: "Completion check", status: "started" } })).toBe("check:Completion check");
  });

  // t174-w85 D1 (run-murwd8le, 00019): the result check starts as "Result check started"
  // and ends as "Result check" (`result-verification/verify.ts`), and the start was left
  // as an orphan grey "Check result" card above the verdict.
  it("ties a result check's start to its end, though the two rows carry different titles", () => {
    const started = activityActionKey({ phase: "verifying", detail: { kind: "check", title: "Result check started", status: "started" } });
    const ended = activityActionKey({ phase: "verifying", detail: { kind: "check", title: "Result check", status: "failed", text: "Not confirmed." } });
    expect(started).not.toBeNull();
    expect(ended).toBe(started);
    expect(activityActionKey({ phase: "verifying", detail: { kind: "check", title: "Completion check", status: "started" } })).not.toBe(started);
  });

  it("is null for rows that are their own card, or no card", () => {
    expect(activityActionKey({ phase: "running" })).toBeNull();
    expect(activityActionKey({ phase: "running", detail: { kind: "step", title: "Open the listing", status: "started", ref: "n2" } })).toBeNull();
    expect(activityActionKey({ phase: "thinking", detail: { kind: "thought", title: "Deciding the next step" } })).toBeNull();
  });
});
