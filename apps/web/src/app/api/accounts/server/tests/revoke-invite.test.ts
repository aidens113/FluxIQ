import type { PlatformProvisioning, PlatformProvisioningCaller } from "fluxiq/platform";
import { describe, expect, it } from "vitest";
import { changeMember } from "../change-member";
import { inviteMember } from "../invite-member";
import type { AccountRouteDeps } from "../route-deps";
import { createAccountsHarness, DUMMY_PASSWORD, type AccountsHarness } from "./accounts-harness";

// Cancelling an invite while its person accepts it: the acceptance must win
// whenever it lands before the cancellation takes hold, and must be refused
// once it has. The race is staged by running the acceptance from inside the
// provisioning call that would otherwise have lost it.

const PROOF = { password: DUMMY_PASSWORD };
const NEW_PASSWORD = "the invited person's own dummy password";

async function invite(harness: AccountsHarness): Promise<{ userId: string; token: string }> {
  const answer = await inviteMember(await harness.deps(harness.admin), { email: "racing@example.test", displayName: "Racing", role: "read-only", proof: PROOF });
  if (answer.status !== 200) throw new Error(`invite failed: ${answer.status}`);
  const url = harness.email.messages.at(-1)?.variables.welcomeUrl;
  const token = new URLSearchParams(new URL(String(url)).hash.slice(1)).get("token");
  if (!token) throw new Error("the invite carried no link");
  return { userId: (answer.body as { payload: { userId: string } }).payload.userId, token };
}

type Step = (operation: string, run: () => ReturnType<PlatformProvisioning["run"]>) => ReturnType<PlatformProvisioning["run"]>;

/** The administrator's dependencies, with `step` wrapped around every provisioning call. */
async function adminWith(harness: AccountsHarness, step: Step): Promise<AccountRouteDeps> {
  const deps = await harness.deps(harness.admin);
  const platform = await deps.platform();
  const run = (operation: Parameters<PlatformProvisioning["run"]>[0], input: unknown, caller: PlatformProvisioningCaller) => step(operation, () => platform.provisioning.run(operation, input, caller));
  const provisioning = { run } as unknown as PlatformProvisioning;
  return { ...deps, platform: async () => ({ ...platform, provisioning }) };
}

describe("cancelling an invite", () => {
  it("keeps the account of a person who accepted just before the cancellation took hold, and says so", async () => {
    const harness = await createAccountsHarness();
    const { userId, token } = await invite(harness);
    let redeemed: unknown;
    const deps = await adminWith(harness, async (operation, run) => {
      if (operation === "disableAccount" && redeemed === undefined) redeemed = await harness.services.links.redeemWelcome({ token, password: NEW_PASSWORD });
      return run();
    });
    const answer = await changeMember(deps, { action: "revoke-invite", userId, proof: PROOF });
    expect(redeemed).toMatchObject({ ok: true });
    expect(answer).toEqual({ status: 409, body: { ok: false, code: "not_invited", error: "This person has already accepted their invite." } });
    expect(await harness.services.store.getAccount(userId)).toMatchObject({ status: "active" });
    expect((await harness.identityAccess.snapshot()).users.find((user) => user.id === userId)?.enabled).toBe(true);
  });

  it("refuses an acceptance once the cancellation has taken hold, then deletes the account", async () => {
    const harness = await createAccountsHarness();
    const { userId, token } = await invite(harness);
    let redeemed: unknown;
    const deps = await adminWith(harness, async (operation, run) => {
      const answer = await run();
      if (operation === "disableAccount") redeemed = await harness.services.links.redeemWelcome({ token, password: NEW_PASSWORD });
      return answer;
    });
    expect(await changeMember(deps, { action: "revoke-invite", userId, proof: PROOF })).toEqual({ status: 200, body: { ok: true } });
    expect(redeemed).toEqual({ ok: false, code: "disabled" });
    expect(await harness.services.store.getAccount(userId)).toBeNull();
    expect(await harness.services.links.redeemWelcome({ token, password: NEW_PASSWORD })).toEqual({ ok: false, code: "invalid_link" });
  });

  it("turns the account back on and answers the refusal when the delete is refused", async () => {
    const harness = await createAccountsHarness();
    const { userId } = await invite(harness);
    const deps = await adminWith(harness, async (operation, run) =>
      operation === "deleteAccount" ? ({ ok: false, error: { code: "last_administrator", message: "refused in the test" } } as Awaited<ReturnType<typeof run>>) : run()
    );
    const answer = await changeMember(deps, { action: "revoke-invite", userId, proof: PROOF });
    expect(answer).toMatchObject({ status: 409, body: { code: "last_administrator" } });
    expect(await harness.services.store.getAccount(userId)).toMatchObject({ status: "active" });
  });
});
