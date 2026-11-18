import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { DriverContext, PlatformDriver } from "../../drivers/index.ts";
import type { CloudPlan } from "../../plan/index.ts";
import { checkRestart, checkTeardown, checkWebhook } from "../check/index.ts";
import { ensureUp } from "../ensure-up.ts";
import { expectStatus } from "../expect-status.ts";
import { waitForMailText } from "../mailpit-inbox.ts";
import { runOneShot } from "../one-shot-container.ts";
import { pinnedHttps } from "../pinned-https.ts";
import { secretFile } from "../secret-file.ts";
import type { SmokeStep } from "../smoke-step.ts";
import { SMOKE_SCRIPTS } from "../smoke-scripts.ts";

type Account = { email: string; secret: string; session: string[] };

/**
 * The JSON body of the panel's sign-in posts (`/welcome/submit`,
 * `/api/auth/login`): the given fields plus the secret, under the panel's
 * own field name for it, written as JSON text.
 */
function signInBody(fields: Readonly<Record<string, string>>, secret: string): string {
  const named = Object.entries(fields).map(([name, value]) => `${JSON.stringify(name)}:${JSON.stringify(value)}`);
  return `{${[...named, `"password":${JSON.stringify(secret)}`].join(",")}}`;
}

type ProvisionAnswer = { status: number; body: { ok?: boolean; result?: { status?: string; userId?: string; workspaceId?: string }; error?: { code?: string; message?: string; fields?: unknown } } | null };

/**
 * The end-to-end check of a hosted service's local rehearsal, from outside as
 * a customer and a sign-up site would see it: two accounts are created
 * through the private provisioning listener from a one-shot container on its
 * network; their welcome emails are read from Mailpit; both set a password
 * and sign in over TLS pinned to the exported certificate; each sees only
 * itself in its own workspace; the payments API answers; the billing webhook
 * is checked three ways (checkWebhook); the stack goes down with its data
 * kept and comes back with both accounts still signing in; and a final
 * `down` leaves no labelled container, network, volume or image. Any failed
 * check throws with what it observed; the stack is then left up for a look,
 * and `fluxiq-cloud down` removes it.
 */
export async function runServiceSmoke(plan: CloudPlan, driver: PlatformDriver, context: DriverContext): Promise<SmokeStep[]> {
  if (plan.mailUi === null || plan.exportedCa === null) throw new Error("smoke runs against a local rehearsal: it needs sinks.mail on and tls.mode \"internal\".");
  const steps: SmokeStep[] = [];
  const pass = (name: string, detail: string) => {
    steps.push({ name, detail });
    context.log(`  ok  ${name}: ${detail}`);
  };
  await ensureUp(plan, driver, context);
  const https = pinnedHttps(plan.publicOrigin, await readFile(plan.exportedCa, "utf8"));
  const health = await https({ method: "GET", path: "/api/health" });
  expectStatus(health, 200, "GET /api/health over TLS");
  pass("tls", `${plan.publicOrigin}/api/health answered 200 with the certificate pinned to the exported local root`);

  const run = randomBytes(4).toString("hex");
  const accounts: Account[] = ["a", "b"].map((name) => ({ email: `smoke-${run}-${name}@example.test`, secret: randomBytes(18).toString("base64url"), session: [] }));
  await provision(plan, context, accounts);
  pass("sign-up", `created ${accounts.map((account) => account.email).join(" and ")} through the provisioning listener from a one-shot container on ${plan.networks.provisioning}`);

  for (const account of accounts) {
    const text = await waitForMailText(plan.mailUi, account.email, context.sleep);
    const link = /(https:\/\/\S+)\/welcome#token=([A-Za-z0-9_-]+)/u.exec(text);
    if (link === null) throw new Error(`The email to ${account.email} has no welcome link.`);
    if (link[1] !== plan.publicOrigin) throw new Error(`The welcome link points at ${link[1]}, not ${plan.publicOrigin}.`);
    const welcome = await https({ method: "POST", path: "/welcome/submit", body: signInBody({ token: link[2] ?? "" }, account.secret) });
    expectStatus(welcome, 200, `POST /welcome/submit for ${account.email}`);
    if (welcome.sessionPairs.length === 0) throw new Error(`Setting ${account.email}'s password signed nobody in.`);
  }
  pass("email", "both welcome emails arrived in Mailpit with a link on the public origin, and each set its password");

  await signInBoth(https, accounts);
  await expectIsolated(https, accounts);
  pass("isolation", "both signed in over TLS; each sees only itself in its workspace's members");

  const payments = plan.config.payments;
  if (payments !== null && plan.config.sinks.payments) {
    const key = (await readFile(secretFile(plan, "stripe_secret_key"), "utf8")).trim();
    const answer = await runOneShot(context.runner, { project: plan.project, image: plan.coreImage, network: plan.networks.edge, script: SMOKE_SCRIPTS.payments, input: { apiBase: payments.apiBase, key } }) as { status: number; object: string | null };
    if (answer.status !== 200 || answer.object !== "list") throw new Error(`The payments API answered ${answer.status} (${String(answer.object)}).`);
    pass("payments", `${payments.apiBase} answered a customer list with the deployment's key, from the edge network`);
  }

  if (plan.config.billing !== null && plan.config.sinks.payments) pass("webhook", await checkWebhook(https, plan, context));

  await checkRestart(plan, driver, context);
  await signInBoth(https, accounts);
  await expectIsolated(https, accounts);
  pass("restart", "after down (data kept) and up, both accounts sign in and are still isolated");

  pass("teardown", `the final down left nothing labelled ${plan.project} (${await checkTeardown(plan, driver, context)})`);
  return steps;
}

