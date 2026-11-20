# Cloud Platform

`@fluxiq/cloud` (`packages/cloud`) builds and tears down the whole FluxIQ cloud
platform from one config file: Core on the `service` profile with its private
provisioning listener, Caddy in front with TLS, and on a local rehearsal the
Mailpit mail sink and the stripe-mock payments API. Its command is
`fluxiq-cloud`:

```sh
fluxiq-cloud up      [--config <file>] [--build]
fluxiq-cloud status  [--config <file>] [--json]
fluxiq-cloud smoke   [--config <file>]
fluxiq-cloud down    [--config <file>] [--keep-data] [--keep-images]
fluxiq-cloud render  [--config <file>] [--profile local|production] --out <dir>
fluxiq-cloud schema
```

The config defaults to `./fluxiq-cloud.config.json`. Inside this repository,
run it without building with
`pnpm --filter @fluxiq/cloud cloud <command> --config <file>`.

## Three Modes

Every cloud unit is tested in all three ways FluxIQ runs:

| Mode | How | What it is |
| --- | --- | --- |
| Hosted service | `mode: "service"` (the default; `examples/local.config.json`, `production.config.json`) | The multi-user service: Core on the `service` profile, the provisioning listener, billing, sign-up (`signup`). |
| Self-hosted | `mode: "self-hosted"` (`examples/self-hosted.config.json`) | One company's own server: Core on the `self-hosted` profile (`deploy/compose/self-hosted.compose.yml`), Caddy with TLS, the full base product. No billing, payments, provisioning listener or sign-up: the config refuses those sections. A signed per-seat license (later) only adds company extras. |
| Local panel | `node scripts/run-fluxiq-web.mjs` from the repository root | The plain panel on this machine: none of the cloud modules, no billing calls. |

`fluxiq-cloud up`, `smoke` and `down` run the first two with their own
config; the smoke is per mode (see The Smoke). The third is started with the
script above and loads no commerce configuration (`FLUXIQ_COMMERCE_CONFIG_FILE`
is unset, so `getCommerceBilling()` is null and the webhook answers 404).

## One Deployment, Two Places

A local run is a rehearsal of the real server, not a different setup. Both
use the same image (built from `deploy/docker/Dockerfile`), the same Compose
file (`deploy/compose/service.compose.yml`), the same Caddyfile
(`deploy/caddy/Caddyfile.example`) and the same generated override. Only the
config's values differ:

