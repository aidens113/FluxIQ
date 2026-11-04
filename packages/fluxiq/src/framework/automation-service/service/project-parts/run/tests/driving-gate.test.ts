// @fluxiq-test-group real-sql
// Covers `../driving-gate.ts`: a part is refused while another run drives the project, a build's
// own call is not, and a build refused by another run gets an ordinary tool answer.
import { afterEach, describe, expect, it } from "vitest";
import type { RunProjectPartResponse } from "../../../../../../api-contracts/automation.ts";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioHostResourceAcquireResult, AutomationStudioHostResourcePort } from "../../../../../../runtime/automation-host/index.ts";
import { AutomationStudioHostLeaseScope, automationStudioProjectHostLeaseScope } from "../../../../../../runtime/project-agents/index.ts";
import { automationStudioProjectBuildRunPartBundle } from "../../index.ts";
import { openRowsHarness, PROJECT, rowGraph, SESSION_AT, type RowsHarness } from "./part-rows-harness.ts";

const ASKED = { permittedConsequences: ["create_new"], acknowledgedRepeat: true };
const BUILDER = { role: "builder", briefId: "brief.1" };

/** A host with one resource, as the web domain's is. */
function hostOfOne(): AutomationStudioHostResourcePort {
  let epoch = 0;
  let held = false;
  return {
    capacity: 1,
    acquire(): AutomationStudioHostResourceAcquireResult {
      if (held) return "at_capacity";
      held = true;
      epoch += 1;
      return { resourceKey: "host.one", epoch, sessionId: "session.one" };
    },
    release() {
      held = false;
    }
  };
}

