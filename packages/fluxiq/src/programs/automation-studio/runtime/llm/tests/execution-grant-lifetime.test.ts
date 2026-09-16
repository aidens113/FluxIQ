import { afterEach, describe, expect, it, vi } from "vitest";
import { AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_MAX_RUN_MS } from "../execution-grants.ts";
import { issueInput, request, resolveInput, setupExecutionGrantFixture as setup } from "./execution-grant-fixture.ts";

afterEach(() => vi.useRealTimers());

// A grant has two lifetimes. The TTL it is issued with bounds when it may be
// claimed; a claim starts a run lease that bounds how long the run may keep
// calling. Each case pins one security property of that split.
describe("an execution grant's claim window and run lease", () => {
  // Property: an unclaimed grant still expires promptly, and takes every reveal
  // authorization it holds with it.
  it("expires an unclaimed grant at the end of its claim window, revoking its authorizations", async () => {
    vi.useFakeTimers();
    const fixture = setup();
    fixture.exactBinding = true;
    const grant = await fixture.service.issue({ ...issueInput(), purpose: "diagnose_and_adapt", maxCalls: 3, ttlMs: 1000 });
    expect(grant.expiresAtMs).toBe(1001);
    await vi.advanceTimersByTimeAsync(999);
    expect(fixture.service.activeGrantCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fixture.service.activeGrantCount()).toBe(0);
    expect(fixture.revokedAuthorizationIds).toEqual(["secret-reveal:1", "secret-reveal:2", "secret-reveal:3"]);
    fixture.now = 1001;
    await expect(fixture.service.resolve({ ...resolveInput(grant.grantId), purpose: "diagnose_and_adapt" })).rejects.toThrow("unavailable");

    // Even with its timer not yet run, a grant past its claim window cannot be claimed.
    vi.useRealTimers();
    fixture.now = 1;
    const late = await fixture.service.issue({ ...issueInput(), purpose: "diagnose_and_adapt", maxCalls: 3, ttlMs: 1000 });
    fixture.now = 1001;
    await expect(fixture.service.resolve({ ...resolveInput(late.grantId), purpose: "diagnose_and_adapt" })).rejects.toThrow("unavailable");
    expect(fixture.service.activeGrantCount()).toBe(0);
    expect(fixture.revealCount).toBe(0);
  });

  // Property: once claimed, the run -- not the claim window, and not the
  // longest TTL a grant may be issued with -- decides how long it may call,
  // up to the run lease and no further.
  it("keeps a claimed grant calling past its claim window, and refuses and revokes it at the end of its run lease", async () => {
    const fixture = setup();
    fixture.exactBinding = true;
    const grant = await fixture.service.issue({ ...issueInput(), purpose: "diagnose_and_adapt", maxCalls: 4, ttlMs: 1000 });
    const resolved = await fixture.service.resolve({ ...resolveInput(grant.grantId), purpose: "diagnose_and_adapt" });
    expect(AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_MAX_RUN_MS).toBe(600_000);

    // Past the claim window and past the five-minute TTL ceiling.
    fixture.now = 1 + 300_001;
    await expect(resolved.provider.runTask({ ...request(), requestId: "request.l1", idempotencyKey: "request.l1" })).resolves.toBeDefined();
    fixture.now = AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_MAX_RUN_MS;
    await expect(resolved.provider.runTask({ ...request(), requestId: "request.l2", idempotencyKey: "request.l2" })).resolves.toBeDefined();
    expect(fixture.revealCount).toBe(2);
    expect(fixture.service.activeGrantCount()).toBe(1);

    fixture.now = 1 + AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_MAX_RUN_MS;
    await expect(resolved.provider.runTask({ ...request(), requestId: "request.l3", idempotencyKey: "request.l3" })).rejects.toThrow("unavailable");
    expect(fixture.revealCount).toBe(2);
    expect(fixture.service.activeGrantCount()).toBe(0);
    // Every authorization it still held is gone with it.
    expect(fixture.revokedAuthorizationIds).toEqual(expect.arrayContaining(["secret-reveal:3", "secret-reveal:4"]));
  });

  // Property: exchanging an expired authorization never widens what the grant
  // may reveal. Each call spends one of the grant's calls, the old
  // authorization is revoked, the reveal uses only the fresh one, and a
  // consumed grant is refused however its authorizations were renewed.
  it("exchanges one for one, so a claimed grant never reveals more than its call count", async () => {
    const fixture = setup();
    fixture.exactBinding = true;
    const grant = await fixture.service.issue({ ...issueInput(), purpose: "diagnose_and_adapt", maxCalls: 2, ttlMs: 1000 });
    const resolved = await fixture.service.resolve({ ...resolveInput(grant.grantId), purpose: "diagnose_and_adapt" });
    fixture.now = 5_000;
    await expect(resolved.provider.runTask({ ...request(), requestId: "request.e1", idempotencyKey: "request.e1" })).resolves.toBeDefined();
    await expect(resolved.provider.runTask({ ...request(), requestId: "request.e2", idempotencyKey: "request.e2" })).resolves.toBeDefined();
    // Two minted at issue, two exchanged for; only the exchanged two revealed.
    expect(fixture.revealAuthorizationCount).toBe(4);
    expect(fixture.revealedAuthorizationIds).toEqual(["secret-reveal:3", "secret-reveal:4"]);
    expect(fixture.revokedAuthorizationIds).toEqual(expect.arrayContaining(["secret-reveal:1", "secret-reveal:2"]));
    // Consumed: refused, and nothing more is minted for it.
    expect(fixture.service.activeGrantCount()).toBe(0);
    await expect(resolved.provider.runTask({ ...request(), requestId: "request.e3", idempotencyKey: "request.e3" })).rejects.toThrow("unavailable");
    expect(fixture.revealAuthorizationCount).toBe(4);
    expect(fixture.revealCount).toBe(2);
  });

  // Property: a call made while the issue-time authorizations still cover it
  // uses them, exactly as before; nothing is minted that is not needed.
  it("uses the authorizations minted at issue while they still outlive the call", async () => {
    const fixture = setup();
    fixture.exactBinding = true;
    const grant = await fixture.service.issue({ ...issueInput(), purpose: "diagnose_and_adapt", maxCalls: 2 });
    const resolved = await fixture.service.resolve({ ...resolveInput(grant.grantId), purpose: "diagnose_and_adapt" });
    await expect(resolved.provider.runTask(request())).resolves.toBeDefined();
    expect(fixture.revealAuthorizationCount).toBe(2);
    expect(fixture.revealedAuthorizationIds).toEqual(["secret-reveal:1"]);
    fixture.service.close();
  });

  // Property: a revoked grant is refused inside its run lease, before any
  // authorization is minted or any key revealed.
  it("refuses a claimed grant that was revoked, however much of its lease is left", async () => {
    const fixture = setup();
    fixture.exactBinding = true;
    const grant = await fixture.service.issue({ ...issueInput(), purpose: "diagnose_and_adapt", ttlMs: 1000 });
    const resolved = await fixture.service.resolve({ ...resolveInput(grant.grantId), purpose: "diagnose_and_adapt" });
    fixture.now = 5_000;
    fixture.service.revoke(grant.grantId);
    await expect(resolved.provider.runTask(request())).rejects.toThrow("unavailable");
    expect(fixture.revealAuthorizationCount).toBe(26);
    expect(fixture.revealCount).toBe(0);
    await expect(fixture.service.resolve({ ...resolveInput(grant.grantId), purpose: "diagnose_and_adapt" })).rejects.toThrow("unavailable");
  });

  // Property: a claimed grant dies with its actor's session. A call after the
  // session ends is refused; and an exchange the Secret Keys session unlock can
  // no longer mint is refused and revokes the grant, with nothing revealed.
  it("dies with the actor's session and with the actor's Secret Keys unlock", async () => {
    const fixture = setup();
    fixture.exactBinding = true;
    let grant = await fixture.service.issue({ ...issueInput(), purpose: "diagnose_and_adapt", ttlMs: 1000 });
    let resolved = await fixture.service.resolve({ ...resolveInput(grant.grantId), purpose: "diagnose_and_adapt" });
    fixture.now = 5_000;
    fixture.sessionValid = false;
    await expect(resolved.provider.runTask(request())).rejects.toThrow("no longer valid");
    expect(fixture.service.activeGrantCount()).toBe(0);
    fixture.sessionValid = true;

    fixture.now = 1;
    grant = await fixture.service.issue({ ...issueInput(), purpose: "diagnose_and_adapt", ttlMs: 1000 });
    resolved = await fixture.service.resolve({ ...resolveInput(grant.grantId), purpose: "diagnose_and_adapt" });
    fixture.now = 5_000;
    fixture.sessionUnlocked = false;
    await expect(resolved.provider.runTask(request())).rejects.toThrow("session unlock is unavailable");
    expect(fixture.service.activeGrantCount()).toBe(0);
    expect(fixture.revealCount).toBe(0);
  });

  // Property: an authorization minted for a call does not outlive a grant that
  // was revoked while it was being minted.
  it("revokes a freshly minted authorization when the grant was revoked while it was minted", async () => {
    const fixture = setup();
    fixture.exactBinding = true;
    const grant = await fixture.service.issue({ ...issueInput(), purpose: "diagnose_and_adapt", maxCalls: 2, ttlMs: 1000 });
    const resolved = await fixture.service.resolve({ ...resolveInput(grant.grantId), purpose: "diagnose_and_adapt" });
    fixture.now = 5_000;
    fixture.delayMint = true;
    const pending = resolved.provider.runTask(request());
    await fixture.mintStarted;
    fixture.service.revoke(grant.grantId);
    fixture.releaseMint();
    await expect(pending).rejects.toThrow();
    expect(fixture.revealAuthorizationCount).toBe(3);
    expect(fixture.revokedAuthorizationIds).toContain("secret-reveal:3");
    expect(fixture.revealCount).toBe(0);
    expect(fixture.service.activeGrantCount()).toBe(0);
  });
});