| Setting | Local rehearsal (`examples/local.config.json`) | Real server (`examples/production.config.json`) |
| --- | --- | --- |
| `domain` | `app.fluxiq.localhost` (never reaches DNS) | the public host, e.g. `app.example.org` |
| `tls` | `internal`: Caddy's own local authority | `acme`: Let's Encrypt, with the operator's address |
| `email.smtp` | `smtp://mailpit:1025` (Mailpit, `sinks.mail`) | `smtp+starttls://host:587` or `smtps://host:465`, with `username` and `passwordFile` |
| `payments` | `http://stripe-mock:12111` (`sinks.payments`), a generated test key and webhook secret | `https://api.stripe.com`, `secretKeyFile` (test or live key) and `webhookSecretFile` (Stripe's signing secret) |
| `billing` | the plans and policy, `provider` `stripe` (or `fake`) | the same section; `fake` is refused |
| `signup` | `off` or `open`, rendered as `FLUXIQ_SIGNUP` | the same |
| `source.root`, `stateDir`, `secrets.dir` | beside the config | the server's own paths (`/opt/...`, `/var/lib/...`, `/etc/...`) |

`render` writes exactly the files a server runs, without deploying. A test
(`packages/cloud/src/plan/tests/write-bundle.test.ts`) renders both examples
and asserts the whole difference: the deploy/ copies and the override are
byte-identical; `compose.env` differs in `FLUXIQ_CLOUD_PROJECT`, `FLUXIQ_BUILD_CONTEXT` and
`FLUXIQ_PROVISIONING_NETWORK`, plus the sink images and Mailpit's port that
exist only with sinks on; `env/service.env` differs in the origin, site
address, instance id and name, ACME address, TLS directive, mail sender and
From, plus the sign-up URL and SMTP sign-in production sets;
the sinks file exists only when a sink is on; `env/commerce.json` has the same
keys in both and differs only in the plans' values and in `apiBaseUrl`, which
is set for the stripe-mock sink and absent for Stripe's own API. Each of those
is checked against the config field it comes from.

The profiles keep each other honest. `local` refuses ACME and any domain not
ending in `.localhost`; `production` refuses sinks, `tls internal`, a
non-public domain, plain `smtp://` and a missing `secrets.dir`. Credentials
are refused over plain `smtp://`, and `payments.apiBase` must be `https://`
unless it is the stripe-mock sink. With `billing`, a server needs
`payments.webhookSecretFile` (the sink generates its own), the `fake` provider
is local only, plans need unique price ids and a region for every non-control
grant, and `billing.maxVerificationAgeMs`, if given, must exceed
`refreshAfterMs`. `fluxiq-cloud schema` prints the full JSON
Schema; `packages/cloud/fluxiq-cloud.schema.json` is the same, for editors.
Every problem in a config is reported at once, with its path.

### Prices Are Configuration

FluxIQ alone sets prices, in the config's `billing.plans`, never in code.
Each plan is one Stripe price with a `unit`: `dedicated-browser` (a dedicated
browser each), `seat` (a team seat each) or `flat` (the default: one price
for the whole plan); the Stripe item quantity is the count. The hosted offer
is a `browser` plan, a `seat` plan and a `flat` plan, as the examples show.
`unit` is rendered into `env/commerce.json` and read by
`apps/web/src/server/commerce/config.ts`; a `dedicated-browser` plan must
include a dedicated grant.

Quantities are counts. A plan's grants carry a `quantity`; Checkout sells
each line item with its quantity, and the subscription's grants keep it. Cloud
admission (`CloudAdmissionService`, still the one admission authority) counts
the dedicated browsers an account already holds and admits a new one only
while that count is below the grants' quantity: a `dedicated-browser` item
bought with quantity two admits two environments, and the third is refused
with `entitlement-exhausted`. A lapse refuses new environments and never stops a
running one. Changing a price, a plan or a quantity is a config change.

The paying account is resolved from FluxIQ's own records, never from the
provider's echo alone: starting a Checkout records the account, plan and
customer, and the webhook binds the subscription to the account through that
record. The subscription's `fluxiq_account_id` metadata is set and
cross-checked; metadata naming another account is refused
(`account-mismatch`), and a subscription no checkout binds is recorded as
nothing (`unbound`). Starting a new Checkout, or closing the account, expires
the account's open one. Buying (`iam:StartCheckout`) is open to a workspace's
administrators and owners; the plan page is `/plans`, which answers 404 while
the server bills nothing.

## What `up` Does

1. Checks Docker is running.
2. Generates the secret files that are absent (the provisioning token, the
   setup code, the host keyring, and a key and a webhook signing secret for
   stripe-mock), readable by
   their owner only. Operator files (a real Stripe key, an SMTP password) are
   never generated: their absence stops `up` with their paths. A secret is
   never regenerated, so data sealed under the keyring stays readable.
3. Records which images are absent before it starts (Caddy, the sinks, the
   Dockerfile's base image when it builds), so `down` can remove exactly
   those.
4. Writes the bundle to `<state>/deploy/`: copies of the Compose file and the
   Caddyfile, `compose/cloud.override.yml`, `compose/sinks.compose.yml` (only
   with a sink), `compose/compose.env`, `env/service.env`, `env/commerce.json` (with `billing`) and
   `deployment.json`.
5. Creates the `<project>_runners` network for the runner containers I5
   describes (traffic between containers disabled).
6. Builds `fluxiq-cloud/core:<package version>` when it is missing (or with
   `--build`). With `environments`, also builds the runner image
   `fluxiq-cloud/runner:<package version>` from the extension checkout the
   config names (labelled, so `down` removes it; the extension and browser
   host must be built there first), and finds the engine socket's group, which
   Core's container joins.
7. Copies the secrets into the `<project>_secrets` volume (below), then
   `docker compose up --detach --wait`.
8. With `tls internal`, exports Caddy's local root certificate to
   `<state>/certs/root.crt` for clients to pin; with `environments`, also
   copies it into the secrets volume as `runner_authority`, which Core passes
   to each runner it creates.

Each step is recorded in `<state>/state.json` before the next, so a failed
`up` can be removed with `down`. A second `up` changes nothing.

### Secrets

Every secret reaches Core as a file under `/run/secrets/`, owned by Core's
user (uid 1000) and readable only by it, in a folder only root can write:
Core's private-file check on the host keyring requires exactly that. Here
`/run/secrets` is the `<project>_secrets` volume, mounted read-only; the
override clears the base file's Compose secrets (`!reset`). On every `up` a
throwaway container (Core's image, as root, no network, only the
`CHOWN` capability, read-only root) receives the secret files' contents on
standard input and writes each as `<name>`, mode 0400, owned by 1000:1000,
removing any no longer configured.

The two Compose mechanisms cannot do this, as checked on Docker Desktop
29.9.3 and Compose 5.7.0: file secrets are bind mounts outside Swarm, Compose
ignores `uid`, `gid` and `mode` for them, and Docker Desktop shows a Windows
file as `root:root` mode 0777, which Core refuses; variable-sourced secrets
are refused on a read-only service ("`file` is the sole supported option").
The volume works the same on Docker Desktop and on a Linux server, and the
operator never has to set ownership on the host files. A secret's value is
never in a config, env file, image, argument or container environment.

`deployment.json` lists the volume and each secret's file, for an operator
who runs Compose by hand.

### Dedicated Browsers

A service on the local profile may add `environments` (example:
`examples/local-environments.config.json`, whose billing provider is
`fake`): `runner.context` names the extension checkout, `limits` each
runner's memory, CPUs and processes. The config refuses it on a self-hosted
server, on the production profile (production gives each environment its own
virtual machine), and without a plan that grants a dedicated browser. The
override then mounts the engine's socket into Core (in its group) and
`env/service.env` configures Core's `docker` driver
([dedicated browser environments](./dedicated-browser-environments.md)). The
gateway's allowed origins must include the runner's extension
(`chrome-extension://kknpahmjpoklhjbelapilpkhedbkheck`). Giving Core the
socket gives it the engine: acceptable for a rehearsal on one's own machine,
never the production shape.

The `fake` payment provider takes no money: Core refuses it on any origin
that is not this machine's, and the config on the production profile. A
Checkout of it is paid by the provider's own signed
`checkout.session.completed` naming `fake_sub_<checkoutId>`: the fake then
creates that plan's subscription (active for a month, the line's quantity),
decided by the plan configuration alone. Like a real provider it keeps its checkouts and
subscriptions across FluxIQ's restarts (`<FluxIQ root>/platform/commerce/fake-provider.json`,
beside the ledger): before t953's round 2 it held them in memory only, so an
account deleted after a restart failed closing its billing
(`subscription-missing-at-provider`, answered as a 500).

