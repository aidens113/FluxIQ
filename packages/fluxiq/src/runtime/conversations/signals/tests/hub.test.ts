import { describe, expect, it, vi } from "vitest";
import { AutomationStudioConversationSignalHub } from "../hub.ts";
import type { AutomationStudioConversationSignal } from "../types.ts";

describe("AutomationStudioConversationSignalHub", () => {
  it("tells every listener of each signal, in order, numbered from 1, with the thread and its scope only", () => {
    const hub = new AutomationStudioConversationSignalHub();
    const first: AutomationStudioConversationSignal[] = [];
    const second: AutomationStudioConversationSignal[] = [];
    hub.subscribe((signal) => first.push(signal));
    const leave = hub.subscribe((signal) => second.push(signal));
    expect(hub.version()).toBe(0);
    hub.signal({ kind: "project", projectId: "project.a" }, "conversation.one");
    leave();
    hub.signal({ kind: "panel", userId: "user.ada" }, "conversation.two");
    expect(first).toEqual([
      { scope: { kind: "project", projectId: "project.a" }, conversationId: "conversation.one", version: 1 },
      { scope: { kind: "panel", userId: "user.ada" }, conversationId: "conversation.two", version: 2 }
    ]);
    expect(second).toEqual([first[0]]);
    expect(Object.isFrozen(first[0])).toBe(true);
    expect(Object.isFrozen(first[0]!.scope)).toBe(true);
    expect(hub.version()).toBe(2);
  });

  it("reports a listener that throws and still tells the others", () => {
    const failed = vi.fn();
    const hub = new AutomationStudioConversationSignalHub({ onListenerFailed: failed });
    const heard = vi.fn();
    hub.subscribe(() => {
      throw new TypeError("listener broke");
    });
    hub.subscribe(heard);
    expect(() => hub.signal({ kind: "project", projectId: "project.a" }, "conversation.one")).not.toThrow();
    expect(failed).toHaveBeenCalledOnce();
    expect(failed.mock.calls[0]![0]).toBeInstanceOf(TypeError);
    expect(heard).toHaveBeenCalledOnce();
  });
});
