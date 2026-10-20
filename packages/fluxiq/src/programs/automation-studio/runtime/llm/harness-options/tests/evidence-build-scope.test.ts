// Every call a registry binding runs says which build it belongs to (t728,
// audit finding 8): the domain reads it from Core's frame instead of parsing
// Core's call ids.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { automationStudioEvidenceBuildBound, runWithAutomationStudioEvidenceBuild } from "../evidence-build.ts";
import { automationStudioEvidenceBuildScope, type AutomationStudioEvidenceBuildScope } from "../evidence-build-scope.ts";
import type { AutomationStudioHarnessOptionBundle } from "../option.ts";
import { AutomationStudioHarnessOptionRegistry, type AutomationStudioHarnessOptionResolution } from "../registry.ts";

// A domain with nothing of the web in it: a warehouse whose one look counts the shelves.
const DOMAIN_ID = "warehouse";
const TOOL_ID = "warehouse.count_shelves";
const RESOLUTION: AutomationStudioHarnessOptionResolution = { scope: { kind: "domain", domainId: DOMAIN_ID } };

function registry(seen: Array<AutomationStudioEvidenceBuildScope | undefined>): AutomationStudioHarnessOptionRegistry {
  const bundle: AutomationStudioHarnessOptionBundle = {
    schemaVersion: "0.1",
    domainId: DOMAIN_ID,
    options: [{
      toolId: TOOL_ID,
      description: "Count the shelves in the current aisle.",
      inputSchema: { type: "object", additionalProperties: true, properties: {} },
      effect: "observe",
      availability: { kind: "domain", domainId: DOMAIN_ID },
      safety: { sideEffect: "observe" }
    }],
    implementations: {
      [TOOL_ID]: async () => {
        // Read after an await, as a domain reads it deep in its own work.
        await Promise.resolve();
        seen.push(automationStudioEvidenceBuildScope());
        return { shelves: 3 };
      }
    }
  };
  return new AutomationStudioHarnessOptionRegistry().register(bundle);
}

const call = (callId: string, value: JsonObject = {}) => ({ callId, toolId: TOOL_ID, value });

describe("the evidence build scope", () => {
  it("names the binding's build, and says fresh only on Core's opening call", async () => {
    const seen: Array<AutomationStudioEvidenceBuildScope | undefined> = [];
    const binding = registry(seen).evidenceLoopBinding({ projectId: "p1", flowId: "f1", buildId: "build.one" }, RESOLUTION);
    await binding.executeTool(call(`initial.${TOOL_ID}`));
    await binding.executeTool(call("call.1"));
    expect(seen).toEqual([
      { projectId: "p1", flowId: "f1", buildId: "build.one", opening: "fresh" },
      { projectId: "p1", flowId: "f1", buildId: "build.one" }
    ]);
    expect(automationStudioEvidenceBuildScope()).toBeUndefined();
  });

  it("says continuing on the opening look of a round whose draft holds the Flow", async () => {
    const seen: Array<AutomationStudioEvidenceBuildScope | undefined> = [];
    const binding = registry(seen).evidenceLoopBinding({ projectId: "p1", flowId: "f1", buildId: "build.one" }, RESOLUTION);
    await binding.executeTool(call(`initial.${TOOL_ID}`, { held: [{ node: "aisle.open", parameters: {} }] }));
    // A key that is not Core's `held` list continues nothing.
    await binding.executeTool(call(`initial.${TOOL_ID}`, { held: "yes" }));
    expect(seen.map((scope) => scope?.opening)).toEqual(["continuing", "fresh"]);
  });

  it("carries the opening's call scope to every later call of the round, until an unscoped opening", async () => {
    const seen: Array<AutomationStudioEvidenceBuildScope | undefined> = [];
    const binding = registry(seen).evidenceLoopBinding({ projectId: "p1", flowId: "f1", buildId: "build.one" }, RESOLUTION);
    await binding.executeTool(call(`initial.${TOOL_ID}.brief-1`));
    await binding.executeTool(call("call.1"));
    await binding.executeTool(call(`initial.${TOOL_ID}`));
    await binding.executeTool(call("call.2"));
    expect(seen.map((scope) => [scope?.callScope, scope?.opening])).toEqual([["brief-1", "fresh"], ["brief-1", undefined], [undefined, "fresh"], [undefined, undefined]]);
  });

  it("names the run for a recovery exploration, over any build", async () => {
    const seen: Array<AutomationStudioEvidenceBuildScope | undefined> = [];
    const binding = registry(seen).evidenceLoopBinding({ projectId: "p1", flowId: "f1", runId: "run.7", buildId: "build.one" }, RESOLUTION);
    await runWithAutomationStudioEvidenceBuild("build.frame", () => binding.executeTool(call("call.1")));
    expect(seen[0]?.buildId).toBe("run.7");
  });

  it("reads the build frame a binding with no build of its own runs in, as a project brief's does", async () => {
    const seen: Array<AutomationStudioEvidenceBuildScope | undefined> = [];
    const made = registry(seen);
    const supervisor = made.evidenceLoopBinding({ projectId: "p1", flowId: "f1", buildId: "build.shared" }, RESOLUTION);
    const brief = automationStudioEvidenceBuildBound("build.shared", async () => {
      // The brief's binding is made inside the build, with only the project and the Flow.
      const own = made.evidenceLoopBinding({ projectId: "p1", flowId: "f1" }, RESOLUTION);
      await own.executeTool(call(`initial.${TOOL_ID}.brief-2`));
    });
    await Promise.all([supervisor.executeTool(call("call.1")), brief()]);
    expect(seen.map((scope) => scope?.buildId)).toEqual(["build.shared", "build.shared"]);
    expect(seen.map((scope) => scope?.callScope)).toEqual([undefined, "brief-2"]);
  });

  it("mints one id per binding made outside every build, never shared with another binding", async () => {
    const seen: Array<AutomationStudioEvidenceBuildScope | undefined> = [];
    const made = registry(seen);
    const first = made.evidenceLoopBinding({ projectId: "p1", flowId: "f1" }, RESOLUTION);
    const second = made.evidenceLoopBinding({ projectId: "p1", flowId: "f1" }, RESOLUTION);
    await first.executeTool(call("call.1"));
    await first.executeTool(call("call.2"));
    await second.executeTool(call("call.1"));
    const [a, b, c] = seen.map((scope) => scope?.buildId);
    expect(a).toMatch(/^build\./u);
    expect(b).toBe(a);
    expect(c).not.toBe(a);
  });

  it("keeps two concurrent calls of different builds apart", async () => {
    const seen: Array<AutomationStudioEvidenceBuildScope | undefined> = [];
    const made = registry(seen);
    const one = made.evidenceLoopBinding({ projectId: "p1", flowId: "f1", buildId: "build.a" }, RESOLUTION);
    const two = made.evidenceLoopBinding({ projectId: "p1", flowId: "f2", buildId: "build.b" }, RESOLUTION);
    await Promise.all([one.executeTool(call(`initial.${TOOL_ID}.x`)), two.executeTool(call("call.1"))]);
    expect(seen.map((scope) => `${scope?.flowId}/${scope?.buildId}/${scope?.callScope ?? "-"}`).sort()).toEqual(["f1/build.a/x", "f2/build.b/-"]);
  });
});