## What `down` Removes

Compose's own `down` first (a graceful stop), then every container, network,
volume and image carrying the label `com.fluxiq.cloud.project=<project>`,
then what the state file records: images pulled because they were absent
(one something else now uses is kept and reported), the trusted certificate,
the generated secrets, the exported certificate and the bundle. Nothing
unlabelled and unrecorded is touched. `down` on nothing succeeds.

- `--keep-data` keeps the volumes, the secrets that seal them and the state:
  a restart that keeps every account.
- `--keep-images` keeps the built and pulled images, so the next `up` does
  not rebuild.

Docker's build cache is not removed (BuildKit cache entries carry no labels);
`docker builder prune` clears it.

## Local Trust

`tls.trustLocalCa` is off by default: clients pin the exported certificate
(the smoke does). Turned on, on Windows, `up` adds Caddy's local root to the
current user's Root store (`certutil -user -addstore`; Windows asks the person
to confirm) and records its thumbprint; `down` removes that one certificate.
The machine store is never touched.

## The Smoke

`fluxiq-cloud smoke` checks a local rehearsal end to end, from outside:

1. `/api/health` over TLS, pinned to the exported certificate.
2. Two accounts created through the provisioning listener from a one-shot
   container on the provisioning network, as a sign-up site's backend does
   (the app's own sign-up page is later work).
3. Their welcome emails read from Mailpit's API; each sets its password
   through `/welcome/submit` over TLS.
4. Both sign in through `/api/auth/login`; each sees only itself in
   `/api/accounts/members`.
5. The payments API answers with the deployment's key, from the edge network.
6. The billing webhook, posted without cookie or Origin to
   `/api/platform/v1/commerce/webhook` over TLS, three ways: a test event
   signed with the generated secret that names no subscription is accepted
   and ignored; one that names stripe-mock's subscription makes billing fetch
   it, but no checkout FluxIQ recorded binds it to an account, so nothing is
   recorded and the delivery answers 200 `unbound`; the first body signed
   with another secret is refused with 400.
7. The checkout journey: the first account reads the plans and starts a
   Checkout of the plan that sells dedicated browsers (the panel answers the
   Checkout URL; the account reads `checkout-pending`); Stripe's signed
   `checkout.session.completed` binds the subscription to that account
   through FluxIQ's checkout record and writes a ledger version; the same
   delivery again is a duplicate, and a signed subscription update writes the
   next version; the second account, which bought nothing, reads no plan and
   no dedicated browser. stripe-mock's only subscription fixture is set to end
   in 2000, so the recorded subscription reads `ended` and grants nothing: the
   smoke proves account resolution and the ledger write, not a paid grant (see
   Limits).
8. `down --keep-data`, `up`, and both accounts sign in again, still isolated.
9. A final `down`; no labelled container, network, volume or image is left.

With `environments` and the `fake` provider, steps 6 and 7 are replaced by
the dedicated browser journey: the first account buys the browser plan (the
fake provider's signed completion), creates a browser over HTTPS (the answer
comes once its runner container runs and its client enrolled at that
workspace's gateway; the container is labelled for the project and the
environment, and `docker inspect` shows no ticket), a repeated create is the
same browser, the next one is refused (`entitlement-exhausted`), the second
account is refused (`subscription-required`), sees none and cannot stop it,
and deleting it removes its container and volume. After the restart, the
first account creates another browser and is deleted through the
provisioning listener; the purge removes that container and volume.
The deletion either finishes or, when a step must wait, is answered
`scheduled` and finished by the deletion sweep; it never answers 500. When
any provisioning call does fail unexpectedly, the listener's one log line
names the failure's kind (class and machine code, such as
`failure=Error:workspaces.close_failed`), never its message.

