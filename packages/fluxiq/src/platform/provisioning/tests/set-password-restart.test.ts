import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inProcessAccountsTransport, runAccountsCommand } from "../cli/index.ts";
import { cliTestIo } from "../cli/tests/cli-test-io.ts";
import type { PlatformProvisioningCaller } from "../types.ts";
import { accountWithPassword, boot, captureConsole, EMAIL, enableTwoFactor, NEW_PASSWORD, OLD_PASSWORD, restartRows, signsInWith, type RestartRows, type RestartServer } from "./restart-fixture.ts";

// The `setPassword` operation across a simulated restart, with the real
// identity-access service (`restart-fixture.ts`). The offline command line
// always starts a new process, so every credential it meets is sealed: the
// operator's reset must set the password with no recheck of the old one, by
// the privileged path, under the same two-factor rule and audit as a link.
// The private listener never takes a password (`http: false`), so over HTTP
// it stays `operation_unavailable`, after a restart too.

const OPERATOR: PlatformProvisioningCaller = { kind: "platform-admin", transport: "in-process" };
const PROVISIONER: PlatformProvisioningCaller = { kind: "service-identity", name: "website-backend", transport: "in-process" };

let logged: string[] = [];

beforeEach(() => {
  logged = captureConsole();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** An account with a sealed password and two sessions, then a restart. */
async function restartedWithAccount(twoFactor = false): Promise<{ shared: RestartRows; server: RestartServer; userId: string }> {
  const shared = restartRows();
  const before = await boot(shared);
  const userId = await accountWithPassword(before, false);
  if (twoFactor) await enableTwoFactor(before, userId);
  await before.identity.createSession(userId);
  await before.identity.createSession(userId);
  return { shared, server: await boot(shared), userId };
}

function sessionsOf(server: RestartServer, userId: string): Promise<number> {
  return server.identity.snapshot().then((snapshot) => snapshot.sessions.filter((session) => session.userId === userId).length);
}

function expectNoPasswordOutside(shared: RestartRows): void {
  const outside = JSON.stringify([logged, shared.audit.records, shared.platform.snapshot(), shared.identity.snapshot()]);
  for (const secret of [OLD_PASSWORD, NEW_PASSWORD]) expect(outside).not.toContain(secret);
}

describe("setPassword across a restart", () => {
  it("the offline operator command sets the password on a sealed credential and revokes the sessions", async () => {
    const { shared, server, userId } = await restartedWithAccount();
    await expect(server.identity.setPassword(userId, NEW_PASSWORD)).rejects.toThrow("Credential recheck required");
    const io = cliTestIo({ stdin: `${NEW_PASSWORD}\n` });

    const code = await runAccountsCommand(["accounts", "setPassword", "--user-id", userId, "--password-stdin"], io, inProcessAccountsTransport(server.services.provisioning));

    expect(code).toBe(0);
    expect(JSON.parse(io.out.join(""))).toEqual({ ok: true, result: { status: "updated", sessionsRevoked: 2 } });
    expect(await sessionsOf(server, userId)).toBe(0);
    expect(await signsInWith(server, NEW_PASSWORD)).toBe(true);
    expect(await signsInWith(server, OLD_PASSWORD)).toBe(false);
    expect(await signsInWith(await boot(shared), NEW_PASSWORD)).toBe(true);
    const decisions = shared.audit.records.filter((record) => record.action === "platform:SetAccountPassword");
    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({ category: "allow", decision: "allow", resources: [`frn:fluxiq:platform::account/${userId}`], matched: { policy: "platform-admin", sid: null }, origin: "cli" });
    expect(io.out.join("") + io.err.join("")).not.toContain(NEW_PASSWORD);
    expectNoPasswordOutside(shared);
  });

  it("the provisioner service identity in-process sets it the same way, decided and audited by IAM", async () => {
    const { shared, server, userId } = await restartedWithAccount();

    const answer = await server.services.provisioning.run("setPassword", { requestId: "p1", userId, password: NEW_PASSWORD }, PROVISIONER);

    expect(answer).toEqual({ ok: true, result: { status: "updated", sessionsRevoked: 2 } });
    expect(await signsInWith(server, NEW_PASSWORD)).toBe(true);
    expect(await signsInWith(server, OLD_PASSWORD)).toBe(false);
    const decisions = shared.audit.records.filter((record) => record.action === "platform:SetAccountPassword");
    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({ decision: "allow", resources: [`frn:fluxiq:platform::account/${userId}`], matched: { policy: "FluxIQProvisioner" }, origin: "provisioning" });
    expectNoPasswordOutside(shared);
  });

  it("over the listener (HTTP) setPassword stays unavailable after a restart and changes nothing", async () => {
    const { shared, server, userId } = await restartedWithAccount();

    const answer = await server.services.provisioning.run("setPassword", { requestId: "p1", userId, password: NEW_PASSWORD }, server.services.provisionerCaller("10.1.2.3"));

    expect(answer.ok === false && answer.error.code).toBe("operation_unavailable");
    expect(await sessionsOf(server, userId)).toBe(2);
    expect(await signsInWith(server, OLD_PASSWORD)).toBe(true);
    expect(await signsInWith(server, NEW_PASSWORD)).toBe(false);
    expectNoPasswordOutside(shared);
  });

  it("refuses a sealed account with two-factor sign-in as two_factor for both callers, changing nothing", async () => {
    const { shared, server, userId } = await restartedWithAccount(true);
    const rowsBefore = JSON.stringify(shared.identity.snapshot());

    for (const [requestId, caller] of [["p1", OPERATOR], ["p2", PROVISIONER]] as const) {
      const answer = await server.services.provisioning.run("setPassword", { requestId, userId, password: NEW_PASSWORD }, caller);
      expect(answer).toEqual({ ok: false, error: { code: "two_factor", message: "The account uses two-factor sign-in; a signed-in administrator must reset its password." } });
    }

    expect(JSON.stringify(shared.identity.snapshot())).toBe(rowsBefore);
    expect(await sessionsOf(server, userId)).toBe(2);
    expect((await server.identity.authenticate({ username: EMAIL, password: OLD_PASSWORD })).user.totpEnabled).toBe(true);
    expect(await signsInWith(server, NEW_PASSWORD)).toBe(false);
    expectNoPasswordOutside(shared);
  });
});
