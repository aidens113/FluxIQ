// Every call a registry binding runs says which build it belongs to (t728,
// audit finding 8): the domain reads it from Core's frame instead of parsing
// Core's call ids.

import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { automationStudioCoreMoveRunning, runAsAutomationStudioCoreMove } from "../core-move.ts";
import { automationStudioEvidenceBuildBound, automationStudioEvidenceBuildId, runWithAutomationStudioEvidenceBuild } from "../evidence-build.ts";
import { automationStudioEvidenceBuildScope, runWithAutomationStudioEvidenceBuildScope, type AutomationStudioEvidenceBuildScope } from "../evidence-build-scope.ts";
import type { AutomationStudioHarnessOptionBundle } from "../option.ts";
import { AutomationStudioHarnessOptionRegistry, type AutomationStudioHarnessOptionResolution } from "../registry.ts";

// A domain with nothing of the web in it: a warehouse whose one look counts the shelves.
const DOMAIN_ID = "warehouse";
const TOOL_ID = "warehouse.count_shelves";
const RESOLUTION: AutomationStudioHarnessOptionResolution = { scope: { kind: "domain", domainId: DOMAIN_ID } };

type Read = () => Readonly<AutomationStudioEvidenceBuildScope> | undefined;

function registry(seen: Array<AutomationStudioEvidenceBuildScope | undefined>, read: Read = automationStudioEvidenceBuildScope): AutomationStudioHarnessOptionRegistry {
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
        seen.push(read());
        return { shelves: 3 };
      }
    }
  };
  return new AutomationStudioHarnessOptionRegistry().register(bundle);
}

const call = (callId: string, value: JsonObject = {}) => ({ callId, toolId: TOOL_ID, value });

/**
 * A second copy of the frame's module, as a host that bundles Core loads beside
 * the copy a domain imports natively (the web panel bundles Core; the web
 * domain's host module imports Core's `dist`).
 */
async function anotherCopy(): Promise<{ read: Read; copy: typeof import("../evidence-build-scope.ts") }> {
  vi.resetModules();
  const copy = await import("../evidence-build-scope.ts");
  return { read: copy.automationStudioEvidenceBuildScope, copy };
}

// Office run `run-mvgf04kw-310fc169` (t738): the web panel ran the build with
// the copy of Core it bundles and the web domain read the frame from the copy
// it imports, so the domain never saw a frame. Every dependent builder's
// opening look, marked as its arrival, was refused as an unexpected key.
describe("the evidence build scope across copies of Core in one process", () => {
  it("is seen by another copy of its module", async () => {
    const { read, copy } = await anotherCopy();
    expect(copy.runWithAutomationStudioEvidenceBuildScope).not.toBe(runWithAutomationStudioEvidenceBuildScope);
    const seen = await runWithAutomationStudioEvidenceBuildScope({ projectId: "p1", flowId: "f1", buildId: "build.one", opening: "fresh" }, async () => {
      await Promise.resolve();
      return read();
    });
    expect(seen).toEqual({ projectId: "p1", flowId: "f1", buildId: "build.one", opening: "fresh" });
    // And the other way round: a frame the other copy set is this copy's too.
    expect(copy.runWithAutomationStudioEvidenceBuildScope({ projectId: "p2", flowId: "f2", buildId: "build.two" }, () => automationStudioEvidenceBuildScope())).toEqual({ projectId: "p2", flowId: "f2", buildId: "build.two" });
    expect(read()).toBeUndefined();
  });

  it("reads a build frame another copy set", async () => {
    vi.resetModules();
    const copy = await import("../evidence-build.ts");
    expect(copy.runWithAutomationStudioEvidenceBuild).not.toBe(runWithAutomationStudioEvidenceBuild);
    expect(copy.runWithAutomationStudioEvidenceBuild("build.copy", () => automationStudioEvidenceBuildId())).toBe("build.copy");
    expect(runWithAutomationStudioEvidenceBuild("build.own", () => copy.automationStudioEvidenceBuildId())).toBe("build.own");
  });

  it("frames a registry binding's opening call for a domain reading another copy", async () => {
    const { read } = await anotherCopy();
    const seen: Array<AutomationStudioEvidenceBuildScope | undefined> = [];
    const binding = registry(seen, read).evidenceLoopBinding({ projectId: "p1", flowId: "f1", buildId: "build.one" }, RESOLUTION);
    await binding.executeTool(call(`initial.${TOOL_ID}`, { arrived: true }));
    await binding.executeTool(call("call.1", { arrived: true }));
    expect(seen).toEqual([
      { projectId: "p1", flowId: "f1", buildId: "build.one", opening: "fresh" },
      { projectId: "p1", flowId: "f1", buildId: "build.one" }
    ]);
  });
});

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

// Office rerun round 4 (`run-mvgvyaip-d856e135`, t743): Core's own look went
// through the domain's rule for the model's calls and was refused unrun. A call
// Core's move code makes is framed `move: "core"`; nothing else is.
describe("a move Core makes itself", () => {
  it("is framed as Core's on every registry call it makes, however deep, and never by a call id", async () => {
    const seen: Array<AutomationStudioEvidenceBuildScope | undefined> = [];
    const binding = registry(seen).evidenceLoopBinding({ projectId: "p1", flowId: "f1", buildId: "build.one" }, RESOLUTION);
    await runAsAutomationStudioCoreMove(async () => {
      await Promise.resolve();
      await binding.executeTool(call("site-reset.look.1.arrival"));
      await binding.executeTool(call(`initial.${TOOL_ID}`));
    });
    // The same ids from outside the marker, as a model could write the first.
    await binding.executeTool(call("site-reset.look.1.arrival"));
    expect(seen).toEqual([
      { projectId: "p1", flowId: "f1", buildId: "build.one", move: "core" },
      { projectId: "p1", flowId: "f1", buildId: "build.one", opening: "fresh", move: "core" },
      { projectId: "p1", flowId: "f1", buildId: "build.one" }
    ]);
    expect(automationStudioCoreMoveRunning()).toBe(false);
  });

  it("is a frame field only Core's own frame setter writes, and a scope without it carries none", () => {
    expect(runWithAutomationStudioEvidenceBuildScope({ projectId: "p", flowId: "f", buildId: "b", move: "core" }, () => automationStudioEvidenceBuildScope())).toEqual({ projectId: "p", flowId: "f", buildId: "b", move: "core" });
    expect(runWithAutomationStudioEvidenceBuildScope({ projectId: "p", flowId: "f", buildId: "b" }, () => automationStudioEvidenceBuildScope())).not.toHaveProperty("move");
  });

  it("is seen by the registry of another copy of Core in the process", async () => {
    vi.resetModules();
    const copy = await import("../core-move.ts");
    expect(copy.runAsAutomationStudioCoreMove).not.toBe(runAsAutomationStudioCoreMove);
    const seen: Array<AutomationStudioEvidenceBuildScope | undefined> = [];
    const binding = registry(seen).evidenceLoopBinding({ projectId: "p1", flowId: "f1", buildId: "build.one" }, RESOLUTION);
    await copy.runAsAutomationStudioCoreMove(() => binding.executeTool(call("call.1")));
    expect(runAsAutomationStudioCoreMove(() => copy.automationStudioCoreMoveRunning())).toBe(true);
    expect(seen.map((scope) => scope?.move)).toEqual(["core"]);
  });
});