A self-hosted server's smoke is shorter: `/api/health` and `/api/ready` over
TLS; discovery names the `self-hosted` profile and the wss gateway; the
commerce webhook answers 404 (no billing); `down --keep-data`, `up`, and the
same checks again; a final `down` that leaves nothing labelled.

A failed check stops with what it observed and leaves the stack up for a
look; `fluxiq-cloud down` removes it.

## On A Real Server

1. Check out FluxIQ Core at `source.root` and install Docker.
2. Put the Stripe key and the SMTP password at the config's paths
   (`secrets.dir` holds the generated ones too). Point DNS at the server.
3. `fluxiq-cloud render --profile production --config <file> --out <dir>` to
   review the files, then `fluxiq-cloud up --config <file>` on the server
   (the `local-docker` driver runs Compose on the machine it runs on).

The `vm` and cloud drivers that would do this from elsewhere are not built;
a config naming one is refused by every command except `render`.

## Limits

- The image is built from a Core checkout; a published image is later work.
- The extension origins in the examples are placeholders of the right shape.
- Billing configuration: the config's `billing` section is rendered as
  `env/commerce.json`, copied into the secrets volume as `commerce_config`, and
  named by `FLUXIQ_COMMERCE_CONFIG_FILE` (the one file Core's billing reads,
  `apps/web/src/server/commerce/config.ts`); its secret paths are the volume's
  `stripe_secret_key` and `stripe_webhook_secret`. Without `billing` nothing
  is rendered and the server bills nothing.
- A paid grant cannot be produced locally through stripe-mock: its only
  subscription fixture ended in 2000, so the stripe-mock checkout journey
  proves account resolution and the ledger write but not admission. The
  `fake`-provider config with `environments` proves a paid grant admitting a
  real dedicated browser end to end (above).
- Seats are carried as grant quantities and shown on `/plans`, but no seat
  limit is enforced on invitations yet; a plan combining dedicated browsers
  and seats works in Core's commerce file but the cloud config sells one price
  per plan. Both come with the billing-admin role.
- The count of dedicated browsers an account holds is kept and checked in the
  serving process. That is sound because one data root has exactly one
  serving process (t931's data-root owner file, `packages/fluxiq/src/server/data-root-owner`): a
  second process cannot serve the same root, so it cannot admit against a
  stale count. Serving one root from several processes would need an atomic
  count in the environment store.
- The image build sets `NODE_OPTIONS=--max-old-space-size=3584` for the
  `pnpm build` step only (`deploy/docker/Dockerfile`): `next build`'s type
  check needs more heap than Node's default inside a 4 GB build VM. Type
  checking stays on.
- Cloud admission (`getCloudAdmission()` in `apps/web/src/server/commerce`)
  is composed beside billing over the same ledger, with grace, trial and
  verification age from the same file (`maxVerificationAgeMs` defaults to
  twice `refreshAfterMs`). Its IAM target resolver is installed with
  `setCloudAuthorizer`; until one is, every admission is refused.
- Caddy's HTTP to HTTPS redirect and HSTS apply to the local name too.
