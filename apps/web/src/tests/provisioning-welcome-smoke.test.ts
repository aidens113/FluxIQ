import { randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { submitWelcome } from "../app/welcome/server";
import { createAccountLinkHarness } from "../app/welcome/server/tests/accountLinkHarness";
import { startProvisioningListener } from "../server/provisioning-listener";
import { postToListener } from "../server/provisioning-listener/tests/listener-fixture";

// Lane B1's local smoke (hosted production plan, Phases, "Lane validation"):
// the private listener on loopback provisions an account, the emailed welcome
// link sets its password and signs the person in, and the password then signs
// in as a normal login does. Real platform, identity and secret-key services
// over memory repositories; the token and password are per-run dummies and are
// never printed.

describe("provisioning to welcome to sign-in", () => {
  it("provisions over the listener, redeems the welcome link and signs in", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "fluxiq-b1-smoke-"));
    const tokenFile = path.join(directory, "provisioning-token");
    const token = randomBytes(32).toString("base64url");
    await writeFile(tokenFile, `${token}\n`, "utf8");
    const harness = await createAccountLinkHarness();
    const handle = await startProvisioningListener({ host: "127.0.0.1", port: 0, tokenFile, reservedPorts: [], getServices: async () => harness.services, log: () => undefined });
    try {
      const created = await postToListener(handle, "createAccount", { requestId: "smoke-1", email: "smoke@example.test", displayName: "Smoke", policies: ["FluxIQUserAccess"], workspace: "new", sendWelcome: true }, { token });
      expect(created.status).toBe(200);
      const answer = created.json as { ok: boolean; result: { status: string; userId: string } };
      expect(answer.ok).toBe(true);
      expect(answer.result.status).toBe("created");

      const welcomeToken = harness.latestToken("welcomeUrl");
      const password = `smoke-${randomBytes(12).toString("hex")}`;
      const request = new Request("https://app.example.test/welcome/submit", { method: "POST", headers: { "content-type": "application/json", origin: "https://app.example.test" }, body: JSON.stringify({ token: welcomeToken, password }) });
      const welcomed = await submitWelcome(request, { links: harness.services.links, provisioning: harness.services.provisioning, identityAccess: harness.identityAccess, secretKeys: harness.secretKeys });
      expect(welcomed.status).toBe(200);
      expect((await harness.identityAccess.validateSession(welcomed.session?.id))?.user.id).toBe(answer.result.userId);

      const signedIn = await harness.identityAccess.authenticate({ username: "smoke@example.test", password });
      expect(signedIn.user.id).toBe(answer.result.userId);
      const account = await harness.services.store.getAccount(answer.result.userId);
      expect(account?.emailVerifiedAtMs).not.toBeNull();
    } finally {
      await handle.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
