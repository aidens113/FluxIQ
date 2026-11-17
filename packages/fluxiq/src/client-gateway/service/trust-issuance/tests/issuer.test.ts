// @fluxiq-test-group real-sql
import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClientGatewayService } from "../../../index.ts";
import type { ClientGatewayCredentialCustody } from "../../credential-custody.ts";
import { issuerFixture } from "./fixture.ts";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

describe("authenticated trust issuance before a socket exists", () => {
  it("saves route and installation evidence before mandatory delivery, then authenticates the correct client", async () => {
    const f = await issuerFixture(cleanups);
    f.grantCredential.mockImplementationOnce(async (grant) => {
      expect(f.gateway.snapshot().sessions).toEqual([]);
      expect(await f.repository.lookupCredential(grant.credential)).toMatchObject({ status: "current", binding: { workspaceId: "workspace.synthetic", approvedByUserId: f.input.approvedByUserId, clientId: f.input.clientId } });
    });
    const issued = await f.gateway.trust.issue(f.input);
    expect(f.validateApproval).toHaveBeenCalledTimes(2);
    expect(f.grantCredential).toHaveBeenCalledWith({ credential: issued.credential, trustedClientId: issued.trustedClientId, userId: f.input.approvedByUserId, approvingSessionDigest: f.sessionDigest, expiresAt: issued.credentialExpiresAt });
    expect(f.saved[0]![0]).toMatchObject({ clientInstallId: f.input.clientInstallId, approvingSessionDigest: f.sessionDigest });
    expect(f.gateway.snapshot().trustedClients[0]).not.toHaveProperty("approvingSessionDigest");
    expect(JSON.stringify(f.gateway.snapshot())).not.toContain(issued.credential);
    expect((await readFile(f.filePath)).includes(Buffer.from(issued.credential))).toBe(false);
    expect((await f.hello(issued.credential)).status).toBe("ready");
  });

  it.each([
    { clientId: "different-client" },
    { clientType: "custom" as const },
    { domainId: "different-domain" }
  ])("refuses a credential presented by a different declared client: %j", async (change) => {
    const f = await issuerFixture(cleanups);
    const issued = await f.gateway.trust.issue(f.input);
    expect((await f.hello(issued.credential, change)).status).toBe("pairing_required");
    expect(await f.repository.lookupCredential(issued.credential)).toMatchObject({ status: "current" });
  });

  it("survives restart with the existing credential scheme and private installation/session metadata", async () => {
    const f = await issuerFixture(cleanups);
    const issued = await f.gateway.trust.issue(f.input);
    await f.gateway.close();
    const restarted = f.createGateway();
    await restarted.ready();
    expect(restarted.snapshot().trustedClients).toMatchObject([{ trustedClientId: issued.trustedClientId, clientInstallId: f.input.clientInstallId }]);
    expect(restarted.snapshot().trustedClients[0]).not.toHaveProperty("approvingSessionDigest");
    expect(await f.repository.lookupCredential(issued.credential)).toMatchObject({ status: "current" });
  });

  it("fails closed without mandatory persistence or trusted authority", async () => {
    const f = await issuerFixture(cleanups);
    for (const gateway of [new ClientGatewayService({ trustedClientStore: { load: async () => [], save: async () => undefined } }), new ClientGatewayService({ trustAuthority: f.authority })]) {
      cleanups.push(() => gateway.close());
      await expect(gateway.trust.issue(f.input)).rejects.toMatchObject({ reason: "unavailable" });
      expect(gateway.snapshot().trustedClients).toEqual([]);
    }
    expect(f.grantCredential).not.toHaveBeenCalled();
  });

  it("refuses a currently ineligible authority without persisting or delivering trust", async () => {
    const f = await issuerFixture(cleanups);
    f.state.allowed = false;
    await expect(f.gateway.trust.issue(f.input)).rejects.toMatchObject({ reason: "approval_refused" });
    expect(f.saved).toEqual([]);
    expect(f.grantCredential).not.toHaveBeenCalled();
  });

  it("rechecks queued consent against authority revoked before its mutation can start", async () => {
    const f = await issuerFixture(cleanups);
    let started: (() => void) | undefined;
    let release: (() => void) | undefined;
    const validating = new Promise<void>((resolve) => { started = resolve; });
    const waiting = new Promise<void>((resolve) => { release = resolve; });
    f.validateApproval.mockImplementationOnce(async () => {
      started!();
      await waiting;
      return null;
    });
    const first = f.gateway.trust.issue(f.input).catch((error: unknown) => error);
    await validating;
    const second = f.gateway.trust.issue({ ...f.input, clientInstallId: "queued-install" }).catch((error: unknown) => error);
    f.state.allowed = false;
    release!();
    expect(await first).toMatchObject({ reason: "approval_refused" });
    expect(await second).toMatchObject({ reason: "approval_refused" });
    expect(f.saved).toEqual([]);
    expect(f.grantCredential).not.toHaveBeenCalled();
  });

  it("does not accept another user's session or a raw session identifier as approval evidence", async () => {
    const f = await issuerFixture(cleanups);
    await expect(f.gateway.trust.issue({ ...f.input, approvedByUserId: "user.other" })).rejects.toMatchObject({ reason: "approval_refused" });
    await expect(f.gateway.trust.issue({ ...f.input, approvingSessionDigest: "synthetic-raw-session" })).rejects.toMatchObject({ reason: "invalid_input" });
    expect(f.saved).toEqual([]);
    expect(f.grantCredential).not.toHaveBeenCalled();
  });

  it("rolls back failed persistence and never calls the mandatory credential delivery port", async () => {
    const f = await issuerFixture(cleanups);
    f.state.failSave = true;
    const failure = await f.gateway.trust.issue(f.input).catch((error: unknown) => error);
    expect(failure).toMatchObject({ reason: "persistence_failed" });
    expect(String(failure)).not.toContain("synthetic-write-failed-with-private-detail");
    expect(failure).not.toHaveProperty("cause");
    expect(f.gateway.snapshot().trustedClients).toEqual([]);
    expect(f.grantCredential).not.toHaveBeenCalled();
  });

  it("reports an unavailable authority without leaking its exception or pretending consent was denied", async () => {
    const f = await issuerFixture(cleanups);
    f.validateApproval.mockRejectedValueOnce(new Error("synthetic-private-authority-detail"));
    const failure = await f.gateway.trust.issue(f.input).catch((error: unknown) => error);
    expect(failure).toMatchObject({ reason: "unavailable" });
    expect(String(failure)).not.toContain("synthetic-private-authority-detail");
    expect(f.saved).toEqual([]);
    expect(f.grantCredential).not.toHaveBeenCalled();
  });

  it("revokes a saved grant when mandatory delivery fails, without substituting best-effort custody", async () => {
    const f = await issuerFixture(cleanups);
    let deliveredCredential = "";
    f.grantCredential.mockImplementationOnce(async ({ credential }) => {
      deliveredCredential = credential;
      throw new Error("synthetic-sensitive-delivery-failure");
    });
    const failure = await f.gateway.trust.issue(f.input).catch((error: unknown) => error);
    expect(failure).toMatchObject({ reason: "delivery_failed" });
    expect(String(failure)).not.toContain("synthetic-sensitive-delivery-failure");
    expect(failure).not.toHaveProperty("cause");
    expect(await f.repository.lookupCredential(deliveredCredential)).toMatchObject({ status: "inactive", reason: "revoked" });
    expect(f.grantCredential).toHaveBeenCalledTimes(1);
    expect((await f.hello(deliveredCredential)).status).toBe("pairing_required");
  });

  it("rechecks current authority after strict delivery and revokes when it ended while waiting", async () => {
    const f = await issuerFixture(cleanups);
    let deliveredCredential = "";
    f.grantCredential.mockImplementationOnce(async ({ credential }) => {
      deliveredCredential = credential;
      f.state.allowed = false;
    });
    await expect(f.gateway.trust.issue(f.input)).rejects.toMatchObject({ reason: "approval_refused" });
    expect(await f.repository.lookupCredential(deliveredCredential)).toMatchObject({ status: "inactive", reason: "revoked" });
  });
});

