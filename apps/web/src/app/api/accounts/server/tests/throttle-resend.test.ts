import { describe, expect, it } from "vitest";
import { changeMember } from "../change-member";
import { inviteMember } from "../invite-member";
import { toAccountsHttp } from "../to-accounts-http";
import { createAccountsHarness, DUMMY_PASSWORD, type AccountsHarness } from "./accounts-harness";

const PROOF = { password: DUMMY_PASSWORD };

async function invite(harness: AccountsHarness, email: string): Promise<string> {
  const answer = await inviteMember(await harness.deps(harness.admin), { email, displayName: "Invited", role: "read-only", proof: PROOF });
  if (answer.status !== 200) throw new Error(`invite failed: ${answer.status}`);
  return (answer.body as { payload: { userId: string } }).payload.userId;
}

describe("resending an invite", () => {
  it("sends three links per administrator and person, then refuses with retry-after and sends nothing", async () => {
    const harness = await createAccountsHarness();
    const userId = await invite(harness, "flooded@example.test");
    const deps = await harness.deps(harness.admin);
    for (let sent = 0; sent < 3; sent += 1) expect((await changeMember(deps, { action: "resend-invite", userId })).status).toBe(200);
    const mailed = harness.email.messages.length;
    const refused = await changeMember(deps, { action: "resend-invite", userId });
    expect(refused).toMatchObject({ status: 429, body: { ok: false, code: "rate_limited" } });
    expect(Number(refused.headers?.["retry-after"])).toBeGreaterThan(0);
    expect(harness.email.messages).toHaveLength(mailed);
    const http = toAccountsHttp(refused);
    expect([http.status, Number(http.headers.get("retry-after")) > 0, http.headers.get("cache-control")]).toEqual([429, true, "no-store"]);
  });

  it("limits each person separately, and spends nothing on a refused resend", async () => {
    const harness = await createAccountsHarness();
    const first = await invite(harness, "first@example.test");
    const second = await invite(harness, "second@example.test");
    const deps = await harness.deps(harness.admin);
    for (let sent = 0; sent < 3; sent += 1) await changeMember(deps, { action: "resend-invite", userId: first });
    expect((await changeMember(deps, { action: "resend-invite", userId: second })).status).toBe(200);
    // A viewer's resend is refused by IAM before the limit is counted.
    for (let tried = 0; tried < 5; tried += 1) expect((await changeMember(await harness.deps(harness.viewer), { action: "resend-invite", userId: second })).status).toBe(403);
    expect((await changeMember(deps, { action: "resend-invite", userId: second })).status).toBe(200);
  });
});
