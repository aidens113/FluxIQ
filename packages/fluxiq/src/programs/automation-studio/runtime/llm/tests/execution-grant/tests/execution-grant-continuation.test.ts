import { describe, expect, it } from "vitest";
import { issueInput, request, resolveInput, setupExecutionGrantFixture as setup } from "./execution-grant-fixture.ts";

const PURPOSE = "build_and_adapt" as const;
const previous = { executionDigest: "execution-digest.one", settingsRevision: 7 };
const applied = { executionDigest: "execution-digest.two", settingsRevision: 8 };
const scope = (grantId: string) => ({ ...resolveInput(grantId), purpose: PURPOSE });
const continuation = (grantId: string) => ({ ...scope(grantId), expectedPreviousBinding: previous, appliedBinding: applied });

async function claimedHeldGrant() {
  const fixture = setup();
  fixture.exactBinding = true;
  const grant = await fixture.service.issue({
    ...issueInput(),
    purpose: PURPOSE,
    maxCalls: 4,
    maxEstimatedCostUsd: 0.1,
    maxTotalEstimatedCostUsd: 0.4,
    permittedConsequences: ["modify_existing"]
  });
  await fixture.service.holdForRun(scope(grant.grantId));
  const resolved = await fixture.service.resolve(scope(grant.grantId));
  return { fixture, grant, resolved };
}

function stored(fixture: ReturnType<typeof setup>) {
  return [...((fixture.service as any).grants.values() as Iterable<any>)][0];
}

function pauseNextBindingRead(fixture: ReturnType<typeof setup>) {
  const options = (fixture.service as any).options;
  const original = options.resolveExecutionDigest;
  let release = () => {};
  let start = () => {};
  let paused = true;
  const started = new Promise<void>((resolve) => { start = resolve; });
  const wait = new Promise<void>((resolve) => { release = resolve; });
  options.resolveExecutionDigest = async (...args: unknown[]) => {
    if (paused) {
      paused = false;
      start();
      await wait;
    }
    return original(...args);
  };
  return { started, release };
}

