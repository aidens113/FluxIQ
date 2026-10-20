// The start hook under a host-resource lease (automation-project-agents plan,
// A11): a trial run inside a lease scope hands the hook that lease, so a
// domain above capacity 1 resets only the resource it names; two holders at
// once each hand their own; a lease released before the start never reaches
// the hook; and outside any scope the hook is called exactly as before.
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { automationStudioLiveRunEnvironment } from "../../../environment/index.ts";
import { AutomationStudioHostLeaseScope, AutomationStudioHostResourceScheduler, type AutomationStudioHostResourceLease } from "../../../project-agents/host-resources/index.ts";
import { StubHost } from "../../../project-agents/host-resources/tests/stub-host.ts";
import { automationStudioCandidateTrialPort, automationStudioCandidateTrialStart, type AutomationStudioPrepareCandidateStart } from "../index.ts";
import { trialFixture } from "./fixtures.ts";

type HookInput = Parameters<AutomationStudioPrepareCandidateStart>[0];

function hooked() {
  const fixture = trialFixture();
  const seen: HookInput[] = [];
  fixture.ports.prepareStart = async (input) => {
    seen.push(input);
    await Promise.resolve();
    return { reset: input.lease?.resourceKey ?? "everything" };
  };
  return { fixture, seen };
}

function scope(capacity: number): AutomationStudioHostLeaseScope {
  return new AutomationStudioHostLeaseScope(new AutomationStudioHostResourceScheduler(new StubHost({ capacity })));
}

describe("a trial's start hook under a host lease", () => {
  it("outside any lease scope calls the hook with no lease, as before", async () => {
    const { fixture, seen } = hooked();
    const start = await automationStudioCandidateTrialStart(fixture.request(), fixture.ports);
    expect(start).toEqual({ status: "reset", result: { reset: "everything" } });
    expect(seen).toHaveLength(1);
    expect("lease" in seen[0]!).toBe(false);
    expect(Object.keys(seen[0]!).sort()).toEqual(["candidateId", "digest", "flowId", "projectId", "revision", "signal"]);
  });

  it("hands each of two concurrent holders' hooks its own lease, through the trial port's prepareStart and its trial", async () => {
    const leases = scope(2);
    const run = (briefId: string) => leases.run({ role: "subflow_builder", briefId }, async (lease) => {
      const { fixture, seen } = hooked();
      const trials = automationStudioCandidateTrialPort("candidate.1", fixture.ports);
      const signal = new AbortController().signal;
      expect(await trials.port.prepareStart!({ revision: 1, digest: fixture.candidate.digest, signal })).toBe("reset");
      // The trial the gate then asks for runs on the start prepared for it, and a later trial runs the hook itself.
      await trials.port(fixture.request(signal));
      await trials.port(fixture.request(signal));
      return { lease, seen, records: trials.records() };
    });
    const [first, second] = await Promise.all([run("brief.a"), run("brief.b")]);
    for (const held of [first, second]) {
      expect(held.seen).toHaveLength(2);
      for (const input of held.seen) expect(input.lease).toEqual(held.lease);
      expect(held.records.map((record) => record.start)).toEqual([
        { status: "reset", result: { reset: held.lease.resourceKey } },
        { status: "reset", result: { reset: held.lease.resourceKey } }
      ]);
    }
    expect(first.lease.resourceKey).not.toBe(second.lease.resourceKey);
    expect(first.lease.holder.briefId).toBe("brief.a");
    expect(second.lease.holder.briefId).toBe("brief.b");
  });

  it("hands the hook a copy, so a hook cannot change the lease its holder carries", async () => {
    const leases = scope(1);
    const fixture = trialFixture();
    fixture.ports.prepareStart = async (input) => {
      (input.lease as { resourceKey: string }).resourceKey = "someone-else";
      return {};
    };
    const held = await leases.run({ role: "subflow_builder", briefId: "brief.a" }, async (lease) => {
      await automationStudioCandidateTrialStart(fixture.request(), fixture.ports);
      return { lease, current: AutomationStudioHostLeaseScope.current() };
    });
    expect(held.lease.resourceKey).toBe("resource-1");
    expect(held.current?.resourceKey).toBe("resource-1");
  });

  it("never calls the hook under a lease released before the start, and the start fails", async () => {
    const leases = scope(1);
    const { fixture, seen } = hooked();
    let open!: () => void;
    const gate = new Promise<void>((resolve) => { open = resolve; });
    let late!: Promise<Awaited<ReturnType<typeof automationStudioCandidateTrialStart>>>;
    let held!: AutomationStudioHostResourceLease;
    await leases.run({ role: "subflow_builder", briefId: "brief.a" }, async (lease) => {
      held = lease;
      // Work the lease outlives: it starts its trial only after the lease is released.
      late = (async () => {
        await gate;
        return await automationStudioCandidateTrialStart(fixture.request(), fixture.ports);
      })();
    });
    expect(leases.scheduler.isCurrent(held)).toBe(false);
    open();
    expect(await late).toEqual({ status: "failed", code: "candidate.trial_start_lease_stale", failure: "the host resource lease this trial ran under is no longer held" });
    expect(seen).toEqual([]);
  });

  it("with no hook records not_reset inside a lease scope too", async () => {
    const leases = scope(1);
    const fixture = trialFixture();
    const start = await leases.run({ role: "subflow_builder", briefId: "brief.a" }, async () => await automationStudioCandidateTrialStart(fixture.request(), fixture.ports));
    expect(start).toEqual({ status: "not_reset" });
  });
});

