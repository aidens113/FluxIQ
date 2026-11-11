import { describe, expect, it } from "vitest";
import { runWithAutomationStudioRunSecrets } from "../../run-secrets/index.ts";
import { AutomationStudioActivityHub } from "../hub.ts";
import type { AutomationStudioActivityInput } from "../contracts.ts";

const event = (text: string): AutomationStudioActivityInput => ({
  activityId: "run:r1",
  subject: { kind: "run", id: "r1", projectId: "p1" },
  phase: "running",
  label: `Typing ${text}`,
  step: { index: 0, count: 1, label: `Fill ${text}` },
  detail: { kind: "step", title: `Typed ${text}`, text: `value=${text}` }
});

describe("the activity hub and a run's secrets", () => {
  it("withholds the run's secret from every string of an event, before it is stored or published", () => {
    const hub = new AutomationStudioActivityHub();
    const heard: string[] = [];
    hub.subscribe((e) => heard.push(JSON.stringify(e)));
    runWithAutomationStudioRunSecrets({ password: "hunter2-secret" }, () => hub.publish(event("hunter2-secret")));
    const stored = JSON.stringify(hub.snapshot("p1"));
    for (const text of [stored, ...heard]) {
      expect(text).not.toContain("hunter2-secret");
      expect(text).toContain("[withheld]");
    }
    expect(hub.snapshot("p1").current?.detail?.text).toBe("value=[withheld]");
    expect(hub.snapshot("p1").current?.step?.label).toBe("Fill [withheld]");
  });

  it("withholds through awaits and timers, and only each concurrent run's own secret", async () => {
    const hub = new AutomationStudioActivityHub();
    const one = runWithAutomationStudioRunSecrets({ a: "alpha-secret" }, async () => {
      await new Promise((r) => setTimeout(r, 2));
      hub.publish({ ...event("alpha-secret beta-secret"), activityId: "run:one" });
    });
    const two = runWithAutomationStudioRunSecrets({ b: "beta-secret" }, async () => {
      await new Promise((r) => setTimeout(r, 1));
      hub.publish({ ...event("alpha-secret beta-secret"), activityId: "run:two" });
    });
    await Promise.all([one, two]);
    const texts = hub.snapshot("p1").recent.map((e) => ({ id: e.activityId, text: e.detail?.text }));
    expect(texts.find((t) => t.id === "run:one")?.text).toBe("value=[withheld] beta-secret");
    expect(texts.find((t) => t.id === "run:two")?.text).toBe("value=alpha-secret [withheld]");
  });

  it("leaves an event unchanged when no secrets are in context", () => {
    const hub = new AutomationStudioActivityHub();
    const out = hub.publish(event("hunter2-secret"));
    expect(out.detail?.text).toBe("value=hunter2-secret");
    expect(out.label).toBe("Typing hunter2-secret");
  });
});
