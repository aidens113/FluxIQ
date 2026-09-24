// A runtime grant is held for the run it authorizes from the moment that run
// starts. Its recovery claims the grant only once a step fails, and on
// 2026-09-21 a recorded Flow failed 87 s in: the sixty-second claim window had
// closed, and the recovery ended `llm.provider_resolution_failed` with no call.
// Held, the claim window runs to the run's own lease; the host still revokes
// the grant when the run ends.

import { afterEach, describe, expect, it, vi } from "vitest";
import { AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_MAX_RUN_MS } from "../../../execution/index.ts";
import { automationStudioRuntimeSessionGrantTaskKinds } from "../../../runtime-session-grant.ts";
import { issueInput, request, resolveInput, setupExecutionGrantFixture as setup } from "./execution-grant-fixture.ts";

afterEach(() => vi.useRealTimers());

const PURPOSE = "diagnose_and_adapt" as const;
const scope = (grantId: string) => ({ ...resolveInput(grantId), purpose: PURPOSE });
const policy = { allowedTaskKinds: automationStudioRuntimeSessionGrantTaskKinds(PURPOSE) };

describe("holding a runtime grant for its run", () => {
  it("lets the recovery claim a held grant long after the issue TTL, and make its call", async () => {
    const fixture = setup();
    fixture.exactBinding = true;
    const grant = await fixture.service.issue({ ...issueInput(), purpose: PURPOSE, ttlMs: 60_000 });

    fixture.now = 5_000;
    await fixture.service.holdForRun(scope(grant.grantId));
    // The step fails 87 s after the run started, well past the issue TTL.
    fixture.now = 92_000;
    const resolved = await fixture.service.resolve(scope(grant.grantId), policy);
    await expect(resolved.provider.runTask(request())).resolves.toBeDefined();
    // The authorization minted at issue had lapsed; the call exchanged it for one of its own.
    expect(fixture.revealCount).toBe(1);
  });

  // The defect that stopped every repair of a wrong answer. A run that verifies
  // its result resolves the grant to make its `loop_verification` calls, which
  // claims it; the repair the refutation then triggers resolves the same grant
  // again, and a claimed grant used to be refused outright. Live run
  // `run-muexhp0k-73172f73` (2026-09-24) ended there with 29 of its 48 calls and
  // $0.227 of its $0.25 unspent and its run lease untouched -- which is why "a
  // clean run that answers wrongly is a repairable failure" had never once
  // produced a repair. The mutation this is written against: restoring
  // `state !== "available"` to `claimGrant`'s first refusal.
  it("lets the same run resolve again, so a repair can follow the verification that claimed it", async () => {
    const fixture = setup();
    fixture.exactBinding = true;
    const grant = await fixture.service.issue({ ...issueInput(), purpose: PURPOSE, ttlMs: 60_000 });

    fixture.now = 5_000;
    await fixture.service.holdForRun(scope(grant.grantId));
    const verification = await fixture.service.resolve(scope(grant.grantId), policy);
    await expect(verification.provider.runTask(request())).resolves.toBeDefined();
    // The refutation lands, and the repair reaches for the same grant.
    const repair = await fixture.service.resolve(scope(grant.grantId), policy);
    await expect(repair.provider.runTask(request())).resolves.toBeDefined();
    // Two calls off one grant's allowance: re-resolving buys nothing extra.
    expect(repair.maxCallsPerRun).toBe(verification.maxCallsPerRun);
    // And the two providers are still one grant: it runs one call at a time,
    // which is the guard concurrency actually answers to now that a second
    // resolve is allowed.
    const inFlight = verification.provider.runTask(request());
    await expect(repair.provider.runTask(request())).rejects.toThrow("call in progress");
    await expect(inFlight).resolves.toBeDefined();
  });

  // Re-resolving is the same run continuing, not a fresh authorization, so it
  // must not hand the run another lease. Without this a Flow could resolve on a
  // loop and never expire.
  it("does not restart the run lease when the same run resolves again", async () => {
    const fixture = setup();
    fixture.exactBinding = true;
    const grant = await fixture.service.issue({ ...issueInput(), purpose: PURPOSE, ttlMs: 60_000 });

    fixture.now = 5_000;
    await fixture.service.resolve(scope(grant.grantId), policy);
    // Almost the whole lease later, a second resolve still works ...
    fixture.now = 5_000 + AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_MAX_RUN_MS - 1_000;
    await expect(fixture.service.resolve(scope(grant.grantId), policy)).resolves.toBeDefined();
    // ... and past the lease the first claim started, it does not.
    fixture.now = 5_000 + AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_MAX_RUN_MS + 1;
    await expect(fixture.service.resolve(scope(grant.grantId), policy)).rejects.toThrow(/unavailable/);
  });

  // A grant belonging to another actor, session, project, Flow or purpose is a
  // different authorization, and a claimed one is no more shareable than an
  // available one.
  it("refuses a claimed grant asked for under another scope, naming the mismatch", async () => {
    const fixture = setup();
    fixture.exactBinding = true;
    const grant = await fixture.service.issue({ ...issueInput(), purpose: PURPOSE, ttlMs: 60_000 });

    fixture.now = 5_000;
    await fixture.service.resolve(scope(grant.grantId), policy);
    await expect(fixture.service.resolve({ ...scope(grant.grantId), actorSessionId: "session.other" }, policy))
      .rejects.toThrow(/scope mismatch/);
  });

  it("still ends an unheld grant at the issue TTL, as before", async () => {
    const fixture = setup();
    fixture.exactBinding = true;
    const grant = await fixture.service.issue({ ...issueInput(), purpose: PURPOSE, ttlMs: 60_000 });

    fixture.now = 92_000;
    await expect(fixture.service.resolve(scope(grant.grantId), policy)).rejects.toThrow("unavailable");
  });

  it("holds the claim window to the run's lease, not forever", async () => {
    const fixture = setup();
    fixture.exactBinding = true;
    const grant = await fixture.service.issue({ ...issueInput(), purpose: PURPOSE, ttlMs: 60_000 });

    fixture.now = 5_000;
    await fixture.service.holdForRun(scope(grant.grantId));
    fixture.now = 5_000 + AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_MAX_RUN_MS;
    await expect(fixture.service.resolve(scope(grant.grantId), policy)).rejects.toThrow("unavailable");
  });

  it("does not revoke a held grant when the issue TTL's timer fires", async () => {
    vi.useFakeTimers();
    const fixture = setup();
    fixture.exactBinding = true;
    const grant = await fixture.service.issue({ ...issueInput(), purpose: PURPOSE, ttlMs: 60_000 });
    await fixture.service.holdForRun(scope(grant.grantId));

    await vi.advanceTimersByTimeAsync(60_000);
    expect(fixture.service.activeGrantCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_MAX_RUN_MS);
    expect(fixture.service.activeGrantCount()).toBe(0);
  });

  it("holds a grant once, for one run, and never one that lapsed or belongs elsewhere", async () => {
    const fixture = setup();
    fixture.exactBinding = true;
    const held = await fixture.service.issue({ ...issueInput(), purpose: PURPOSE });
    await fixture.service.holdForRun(scope(held.grantId));
    await expect(fixture.service.holdForRun(scope(held.grantId))).rejects.toThrow("unavailable");
    expect(fixture.service.activeGrantCount()).toBe(0);

    const elsewhere = await fixture.service.issue({ ...issueInput(), purpose: PURPOSE });
    await expect(fixture.service.holdForRun({ ...scope(elsewhere.grantId), flowId: "flow.other" })).rejects.toThrow("scope");

    const lapsed = await fixture.service.issue({ ...issueInput(), purpose: PURPOSE, ttlMs: 1_000 });
    fixture.now += 2_000;
    await expect(fixture.service.holdForRun(scope(lapsed.grantId))).rejects.toThrow("unavailable");

    const claimed = await fixture.service.issue({ ...issueInput(), purpose: PURPOSE });
    await fixture.service.resolve(scope(claimed.grantId), policy);
    await expect(fixture.service.holdForRun(scope(claimed.grantId))).rejects.toThrow("unavailable");
  });
});