// The start hook as its own step (t737): every trial's start, whether the gate's prepareStart or the runner asks
// for it, is written as an `NNNN-reset` step around exactly the hook, and none when no hook runs.
describe("a trial's start hook as a reset step", () => {
  let directory: string;
  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), "fluxiq-start-reset-step-"));
    vi.stubEnv("FLUXIQ_LLM_STEP_LOG_DIR", directory);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(directory, { recursive: true, force: true });
  });
  const resetSteps = () => readdirSync(directory).filter((name) => /^\d{4,}-reset$/u.test(name)).map((name) => JSON.parse(readFileSync(path.join(directory, name, "meta.json"), "utf8")) as Record<string, unknown>);

  it("writes one start_hook step around the hook, and a failed hook as failed", async () => {
    const fixture = trialFixture();
    let called = 0;
    fixture.ports.prepareStart = async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      called = Date.now();
      return {};
    };
    await automationStudioCandidateTrialStart(fixture.request(), fixture.ports);
    const [step] = resetSteps();
    expect(step).toMatchObject({ kind: "reset", stage: "start_hook", trialToolId: null, outcome: "reset", status: "ok" });
    expect(Date.parse(String(step!.startedAt))).toBeLessThanOrEqual(called);
    expect(Date.parse(String(step!.finishedAt))).toBeGreaterThanOrEqual(called);

    fixture.ports.prepareStart = async () => { throw new TypeError("fixture said 42.99"); };
    expect(await automationStudioCandidateTrialStart(fixture.request(), fixture.ports)).toMatchObject({ status: "failed" });
    expect(resetSteps().map((written) => written.outcome)).toEqual(["reset", "failed"]);
  });

  it("writes none when no hook runs: no hook, or an offline trial", async () => {
    const fixture = trialFixture();
    expect(await automationStudioCandidateTrialStart(fixture.request(), fixture.ports)).toEqual({ status: "not_reset" });
    fixture.ports.prepareStart = async () => ({});
    fixture.ports.environment = { ...automationStudioLiveRunEnvironment, kind: "trace" };
    expect(await automationStudioCandidateTrialStart(fixture.request(), fixture.ports)).toEqual({ status: "not_reset" });
    expect(resetSteps()).toEqual([]);
  });
});