describe("a part run while another run drives the project", () => {
  let harness: RowsHarness;
  const open = async (hostResources?: AutomationStudioHostResourcePort) => {
    harness = await openRowsHarness(hostResources ? { hostResources } : {});
    return await harness.save([rowGraph("s")]);
  };
  const untouched = () => {
    expect(harness.domain.pressed).toEqual([]);
    expect(harness.domain.reads.count).toBe(0);
    expect(harness.domain.asked).toEqual([]);
    expect(harness.sessions, "a refused part leaves no session").toEqual([]);
  };
  afterEach(async () => {
    await harness.close();
  });

  it.each([["running"], ["queued"], ["waiting"]] as const)("refuses a person while a plain Flow run is %s, in plain words, with nothing asked of the page", async (status) => {
    const partId = await open();
    harness.otherRuns.list = async () => [SESSION_AT(status)];
    const answer = await harness.parts.run({ projectId: PROJECT, partId, inputs: {}, ...ASKED });
    expect(answer).toMatchObject({ ok: false, code: "part.run_in_progress", message: expect.stringContaining("Another run") });
    expect(JSON.stringify(answer)).not.toMatch(/session|lease|host/iu);
    untouched();
  });

  it.each([["succeeded"], ["failed"], ["cancelled"]] as const)("does not count a run that %s", async (status) => {
    const partId = await open();
    harness.otherRuns.list = async () => [SESSION_AT(status)];
    expect(await harness.parts.run({ projectId: PROJECT, partId, inputs: {}, ...ASKED })).toMatchObject({ status: "succeeded" });
  });

  it("refuses when the project's runs cannot be read: nothing says the page is free", async () => {
    const partId = await open();
    harness.otherRuns.list = async () => {
      throw new Error("the store is away");
    };
    expect(await harness.parts.run({ projectId: PROJECT, partId, inputs: {}, ...ASKED })).toMatchObject({ code: "part.run_in_progress" });
    untouched();
  });

  it("refuses a person while a build holds the host, and runs once the build has let it go", async () => {
    const port = hostOfOne();
    const partId = await open(port);
    const { scheduler } = automationStudioProjectHostLeaseScope(port);
    const lease = await scheduler.acquire(BUILDER);
    expect(await harness.parts.run({ projectId: PROJECT, partId, inputs: {}, ...ASKED })).toMatchObject({ code: "part.run_in_progress" });
    untouched();
    await scheduler.release(lease);
    expect(await harness.parts.run({ projectId: PROJECT, partId, inputs: {}, ...ASKED })).toMatchObject({ status: "succeeded" });
    expect(harness.domain.pressed).toEqual(["a", "b", "c"]);
    expect(scheduler.snapshot().held, "the part's own lease is let go when it ends").toEqual([]);
  });

  it("a second part during the first is refused at once, and the first finishes as if nothing was asked", async () => {
    const port = hostOfOne();
    const partId = await open(port);
    let second: unknown;
    let reads = -1;
    let heldInRun: unknown;
    harness.page.afterRead = async (count) => {
      if (count !== 1) return;
      heldInRun = automationStudioProjectHostLeaseScope(port).scheduler.snapshot().held[0]?.holder.role;
      second = await harness.parts.run({ projectId: PROJECT, partId, inputs: {}, ...ASKED });
      reads = harness.domain.reads.count;
    };
    const first = await harness.parts.run({ projectId: PROJECT, partId, inputs: {}, ...ASKED }) as RunProjectPartResponse;
    expect(second).toMatchObject({ code: "part.run_in_progress" });
    expect(first.status).toBe("succeeded");
    expect(heldInRun).toBe("part-run");
    expect(reads).toBe(1);
    expect(harness.domain.pressed, "every row once: the refused part did nothing").toEqual(["a", "b", "c"]);
  });

  it("the run's commands carry its lease, as a build's do", async () => {
    let seen: unknown;
    harness = await openRowsHarness({ hostResources: hostOfOne(), host: { factEvaluator: (conditions) => {
      seen = AutomationStudioHostLeaseScope.current()?.holder.role;
      return conditions.map(() => ({ result: "unknown" as const, capturedAt: 1 }));
    } } });
    const partId = await harness.save([rowGraph("s")]);
    await harness.parts.run({ projectId: PROJECT, partId, inputs: {}, ...ASKED });
    expect(seen).toBe("part-run");
  });

  it("a port that holds back a lease with nothing held is not another run: the guard's own read decides", async () => {
    const partId = await open({ capacity: 1, acquire: () => "at_capacity", release: () => undefined });
    expect(await harness.parts.run({ projectId: PROJECT, partId, inputs: {}, ...ASKED })).toMatchObject({ status: "succeeded" });
    expect(harness.domain.pressed).toEqual(["a", "b", "c"]);
  }, 8_000);

  describe("as a build asks", () => {
    /** The tool as a build's loop calls it, from inside the build's lease. */
    const callTool = async (port: AutomationStudioHostResourcePort, partId: string) => {
      const bundle = automationStudioProjectBuildRunPartBundle({ parts: harness.parts, permittedConsequences: ["create_new"], done: new Set(), landed: () => undefined });
      const call = bundle.implementations["core.run_part"]!;
      const value: JsonObject = { partId, inputs: {} };
      return await automationStudioProjectHostLeaseScope(port).run(BUILDER, async () => await call({ projectId: PROJECT, flowId: "flow.source", callId: "c.1", optionId: "core.run_part", value, permission: async () => ({ permitted: true }) } as unknown as Parameters<typeof call>[0]));
    };

    it("a build's own call, from inside its own lease, is its own run and is not refused, beside its own trial's session", async () => {
      const port = hostOfOne();
      const partId = await open(port);
      harness.otherRuns.list = async () => [SESSION_AT("running", { subflowTrial: { buildId: "b.1" } }), SESSION_AT("running", { explorationAttempt: { attempt: 1 } }), SESSION_AT("running", { candidateTrial: { candidateId: "c" } }), SESSION_AT("running", { partRun: { caller: "build" } })];
      const result = await callTool(port, partId) as { evidence: JsonObject };
      expect(result.evidence).toMatchObject({ status: "succeeded" });
      expect(harness.domain.pressed).toEqual(["a", "b", "c"]);
    });

    it("a build another run stands in the way of gets an ordinary tool answer, and nothing happens", async () => {
      const port = hostOfOne();
      const partId = await open(port);
      harness.otherRuns.list = async () => [SESSION_AT("running")];
      const result = await callTool(port, partId);
      expect(result).toEqual({
        kind: "llm_evidence_tool_execution",
        evidence: { ok: false, code: "part.run_in_progress", instruction: expect.stringContaining("Another run") },
        effectApplied: false, targetsUnchanged: true, resultCode: "part.run_in_progress"
      });
      untouched();
    });
  });
});

describe("the runner's refusal words", () => {
  it("are generic: they name no run, site or thing a page could hold", async () => {
    const harness = await openRowsHarness();
    try {
      const partId = await harness.save([rowGraph("s")]);
      harness.otherRuns.list = async () => [SESSION_AT("running")];
      const { message } = await harness.parts.run({ projectId: PROJECT, partId, inputs: {}, ...ASKED }) as { message: string };
      expect(message).not.toMatch(/job|cart|shop|post|photo|flight|store|listing|market|product/iu);
    } finally {
      await harness.close();
    }
  });
});
