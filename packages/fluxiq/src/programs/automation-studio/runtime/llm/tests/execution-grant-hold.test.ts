// A runtime grant is held for the run it authorizes from the moment that run
// starts. Its recovery claims the grant only once a step fails, and on
// 2026-09-21 a recorded Flow failed 87 s in: the sixty-second claim window had
// closed, and the recovery ended `llm.provider_resolution_failed` with no call.
// Held, the claim window runs to the run's own lease; the host still revokes
// the grant when the run ends.

import { afterEach, describe, expect, it, vi } from "vitest";
import { AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_MAX_RUN_MS } from "../execution-grants.ts";
import { automationStudioRuntimeSessionGrantTaskKinds } from "../runtime-session-grant.ts";
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
