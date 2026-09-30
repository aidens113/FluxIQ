import { describe, expect, it } from "vitest";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { AutomationStudioActivityHub } from "../hub.ts";
import { AUTOMATION_STUDIO_ACTIVITY_LIMITS } from "../limits.ts";
import type { AutomationStudioActivityInput } from "../contracts.ts";

function input(projectId: string, label = "Deciding the next step"): AutomationStudioActivityInput {
  return { activityId: "build:b1", subject: { kind: "build", id: "b1", projectId }, phase: "thinking", label };
}

describe("AutomationStudioActivityHub", () => {
  it("numbers events strictly increasing and stamps them", () => {
    const hub = new AutomationStudioActivityHub(() => new Date("2026-09-29T10:00:00.000Z"));
    const first = hub.publish(input("p1"));
    const second = hub.publish(input("p2"));
    expect(first.sequence).toBe(1);
    expect(second.sequence).toBe(2);
    expect(first.at).toBe("2026-09-29T10:00:00.000Z");
  });

  it("keeps a per-project snapshot capped at the recent limit", () => {
    const hub = new AutomationStudioActivityHub();
    for (let index = 0; index < AUTOMATION_STUDIO_ACTIVITY_LIMITS.recent + 5; index += 1) hub.publish(input("p1", `event ${index}`));
    hub.publish(input("p2", "other"));
    const snapshot = hub.snapshot("p1");
    expect(snapshot.recent).toHaveLength(AUTOMATION_STUDIO_ACTIVITY_LIMITS.recent);
    expect(snapshot.recent[0]!.label).toBe("event 5");
    expect(snapshot.current?.label).toBe(`event ${AUTOMATION_STUDIO_ACTIVITY_LIMITS.recent + 4}`);
    expect(hub.snapshot("p2").recent.map((event) => event.label)).toEqual(["other"]);
    expect(hub.snapshot("none")).toEqual({ current: null, recent: [] });
  });

  it("returns a copy, so a reader cannot change what the hub keeps", () => {
    const hub = new AutomationStudioActivityHub();
    hub.publish(input("p1"));
    hub.snapshot("p1").recent.length = 0;
    expect(hub.snapshot("p1").recent).toHaveLength(1);
  });

  it("delivers to subscribers until they unsubscribe, and survives one that throws", () => {
    const hub = new AutomationStudioActivityHub();
    const seen: ClientGatewayActivity[] = [];
    hub.subscribe(() => { throw new Error("subscriber broke"); });
    const unsubscribe = hub.subscribe((event) => seen.push(event));
    expect(() => hub.publish(input("p1"))).not.toThrow();
    unsubscribe();
    hub.publish(input("p1"));
    expect(seen).toHaveLength(1);
  });

  it("truncates label, title and text to their bounds (D4)", () => {
    const hub = new AutomationStudioActivityHub();
    const event = hub.publish({
      ...input("p1", "l".repeat(500)),
      step: { index: 1, count: 2, label: "s".repeat(500) },
      detail: { kind: "tool", title: "t".repeat(500), text: "x".repeat(5_000), ref: "tool.id" }
    });
    expect(event.label).toHaveLength(160);
    expect(event.label.endsWith("…")).toBe(true);
    expect(event.step?.label).toHaveLength(160);
    expect(event.detail?.title).toHaveLength(160);
    expect(event.detail?.text).toHaveLength(1_000);
    expect(event.detail?.ref).toBe("tool.id");
  });

  it("leaves strings within their bounds untouched and adds no absent field", () => {
    const hub = new AutomationStudioActivityHub();
    const event = hub.publish(input("p1", "short"));
    expect(event.label).toBe("short");
    expect(Object.keys(event).sort()).toEqual(["activityId", "at", "label", "phase", "sequence", "subject"]);
  });
});
