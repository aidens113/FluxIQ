import { randomBytes } from "node:crypto";
import { DockerCli, type DriverContext } from "../../../drivers/index.ts";
import { CLOUD_PROJECT_LABEL, type CloudPlan } from "../../../plan/index.ts";
import { expectStatus } from "../../expect-status.ts";
import type { pinnedHttps } from "../../pinned-https.ts";
import { environmentCall as call } from "./call.ts";
import { environmentDocker } from "./docker.ts";
import { webhookPoster } from "../webhook-poster.ts";

const CHECKOUT_PATH = "/api/platform/v1/commerce/checkout";
const ENVIRONMENTS_PATH = "/api/platform/v1/environments";
const ENVIRONMENT_LABEL = "com.fluxiq.cloud.environment";
/** Every enrolment ticket starts so; none may appear anywhere Docker shows. */
const TICKET_PREFIX = "fxet_";

type Https = ReturnType<typeof pinnedHttps>;

/**
 * The hosted journey of a dedicated browser on a local rehearsal whose
 * billing provider is `fake`, as a customer drives it over HTTPS:
 *
 * 1. the first account buys the plan that sells a dedicated browser (a
 *    Checkout, then the provider's signed completion, which the fake turns
 *    into that plan's subscription) and reads it active with its count;
 * 2. it creates a dedicated browser over HTTP: the answer comes once Core's
 *    docker driver started the runner container and the runner's client
 *    enrolled at that workspace's own gateway (the relay reports it
 *    connected); the container carries the project and environment labels,
 *    runs, and nothing Docker shows of it holds an enrolment ticket;
 *    repeating the create with its operation id is the same browser;
 * 3. the plan's count is enforced (the next browser is refused), the second
 *    account (no plan) is refused, sees none of the first's browsers and
 *    cannot touch them;
 * 4. deleting the browser removes its container and profile volume (and the
 *    controller revokes its client's trust first).
 */
export async function checkEnvironmentJourney(https: Https, plan: CloudPlan, context: DriverContext, sessions: readonly (readonly string[])[]): Promise<string> {
  const [payer, other] = sessions;
  if (payer === undefined || other === undefined) throw new Error("The environment journey needs two signed-in accounts.");
  const billing = plan.config.billing;
  if (billing === null || billing.provider !== "fake") throw new Error("The environment journey runs on a billing section whose provider is fake.");
  const [planId, sold] = Object.entries(billing.plans).find(([, entry]) => entry.unit === "dedicated-browser") ?? [];
  if (planId === undefined || sold === undefined) throw new Error("No plan sells a dedicated browser.");
  const run = randomBytes(6).toString("hex");
  const docker = new DockerCli(context.runner);

  const started = await call(https, payer, "POST", CHECKOUT_PATH, { planId });
  const checkoutId = (started.body as { checkout?: { checkoutId?: string } }).checkout?.checkoutId;
  if (started.status !== 200 || typeof checkoutId !== "string") throw new Error(`Starting a checkout of ${planId} answered ${started.status}: ${JSON.stringify(started.body)}`);
  const post = await webhookPoster(https, plan);
  const paid = await post(JSON.stringify({ id: `evt_env_${run}`, type: "checkout.session.completed", subscriptionId: `fake_sub_${checkoutId}`, checkout: { checkoutId, outcome: "completed" } }));
  expectStatus(paid, 200, `POST ${post.path} (the fake provider's completion)`);
  if ((JSON.parse(paid.body) as { outcome?: string }).outcome !== "applied") throw new Error(`The completed checkout wrote no subscription: ${paid.body.slice(0, 300)}`);
  const status = await call(https, payer, "GET", CHECKOUT_PATH);
  if (status.body.account?.state !== "active" || status.body.account.dedicatedEnvironments !== sold.quantity) throw new Error(`After paying, the account reads ${JSON.stringify(status.body.account ?? null)}; expected active with ${sold.quantity} dedicated browser(s).`);

  const operationId = `smoke-${run}-1`;
  const created = await call(https, payer, "POST", ENVIRONMENTS_PATH, { operationId });
  const environmentId = created.body.environment?.environmentId;
  if (created.status !== 200 || environmentId === undefined || created.body.environment?.observed !== "running") throw new Error(`Creating a dedicated browser answered ${created.status}: ${JSON.stringify(created.body)}`);
  const containers = await environmentDocker.containers(docker, plan, environmentId);
  if (containers.length !== 1 || containers[0]?.state !== "running") throw new Error(`Environment ${environmentId} has these containers: ${JSON.stringify(containers)}; expected one running.`);
  const inspected = await docker.must(["inspect", containers[0]!.id], `Inspecting environment ${environmentId}'s container`);
  if (inspected.includes(TICKET_PREFIX)) throw new Error(`docker inspect of environment ${environmentId}'s container shows an enrolment ticket.`);
  const again = await call(https, payer, "POST", ENVIRONMENTS_PATH, { operationId });
  if (again.status !== 200 || again.body.environment?.environmentId !== environmentId || (await environmentDocker.containers(docker, plan, environmentId)).length !== 1) throw new Error(`Repeating the create answered ${again.status} ${JSON.stringify(again.body)}; expected the same browser.`);

  const extra = await call(https, payer, "POST", ENVIRONMENTS_PATH, { operationId: `smoke-${run}-2` });
  if (extra.status !== 402 || extra.body.reason !== "entitlement-exhausted") throw new Error(`A browser beyond the plan answered ${extra.status} ${JSON.stringify(extra.body)}; expected 402 entitlement-exhausted.`);
  const unpaid = await call(https, other, "POST", ENVIRONMENTS_PATH, { operationId: `smoke-${run}-3` });
  if (unpaid.status !== 402 || unpaid.body.reason !== "subscription-required") throw new Error(`The account without a plan answered ${unpaid.status} ${JSON.stringify(unpaid.body)}; expected 402 subscription-required.`);
  const seen = await call(https, other, "GET", ENVIRONMENTS_PATH);
  if (seen.status !== 200 || (seen.body.environments ?? []).length !== 0) throw new Error(`The second account sees ${JSON.stringify(seen.body)}; expected no browsers.`);
  const intrusion = await call(https, other, "POST", `${ENVIRONMENTS_PATH}/${environmentId}/stop`, { operationId: `smoke-${run}-4` });
  if (intrusion.status !== 404) throw new Error(`The second account stopping the first's browser answered ${intrusion.status}; expected 404.`);

  const deleted = await call(https, payer, "DELETE", `${ENVIRONMENTS_PATH}/${environmentId}?operationId=smoke-${run}-5`);
  if (deleted.status !== 200 || deleted.body.environment?.observed !== "deleted") throw new Error(`Deleting the browser answered ${deleted.status} ${JSON.stringify(deleted.body)}.`);
  const left = await environmentDocker.resources(docker, plan, environmentId);
  if (left !== "") throw new Error(`Deleting environment ${environmentId} left ${left}.`);
  return `the first account paid for ${planId} through the fake provider's signed completion (active, ${sold.quantity} browser); its create answered once runner ${containers[0]!.id.slice(0, 12)} ran on ${plan.networks.runners} and enrolled at its workspace's gateway, labelled ${CLOUD_PROJECT_LABEL}=${plan.project} and ${ENVIRONMENT_LABEL}=${environmentId}, with no ticket in docker inspect; a repeated create was the same browser; the next browser was refused (entitlement-exhausted), the second account was refused (subscription-required), saw none and could not stop it (404); deleting it removed its container and volume`;
}
