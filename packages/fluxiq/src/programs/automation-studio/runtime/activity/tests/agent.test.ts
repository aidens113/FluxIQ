// Which of a build's agents an activity event comes from: stamped in the one
// publish path from the agent frame, never threaded through an emission site.
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { currentAutomationStudioActivityAgent, runWithAutomationStudioActivityAgent } from "../agent.ts";
import { bindAutomationStudioActivityRun } from "../bind.ts";
import { automationStudioActivityHub } from "../default-hub.ts";
import { emitAutomationStudioActivity } from "../emit.ts";
import { AutomationStudioActivityHub } from "../hub.ts";
import { runWithAutomationStudioActivity } from "../scope.ts";

let seen: ClientGatewayActivity[] = [];
let unsubscribe: () => void = () => undefined;
beforeEach(() => {
  seen = [];
  unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
});
afterEach(() => unsubscribe());

const build = { kind: "build" as const, id: "b1", projectId: "p1" };
const say = (label: string) => emitAutomationStudioActivity({ phase: "building", label });
const tick = () => new Promise((resolve) => setTimeout(resolve, 1));

describe("the agent an activity event comes from", () => {
  it("is stamped on events inside an agent frame and absent outside one", async () => {
    await runWithAutomationStudioActivity(build, async () => {
      say("before");
      await runWithAutomationStudioActivityAgent({ role: "builder", briefId: "b-save", subflowName: "Save recipe" }, async () => {
        await tick();
        say("inside");
      });
      say("after");
    });
    expect(seen.map((event) => [event.label, event.agent])).toEqual([
      ["before", undefined],
      ["inside", { role: "builder", briefId: "b-save", subflowName: "Save recipe" }],
      ["after", undefined]
    ]);
    expect(seen[0]).not.toHaveProperty("agent");
  });

  it("takes the innermost frame whole, so a supervisor inside a builder carries no brief id", () => {
    runWithAutomationStudioActivity(build, () => {
      runWithAutomationStudioActivityAgent({ role: "builder", briefId: "b-1" }, () => {
        runWithAutomationStudioActivityAgent({ role: "supervisor" }, () => say("supervisor"));
        say("builder");
      });
    });
    expect(seen.map((event) => event.agent)).toEqual([{ role: "supervisor" }, { role: "builder", briefId: "b-1" }]);
  });

  it("keeps two agents working at once under Promise.all apart", async () => {
    await runWithAutomationStudioActivity(build, () => Promise.all(["b-1", "b-2"].map((briefId) =>
      runWithAutomationStudioActivityAgent({ role: "builder", briefId }, async () => {
        for (let index = 0; index < 3; index += 1) {
          await tick();
          say(`${briefId} step ${index}`);
        }
      }))));
    expect(seen).toHaveLength(6);
    for (const event of seen) expect(event.label.startsWith(event.agent?.briefId ?? "none")).toBe(true);
  });

  it("is a copy its caller cannot change afterwards", () => {
    const agent = { role: "builder" as const, briefId: "b-1" };
    runWithAutomationStudioActivity(build, () => runWithAutomationStudioActivityAgent(agent, () => {
      agent.briefId = "changed";
      expect(currentAutomationStudioActivityAgent()).toEqual({ role: "builder", briefId: "b-1" });
      say("still b-1");
    }));
    expect(seen[0]!.agent).toEqual({ role: "builder", briefId: "b-1" });
    expect(currentAutomationStudioActivityAgent()).toBeUndefined();
  });

  it("leaves a run started inside an agent frame to bind as before, and stamps its events", async () => {
    await runWithAutomationStudioActivityAgent({ role: "validator", briefId: "b-1" }, () =>
      runWithAutomationStudioActivity({ kind: "run", id: "", projectId: "p1" }, async () => {
        say("too early");
        bindAutomationStudioActivityRun("run-9");
        say("Running step 1");
      }, { pending: true }));
    expect(seen.map((event) => [event.activityId, event.label, event.agent])).toEqual([
      ["run:run-9", "Run started", { role: "validator", briefId: "b-1" }],
      ["run:run-9", "Running step 1", { role: "validator", briefId: "b-1" }]
    ]);
  });

  it("emits nothing in an agent frame with no unit of work", () => {
    runWithAutomationStudioActivityAgent({ role: "supervisor" }, () => say("nowhere"));
    expect(seen).toEqual([]);
  });

  it("is carried by the publisher unchanged when it is in the contract's shape", () => {
    const hub = new AutomationStudioActivityHub(() => new Date("2026-10-13T00:00:00Z"));
    const agent = { role: "repair" as const, briefId: "b-2.repair", subflowName: "Save recipe" };
    const event = hub.publish({ activityId: "build:b1", subject: { kind: "build", id: "b1", projectId: "p1" }, phase: "repairing", label: "Repairing", agent });
    expect(event.agent).toEqual(agent);
    expect(hub.snapshot("p1").current?.agent).toEqual(agent);
  });
});