describe("atomic installation replacement and owner limits", () => {
  it("admits exactly the configured limit under eight concurrent issuances", async () => {
    const f = await issuerFixture(cleanups);
    f.state.maxActiveClients = 2;
    const outcomes = await Promise.allSettled(Array.from({ length: 8 }, (_, index) => f.gateway.trust.issue({ ...f.input, clientInstallId: `synthetic-install-${index}` })));
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(2);
    for (const outcome of outcomes) if (outcome.status === "rejected") expect(outcome.reason).toMatchObject({ reason: "client_limit_reached" });
    expect(f.gateway.snapshot().trustedClients.filter((client) => client.status === "active")).toHaveLength(2);
    expect(f.grantCredential).toHaveBeenCalledTimes(2);
  });

  it("replaces only the same owner's installation in one write, preserving another install and another user", async () => {
    const f = await issuerFixture(cleanups);
    const first = await f.gateway.trust.issue(f.input);
    const otherInstall = await f.gateway.trust.issue({ ...f.input, clientInstallId: "synthetic-other-install" });
    const otherDigest = "b".repeat(64);
    f.sessionOwners.set(otherDigest, "user.other");
    const otherOwner = await f.gateway.trust.issue({ ...f.input, approvedByUserId: "user.other", approvingSessionDigest: otherDigest });
    f.state.maxActiveClients = 2;
    await f.hello(first.credential);
    const savesBefore = f.saved.length;
    const replacement = await f.gateway.trust.issue({ ...f.input, domainId: "changed-domain" });
    expect(f.saved.length).toBe(savesBefore + 1);
    expect(await f.repository.lookupCredential(first.credential)).toMatchObject({ status: "inactive", reason: "revoked" });
    for (const credential of [otherInstall.credential, otherOwner.credential, replacement.credential]) expect(await f.repository.lookupCredential(credential)).toMatchObject({ status: "current" });
    expect(f.gateway.snapshot().sessions.filter((session) => session.trustedClientId === first.trustedClientId).every((session) => session.status === "disconnected")).toBe(true);
  });

  it("restores both prior trust and its credential index when replacement persistence fails", async () => {
    const f = await issuerFixture(cleanups);
    const first = await f.gateway.trust.issue(f.input);
    f.state.failSave = true;
    await expect(f.gateway.trust.issue(f.input)).rejects.toMatchObject({ reason: "persistence_failed" });
    expect(f.gateway.snapshot().trustedClients).toMatchObject([{ trustedClientId: first.trustedClientId, status: "active" }]);
    expect(await f.repository.lookupCredential(first.credential)).toMatchObject({ status: "current" });
    f.state.failSave = false;
    expect((await f.hello(first.credential)).status).toBe("ready");
    expect(f.grantCredential).toHaveBeenCalledTimes(1);
  });

  it("ends the replaced live session even when its socket refuses the disconnect notice", async () => {
    const f = await issuerFixture(cleanups);
    const first = await f.gateway.trust.issue(f.input);
    const session = await f.hello(first.credential, {}, { send: async (raw) => {
      if (JSON.parse(raw).type === "server.disconnect") throw new Error("synthetic-sensitive-socket-detail");
    } });
    const replacement = await f.gateway.trust.issue(f.input);
    expect(f.gateway.snapshot().sessions.find((candidate) => candidate.sessionId === session.sessionId)?.status).toBe("disconnected");
    expect(await f.repository.lookupCredential(replacement.credential)).toMatchObject({ status: "current" });
    const audit = f.gateway.snapshot().auditLog;
    expect(audit.some((entry) => entry.type === "trust.disconnect_notice_failed")).toBe(true);
    expect(JSON.stringify(audit)).not.toContain("synthetic-sensitive-socket-detail");
  });

  it("refuses a stale independent gateway through durable CAS without overwriting the current owner", async () => {
    const f = await issuerFixture(cleanups);
    const stale = f.createGateway();
    await stale.ready();
    const first = await f.gateway.trust.issue(f.input);
    await expect(stale.trust.issue({ ...f.input, clientInstallId: "different-install" })).rejects.toMatchObject({ reason: "persistence_failed" });
    expect(stale.snapshot().trustedClients).toEqual([]);
    expect(await f.repository.lookupCredential(first.credential)).toMatchObject({ status: "current" });
    expect(f.grantCredential).toHaveBeenCalledTimes(1);
  });

  it("does not publish an issuance another consent replaced while its mandatory delivery waited", async () => {
    const f = await issuerFixture(cleanups);
    let started: (() => void) | undefined;
    let release: (() => void) | undefined;
    const delivering = new Promise<void>((resolve) => { started = resolve; });
    const waiting = new Promise<void>((resolve) => { release = resolve; });
    f.grantCredential.mockImplementationOnce(async () => {
      started!();
      await waiting;
    });
    const first = f.gateway.trust.issue(f.input).catch((error: unknown) => error);
    await delivering;
    let replacement: Awaited<typeof first>;
    try {
      replacement = await f.gateway.trust.issue(f.input);
    } finally {
      release!();
    }
    expect(await first).toMatchObject({ reason: "trust_ended" });
    expect(replacement).toHaveProperty("credential");
    expect(f.gateway.snapshot().trustedClients.filter((client) => client.status === "active")).toHaveLength(1);
  });

  it("never forwards a raw or another user's session to informational custody", async () => {
    const f = await issuerFixture(cleanups);
    const issued = vi.fn<ClientGatewayCredentialCustody["issued"]>(async () => undefined);
    const gateway = f.createGateway({ credentialCustody: { issued, confirmed: async () => undefined, rotating: async () => undefined, presented: async () => undefined, released: () => undefined, forgotten: async () => undefined } });
    await gateway.trust.issue(f.input);
    expect(issued).toHaveBeenCalledWith(expect.objectContaining({ holder: expect.objectContaining({ userId: f.input.approvedByUserId }), approvedBySessionDigest: f.sessionDigest }));
    expect(issued.mock.calls[0]![0]).not.toHaveProperty("approvedBySessionId");
  });
});