describe("continuing a held execution grant after its applied Flow adaptation", () => {
  it("advances only the exact binding and preserves the run's authority, allowance, accounting, lease, and reveals", async () => {
    const { fixture, grant, resolved } = await claimedHeldGrant();
    await resolved.provider.runTask({ ...request(), maxEstimatedCostUsd: 0.1 });
    const before = stored(fixture);
    const preserved = { ...before };
    delete preserved.executionDigest;
    delete preserved.settingsRevision;
    const revealAuthorizations = before.revealAuthorizationIds;
    const consequences = before.permittedConsequences;
    const tokenLimits = before.tokenLimits;
    const expiryTimer = before.expiryTimer;
    const authorizationCount = fixture.revealAuthorizationCount;
    const revokeCount = fixture.revokeAuthorizationCount;

    fixture.executionDigest = applied.executionDigest;
    fixture.settingsRevision = applied.settingsRevision;
    const continued = await fixture.service.continueAfterAppliedFlowAdaptation(continuation(grant.grantId));

    expect(continued).toMatchObject({ ...applied, grantId: grant.grantId, purpose: PURPOSE, remainingUses: 3 });
    const afterContinuation = stored(fixture);
    const afterPreserved = { ...afterContinuation };
    delete afterPreserved.executionDigest;
    delete afterPreserved.settingsRevision;
    expect(afterContinuation).toBe(before);
    expect(afterPreserved).toEqual(preserved);
    expect(afterContinuation).toMatchObject(applied);
    expect(afterContinuation.revealAuthorizationIds).toBe(revealAuthorizations);
    expect(afterContinuation.permittedConsequences).toBe(consequences);
    expect(afterContinuation.tokenLimits).toBe(tokenLimits);
    expect(afterContinuation.expiryTimer).toBe(expiryTimer);
    expect(fixture.revealAuthorizationCount).toBe(authorizationCount);
    expect(fixture.revokeAuthorizationCount).toBe(revokeCount);

    const after = await fixture.service.resolve(scope(grant.grantId));
    await after.provider.runTask({ ...request(), requestId: "request.after", idempotencyKey: "request.after", maxEstimatedCostUsd: 0.1 });
    expect(stored(fixture)).toMatchObject({ remainingUses: 2, committedEstimatedCostUsd: 0.2, committedTotalTokens: 4 });
  });

  it("refuses grants that are not both held and claimed, or have a call in flight", async () => {
    let fixture = setup();
    fixture.exactBinding = true;
    let grant = await fixture.service.issue({ ...issueInput(), purpose: PURPOSE });
    await fixture.service.holdForRun(scope(grant.grantId));
    fixture.executionDigest = applied.executionDigest;
    fixture.settingsRevision = applied.settingsRevision;
    await expect(fixture.service.continueAfterAppliedFlowAdaptation(continuation(grant.grantId))).rejects.toMatchObject({ code: "llm.execution_grant_unavailable" });

    fixture = setup();
    fixture.exactBinding = true;
    grant = await fixture.service.issue({ ...issueInput(), purpose: PURPOSE });
    await fixture.service.resolve(scope(grant.grantId));
    fixture.executionDigest = applied.executionDigest;
    fixture.settingsRevision = applied.settingsRevision;
    await expect(fixture.service.continueAfterAppliedFlowAdaptation(continuation(grant.grantId))).rejects.toMatchObject({ code: "llm.execution_grant_unavailable" });

    const active = await claimedHeldGrant();
    active.fixture.delayProvider = true;
    const inFlight = active.resolved.provider.runTask({ ...request(), maxEstimatedCostUsd: 0.1 });
    await active.fixture.providerStarted;
    await expect(active.fixture.service.continueAfterAppliedFlowAdaptation(continuation(active.grant.grantId))).rejects.toMatchObject({ code: "llm.execution_grant_unavailable" });
    await expect(inFlight).rejects.toBeDefined();

    await expect(active.fixture.service.continueAfterAppliedFlowAdaptation(continuation("llm-grant:absent")))
      .rejects.toMatchObject({ code: "llm.execution_grant_unavailable" });

    fixture = setup();
    fixture.exactBinding = true;
    grant = await fixture.service.issue({ ...issueInput(), purpose: PURPOSE, maxCalls: 1 });
    await fixture.service.holdForRun(scope(grant.grantId));
    await (await fixture.service.resolve(scope(grant.grantId))).provider.runTask(request());
    await expect(fixture.service.continueAfterAppliedFlowAdaptation(continuation(grant.grantId)))
      .rejects.toMatchObject({ code: "llm.execution_grant_unavailable" });
  });

  it("refuses the wrong scope without blessing the requested binding", async () => {
    const { fixture, grant } = await claimedHeldGrant();
    fixture.executionDigest = applied.executionDigest;
    fixture.settingsRevision = applied.settingsRevision;
    await expect(fixture.service.continueAfterAppliedFlowAdaptation({ ...continuation(grant.grantId), actorSessionId: "session.other" }))
      .rejects.toMatchObject({ code: "llm.execution_grant_scope_mismatch" });
    expect(fixture.service.activeGrantCount()).toBe(0);
  });

  it("refuses a stale previous binding or a proposed binding that is not authoritative", async () => {
    let run = await claimedHeldGrant();
    run.fixture.executionDigest = applied.executionDigest;
    run.fixture.settingsRevision = applied.settingsRevision;
    await expect(run.fixture.service.continueAfterAppliedFlowAdaptation({
      ...continuation(run.grant.grantId),
      expectedPreviousBinding: { ...previous, settingsRevision: 6 }
    })).rejects.toMatchObject({ code: "llm.execution_grant_no_longer_valid" });

    run = await claimedHeldGrant();
    run.fixture.executionDigest = "execution-digest.authoritative";
    run.fixture.settingsRevision = 9;
    await expect(run.fixture.service.continueAfterAppliedFlowAdaptation(continuation(run.grant.grantId)))
      .rejects.toMatchObject({ code: "llm.execution_grant_no_longer_valid" });
  });

  it("revalidates the actor session and exact key before advancing", async () => {
    let run = await claimedHeldGrant();
    run.fixture.executionDigest = applied.executionDigest;
    run.fixture.settingsRevision = applied.settingsRevision;
    run.fixture.sessionValid = false;
    await expect(run.fixture.service.continueAfterAppliedFlowAdaptation(continuation(run.grant.grantId)))
      .rejects.toMatchObject({ code: "llm.execution_grant_no_longer_valid" });

    run = await claimedHeldGrant();
    run.fixture.executionDigest = applied.executionDigest;
    run.fixture.settingsRevision = applied.settingsRevision;
    run.fixture.key.updatedAtMs += 1;
    await expect(run.fixture.service.continueAfterAppliedFlowAdaptation(continuation(run.grant.grantId)))
      .rejects.toMatchObject({ code: "llm.execution_grant_no_longer_valid" });
  });

  it("fails closed for malformed inputs, dependency failures, and every incompatible key identity", async () => {
    let run = await claimedHeldGrant();
    await expect(run.fixture.service.continueAfterAppliedFlowAdaptation({ ...continuation(run.grant.grantId), purpose: "invented" as never }))
      .rejects.toMatchObject({ code: "llm.execution_grant_no_longer_valid" });
    expect(run.fixture.service.activeGrantCount()).toBe(0);

    for (const malformed of [
      { expectedPreviousBinding: { ...previous, executionDigest: "" } },
      { appliedBinding: { ...applied, settingsRevision: -1 } }
    ]) {
      run = await claimedHeldGrant();
      await expect(run.fixture.service.continueAfterAppliedFlowAdaptation({ ...continuation(run.grant.grantId), ...malformed } as never))
        .rejects.toMatchObject({ code: "llm.execution_grant_no_longer_valid" });
      expect(run.fixture.service.activeGrantCount()).toBe(0);
    }

    run = await claimedHeldGrant();
    (run.fixture.service as any).options.resolveExecutionDigest = async () => { throw new Error("dependency unavailable"); };
    await expect(run.fixture.service.continueAfterAppliedFlowAdaptation(continuation(run.grant.grantId)))
      .rejects.toMatchObject({ code: "llm.execution_grant_no_longer_valid" });
    expect(run.fixture.service.activeGrantCount()).toBe(0);

    const incompatibleKeys: Array<(key: any) => void> = [
      (key) => { key.id = "secret:other"; },
      (key) => { key.enabled = false; },
      (key) => { key.kind = "other"; },
      (key) => { key.updatedAtMs += 1; },
      (key) => { key.provider = "other"; },
      (key) => { key.metadata.model = "other"; },
      (key) => { key.scopeRef = "flow.other"; }
    ];
    for (const invalidate of incompatibleKeys) {
      run = await claimedHeldGrant();
      run.fixture.executionDigest = applied.executionDigest;
      run.fixture.settingsRevision = applied.settingsRevision;
      invalidate(run.fixture.key);
      await expect(run.fixture.service.continueAfterAppliedFlowAdaptation(continuation(run.grant.grantId)))
        .rejects.toMatchObject({ code: "llm.execution_grant_no_longer_valid" });
      expect(run.fixture.service.activeGrantCount()).toBe(0);
    }
  });

  it("loses the CAS when the grant is revoked, expires, starts a call, or changes binding during dependency reads", async () => {
    let run = await claimedHeldGrant();
    let gate = pauseNextBindingRead(run.fixture);
    let pending = run.fixture.service.continueAfterAppliedFlowAdaptation(continuation(run.grant.grantId));
    await gate.started;
    run.fixture.service.revoke(run.grant.grantId);
    gate.release();
    await expect(pending).rejects.toMatchObject({ code: "llm.execution_grant_unavailable" });

    run = await claimedHeldGrant();
    gate = pauseNextBindingRead(run.fixture);
    pending = run.fixture.service.continueAfterAppliedFlowAdaptation(continuation(run.grant.grantId));
    await gate.started;
    run.fixture.now = stored(run.fixture).runExpiresAtMs;
    gate.release();
    await expect(pending).rejects.toMatchObject({ code: "llm.execution_grant_unavailable" });

    run = await claimedHeldGrant();
    gate = pauseNextBindingRead(run.fixture);
    pending = run.fixture.service.continueAfterAppliedFlowAdaptation(continuation(run.grant.grantId));
    await gate.started;
    run.fixture.delayProvider = true;
    const call = run.resolved.provider.runTask({ ...request(), maxEstimatedCostUsd: 0.1 });
    await run.fixture.providerStarted;
    gate.release();
    await expect(pending).rejects.toMatchObject({ code: "llm.execution_grant_unavailable" });
    await expect(call).rejects.toBeDefined();

    run = await claimedHeldGrant();
    gate = pauseNextBindingRead(run.fixture);
    pending = run.fixture.service.continueAfterAppliedFlowAdaptation(continuation(run.grant.grantId));
    await gate.started;
    stored(run.fixture).executionDigest = "execution-digest.concurrent-winner";
    gate.release();
    await expect(pending).rejects.toMatchObject({ code: "llm.execution_grant_no_longer_valid" });
    expect(run.fixture.service.activeGrantCount()).toBe(0);
  });

  it("does not allow an old transition to be replayed", async () => {
    const { fixture, grant } = await claimedHeldGrant();
    fixture.executionDigest = applied.executionDigest;
    fixture.settingsRevision = applied.settingsRevision;
    await fixture.service.continueAfterAppliedFlowAdaptation(continuation(grant.grantId));
    await expect(fixture.service.continueAfterAppliedFlowAdaptation(continuation(grant.grantId)))
      .rejects.toMatchObject({ code: "llm.execution_grant_no_longer_valid" });
    expect(fixture.service.activeGrantCount()).toBe(0);
  });

  it("leaves ordinary untrusted binding drift on the existing no-longer-valid path", async () => {
    const { fixture, grant } = await claimedHeldGrant();
    fixture.executionDigest = applied.executionDigest;
    fixture.settingsRevision = applied.settingsRevision;
    await expect(fixture.service.resolve(scope(grant.grantId))).rejects.toMatchObject({ code: "llm.execution_grant_no_longer_valid" });
    expect(fixture.service.activeGrantCount()).toBe(0);
  });
});