async function provision(plan: CloudPlan, context: DriverContext, accounts: readonly Account[]): Promise<void> {
  if (plan.networks.provisioning === null) throw new Error("This deployment has no provisioning network.");
  const token = (await readFile(secretFile(plan, "provisioning_token"), "utf8")).split(/\r?\n/u)[0]?.trim() ?? "";
  const calls = accounts.map((account, index) => ({
    operation: "createAccount",
    body: { requestId: `smoke-${account.email.split("@")[0]}`, email: account.email, displayName: `Smoke ${index + 1}`, policies: ["FluxIQAdministratorAccess"], workspace: "new", sendWelcome: true }
  }));
  const answers = await runOneShot(context.runner, { project: plan.project, image: plan.coreImage, network: plan.networks.provisioning, script: SMOKE_SCRIPTS.provision, input: { address: plan.config.provisioning.address, token, calls } }) as ProvisionAnswer[];
  answers.forEach((answer, index) => {
    if (answer.status !== 200 || answer.body?.ok !== true || answer.body.result?.status !== "created") {
      throw new Error(`createAccount for ${accounts[index]?.email} answered ${answer.status} ${JSON.stringify(answer.body?.error ?? answer.body?.result ?? null)}.`);
    }
  });
}

async function signInBoth(https: ReturnType<typeof pinnedHttps>, accounts: Account[]): Promise<void> {
  for (const account of accounts) {
    const answer = await https({ method: "POST", path: "/api/auth/login", body: signInBody({ username: account.email }, account.secret) });
    expectStatus(answer, 200, `POST /api/auth/login for ${account.email}`);
    if (answer.sessionPairs.length === 0) throw new Error(`Signing in ${account.email} set no session.`);
    account.session = answer.sessionPairs;
  }
}

async function expectIsolated(https: ReturnType<typeof pinnedHttps>, accounts: readonly Account[]): Promise<void> {
  for (const account of accounts) {
    const answer = await https({ method: "GET", path: "/api/accounts/members", session: account.session });
    expectStatus(answer, 200, `GET /api/accounts/members as ${account.email}`);
    const payload = (JSON.parse(answer.body) as { payload?: { members?: { email?: string }[] } }).payload;
    const emails = (payload?.members ?? []).map((member) => member.email);
    if (emails.length !== 1 || emails[0] !== account.email) throw new Error(`${account.email} sees these members in its workspace: ${emails.join(", ") || "none"}; expected only itself.`);
  }
}
