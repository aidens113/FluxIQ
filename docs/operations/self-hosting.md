# Self-Hosting

How to build, run and look after FluxIQ Core on a server of your own: the
container image, the example Compose deployments with Caddy in front, the
settings, DNS and TLS, backups, upgrades, restores, and the private
provisioning listener a sign-up site uses. The design behind it is the hosted
production plan's "Target Topology", "Gateway Transport Over The Internet",
"Deployment And Operations" and "Security" sections
([plan](../working/hosted-production-plan.md)).

Nothing here contains a secret, and nothing you follow it with should put one
in a file the repository tracks, in an image, or in a log.

## What Runs Where

One container runs Core: the panel and its API on port 3000 and the client
gateway (the WebSocket the browser extension connects to) on port 4777, in one
Node process. Caddy runs beside it, terminates TLS on 443, sends `/client` to
the gateway and everything else to the panel. Only Caddy publishes ports. The
server never runs a browser: the extension does every page action in the
user's own browser.

```text
browser / extension --https, wss--> Caddy :443 --/client--> fluxiq:4777 (gateway, plain ws)
                                               \--other---> fluxiq:3000 (panel, API, /connect)
sign-up site backend --http, private network--> fluxiq:<private address>:4780 (service only)
```

One image serves every profile; `FLUXIQ_PROFILE` chooses:

| Profile | For | What changes |
| --- | --- | --- |
| `local` | One person on their own machine | Loopback, no TLS, first start keeps the loopback `admin` account. Not for a container reachable from a network |
| `self-hosted` (image default) | One owner, optionally a few administrators, on a server they run | Requires a public origin; the first owner is claimed with a setup code; single tenancy |
| `service` | A multi-user service whose accounts a separate sign-up site creates | https origin required; a workspace per user; the provisioning listener |

The image defaults to `self-hosted` rather than `local`, so a container started
with a forgotten setting fails closed (it never becomes ready) instead of
opening with a default account.

## Files

| Path | What it is |
| --- | --- |
| `deploy/docker/Dockerfile` | The image: a Node 22 build stage and a non-root runtime stage |
| `deploy/docker/healthcheck.mjs` | The image's `HEALTHCHECK` (`/api/health`) |
| `deploy/docker/smoke.sh` | The image smoke test CI runs; runs anywhere Docker does |
| `deploy/compose/self-hosted.compose.yml` | Core and Caddy, `self-hosted` |
| `deploy/compose/service.compose.yml` | Core and Caddy, `service`, with the private provisioning network |
| `deploy/caddy/Caddyfile.example` | Caddy: TLS, the WebSocket route, the client address |
| `deploy/env/*.env.example` | The settings you fill in (no secrets) |
| `deploy/secrets/` | Where secret files go on the server (git ignores its contents) |
| `.github/workflows/deploy.yml` | Image build and smoke on demand; the deploy job is switched off |

## Build The Image

From the repository root, on a machine with Docker:

```sh
docker build -f deploy/docker/Dockerfile -t fluxiq-core:local .
```

The build stage installs the workspace with pnpm, builds Core's libraries and
then the panel exactly as `pnpm build` does, with `FLUXIQ_WEB_STANDALONE=1` so
Next writes a standalone server (`apps/web/next.config.ts`). The panel build
fails if it compiled Core from source instead of its built `dist`
(`scripts/web-build/identity/`). The image has no git, so the build cache runs
every step without caching. `sqlite3` is built for Linux in the same base image
the runtime uses.

The runtime stage holds only the standalone server, its static files, the
client gateway bundle and a production install of the `fluxiq` package at
`/opt/fluxiq-gateway-runtime`, linked beside that bundle (the gateway imports
`fluxiq` natively, which Next's tracing cannot see). It runs as the `node` user, and `/data` is the only path that user can
write. `.dockerignore` keeps `.fluxiq`, every `.env` file, `deploy/env`,
`deploy/secrets`, `node_modules`, build output, test runs and worktrees out of
the build context.

For a release, pin the base image by digest
(`--build-arg NODE_IMAGE=node:22-bookworm-slim@sha256:<digest>`) and Caddy's
the same way (`CADDY_IMAGE`).

To check the build before a release, run the smoke test against the image:

```sh
bash deploy/docker/smoke.sh fluxiq-core:local self-hosted
bash deploy/docker/smoke.sh fluxiq-core:local service
```

It starts the image with a read-only root, waits for Docker's health verdict,
and checks health, readiness, discovery, that it is not root, that the root
filesystem refuses writes, that the gateway refuses a foreign Origin, and on
`service` a provisioning round trip on the private listener. Every secret it
uses is generated for the run and removed afterwards.

## Server And DNS

Any Linux VM with Docker Engine and the Compose plugin. Scale vertically first.

1. Point the panel's host name at the server: an `A` record (and `AAAA` if the
   server has IPv6), for example `fluxiq.example.org`.
2. Open TCP 80 and 443, and UDP 443 for HTTP/3. Port 80 answers the
   certificate authority's challenge and redirects to https. Leave 3000, 4777
   and 4780 closed: Compose never publishes them.
3. Caddy obtains and renews the certificate itself once DNS resolves to the
   server. Its certificates live in the `caddy-data` volume.

## Run: Self-Hosted

```sh
cp deploy/env/self-hosted.env.example deploy/env/self-hosted.env
# edit deploy/env/self-hosted.env
docker compose -f deploy/compose/self-hosted.compose.yml up -d --build
```

Set at least:

- `FLUXIQ_PUBLIC_ORIGIN`: `https://<your host>`, no path. Sign-in, the
  connect flow and the session cookie (`__Host-fluxiq_session`) are bound to
  it, and the gateway URL the extension is given is derived from it
  (`wss://<your host>/client`).
- `FLUXIQ_SITE_ADDRESS`: the same host name, for Caddy.
- `ACME_EMAIL`: where the certificate authority writes.
- `FLUXIQ_CLIENT_GATEWAY_ALLOWED_ORIGINS`: the extension origins the gateway
  admits, comma separated: `chrome-extension://<id>` for each Chrome and Edge
  build (their ids differ) and `moz-extension://*` for Firefox (ids are
  per-install). A gateway reachable from a network refuses to start without a
  valid entry, and refuses any entry outside that grammar (wildcards other than
  `moz-extension://*`, paths, `null`). The example's `<...>` entries are
  refused until you replace them.

The compose file fixes `FLUXIQ_PROFILE=self-hosted`, `FLUXIQ_ROOT=/data` and
`FLUXIQ_TRUST_PROXY=true`. Trusting the proxy is safe only because nothing but
Caddy can reach the container: Caddy replaces any `X-Forwarded-For` a client
sends with the address it sees, and Core reads the rightmost entry. If you put
another proxy or a CDN in front of Caddy, configure Caddy's `trusted_proxies`
for it (see the Caddyfile's comments).

The container runs with a read-only root, `/data` as its only writable volume,
tmpfs at `/tmp` and Next's cache, all capabilities dropped and
`no-new-privileges`. Caddy starts once Core reports healthy.

### Claim The Owner

On first start Core writes a one-time setup code to
`/data/.fluxiq/security/setup-code` and logs that file's path, never the code.
Read it on the server and use it at `https://<your host>/setup`:

```sh
docker compose -f deploy/compose/self-hosted.compose.yml exec fluxiq cat /data/.fluxiq/security/setup-code
```

To choose the code yourself instead, mount a file holding it (at least 16
characters) and set `FLUXIQ_SETUP_CODE_FILE` to its path in the container, as
the service compose file does. Once the owner is claimed the code is no longer
read, and a generated code file is removed.

### Connect The Extension

In the extension, add the server by its origin (`https://<your host>`). The
extension reads `https://<your host>/.well-known/fluxiq`, signs in through a
normal tab, and connects to the gateway over `wss`. If the extension cannot
connect, check that its origin is in `FLUXIQ_CLIENT_GATEWAY_ALLOWED_ORIGINS`.

## Run: Service

```sh
cp deploy/env/service.env.example deploy/env/service.env
# edit deploy/env/service.env
openssl rand -hex 32 > deploy/secrets/provisioning-token
openssl rand -hex 24 > deploy/secrets/setup-code
sudo chown 1000:1000 deploy/secrets/provisioning-token deploy/secrets/setup-code
sudo chmod 0400 deploy/secrets/provisioning-token deploy/secrets/setup-code
docker compose -f deploy/compose/service.compose.yml up -d --build
```

The settings are the self-hosted ones (the origin must be https) plus, when
there is a sign-up site, `FLUXIQ_SIGN_UP_URL`. The compose file fixes the
profile, the data root, proxy trust, and the provisioning listener's address,
source ranges and token file. Running the `service` profile for customers or
other third parties needs a commercial licence
([COMMERCIAL-LICENSING.md](../../COMMERCIAL-LICENSING.md),
[Licensing](../legal/licensing.md)).

## The Provisioning Listener

A sign-up site creates accounts by calling Core's provisioning operations
(`createAccount`, `getAccount`, `sendWelcome`, `setPolicies`, and the rest) on
a private HTTP listener. No password ever crosses it. It starts only on the
`service` profile and only when `FLUXIQ_PROVISIONING_TOKEN_FILE` is set; then:

- `FLUXIQ_PROVISIONING_LISTEN` (`host:port`, an IP literal or `localhost`) is
  required, and the panel's and gateway's ports are refused, because the proxy
  routes those to the internet. The service compose file binds the container's
  own address on the internal `fluxiq-provisioning` network
  (`172.31.250.10:4780` by default).
- `FLUXIQ_PROVISIONING_ALLOWED_CIDRS` lists the source ranges admitted; every
  entry must be loopback or private. The compose file admits only the
  provisioning network's subnet (`172.31.250.0/24` by default). Change both
  defaults with `FLUXIQ_PROVISIONING_SUBNET` and `FLUXIQ_PROVISIONING_ADDRESS`
  in the shell or a `.env` beside the compose file if that range is taken on
  the host.
- The token file holds one token, or two while rotating, one per line, each at
  least 32 bytes. Core keeps only their SHA-256 digests. The sign-up backend
  sends the token as a bearer token.

The network is `internal`: it has no route to the internet or the host. Your
sign-up backend joins it from its own compose project:

```yaml
networks:
  fluxiq-provisioning:
    external: true
```

and calls `http://172.31.250.10:4780` (or your address). Caddy is not on that
network and has no route to the listener.

**Rotating the token.** Add the new token as a second line, restart Core
(`docker compose ... restart fluxiq`), switch the sign-up backend to it, then
remove the old line and restart again.

**From the command line.** The operator command runs the same operations
through the listener from inside the container:

```sh
docker compose -f deploy/compose/service.compose.yml exec fluxiq \
  node /opt/fluxiq-gateway-runtime/dist/platform/provisioning/cli/main.js accounts --help
```

## Settings Reference

Settings an operator usually sets; each is read from the container's
environment. The resolver is `packages/fluxiq/src/platform/profile/resolve/`.

| Variable | Default | Meaning |
| --- | --- | --- |
| `FLUXIQ_PROFILE` | `self-hosted` in the image | `local`, `self-hosted` or `service`; anything else refuses to start |
| `FLUXIQ_PUBLIC_ORIGIN` | none (required off `local`) | The public origin; must be https on `service` |
| `FLUXIQ_CLIENT_GATEWAY_ALLOWED_ORIGINS` | none (required when reachable) | The extension origins the gateway admits |
| `FLUXIQ_PUBLIC_CLIENT_WS_URL` | `wss://<origin host>/client` | Overrides the gateway URL clients are told |
| `FLUXIQ_ROOT` | `/data` in the image | Where `.fluxiq` lives |
| `FLUXIQ_TRUST_PROXY` | `false`; `true` in the compose files | Read the client address from `X-Forwarded-For` |
| `FLUXIQ_DRAIN_SECONDS` | `30` off `local` | How long a stopping server lets work finish; keep `stop_grace_period` above it |
| `FLUXIQ_LOG_FORMAT` | `json` off `local` | `json` or `text` |
| `FLUXIQ_SETUP_CODE_FILE` | a generated code under `/data` | A file holding the owner setup code |
| `FLUXIQ_EMAIL_SENDER` | `file` (outbox under `/data`) | `none`, `file` or `file:<dir>` |
| `FLUXIQ_INSTANCE_NAME` | `FluxIQ` | The name discovery gives the extension |
| `FLUXIQ_SIGN_UP_URL` | none | Where the extension sends someone without an account |
| `FLUXIQ_WORKSPACE_IDLE_MS`, `FLUXIQ_WORKSPACE_CACHE_MAX` | 15 minutes, 100 | How long and how many workspaces stay loaded (`service`) |
| `FLUXIQ_CLIENT_GATEWAY_*` limits | 16 MiB frames, hello within 10 s, 50 messages/s, bursts of 200 off `local` | Gateway limits; see the resolver |
| `FLUXIQ_PROVISIONING_*` | off | The provisioning listener (above) |

The image also sets `HOSTNAME=0.0.0.0`, `PORT=3000`,
`FLUXIQ_CLIENT_GATEWAY_HOST=0.0.0.0`, `FLUXIQ_CLIENT_GATEWAY_PORT=4777` and
`FLUXIQ_GATEWAY_SERVER_MODULE`; leave them as they are.

## Secrets

The provisioning token and the setup code are files, mounted read-only into
the container (Compose `secrets`, under `/run/secrets/`). They are never
environment values, never in `deploy/env/*.env`, never in `.fluxiq`, an image
or a log, and never committed: `deploy/secrets/` ignores everything but its
`.gitignore`, and `.dockerignore` keeps it out of builds. The files must be
readable by uid 1000, the container's user. Users' model provider keys are
sealed under their own passwords inside `/data`; the server holds no platform
key.

## Health, Readiness And Logs

- `GET /api/health`: 200 while the process answers. The image's
  `HEALTHCHECK` uses it every 30 seconds.
- `GET /api/ready`: 200 once the runtime is initialized, the gateway is
  listening and the server is not draining; 503 with a one-word reason
  otherwise.
- `GET /.well-known/fluxiq`: the discovery document the extension reads.

Logs go to standard output as JSON (`docker compose logs fluxiq`). Caddy keeps
no access log in the example, because request lines carry the connect flow's
query strings.

On `docker compose stop` or a deploy, Core receives SIGTERM, reports not
ready, drains the gateway's connections for up to `FLUXIQ_DRAIN_SECONDS`, and
exits. The compose files allow 45 seconds before Docker kills it.

## Backups

Everything Core keeps is in the `fluxiq-data` volume (`fluxiq_fluxiq-data` for
the self-hosted project, `fluxiq-service_fluxiq-data` for the service one):
accounts, sessions, policies, workspaces, Flows, recordings, sealed keys and
the audit. Back it up while Core is stopped, so every SQLite database is
consistent:

```sh
compose="docker compose -f deploy/compose/self-hosted.compose.yml"
$compose stop fluxiq
docker run --rm -v fluxiq_fluxiq-data:/data:ro -v "$PWD/backups:/backup" \
  busybox tar czf "/backup/fluxiq-$(date +%Y%m%d-%H%M%S).tar.gz" -C /data .
$compose start fluxiq
```

A backup holds account data and users' sealed keys: encrypt it before it
leaves the server, keep it off the server, and test a restore. Caddy's
`caddy-data` volume (certificates) can be recreated and does not need a backup.

## Upgrade

1. Back up (above).
2. Get the new release: `git pull` and rebuild (`up -d --build`), or set
   `FLUXIQ_IMAGE` to the new image and `docker compose pull`.
3. `docker compose -f deploy/compose/<file> up -d`. Compose stops the old
   container with SIGTERM (the drain), starts the new one, and Caddy keeps
   serving.
4. Check `https://<your host>/api/ready` answers 200.

Storage changes are forward-only. Core never migrates storage implicitly: a
data root that needs a migration fails startup without being changed, and the
release says how to migrate it ([Data And State](data-and-state.md), "Storage
Migration"). To go back to the previous release, restore the backup taken in
step 1 and run the previous image.

## Restore

```sh
compose="docker compose -f deploy/compose/self-hosted.compose.yml"
$compose stop fluxiq
docker run --rm -v fluxiq_fluxiq-data:/data -v "$PWD/backups:/backup:ro" \
  busybox sh -c 'rm -rf /data/..?* /data/.[!.]* /data/* && tar xzf /backup/<backup file> -C /data && chown -R 1000:1000 /data'
$compose start fluxiq
```

Restore into a stopped server only, and with the image version that wrote the
backup or a newer one.

## Running Without Compose

```sh
docker run -d --name fluxiq --read-only --tmpfs /tmp --tmpfs /app/apps/web/.next/cache \
  -v fluxiq-data:/data --env-file deploy/env/self-hosted.env \
  -e FLUXIQ_TRUST_PROXY=true --network <the proxy's network> fluxiq-core:local
```

Publish 3000 and 4777 only to a proxy that terminates TLS and replaces
`X-Forwarded-For`; without such a proxy, leave `FLUXIQ_TRUST_PROXY` unset.

## Continuous Integration

`.github/workflows/deploy.yml` runs only when started by hand. Its image job
builds the image and runs `deploy/docker/smoke.sh` on both public profiles. Its
deploy job is switched off: no deployment target has been named, so it names
none, holds no credential, and runs only if the repository variable
`FLUXIQ_DEPLOY_ENABLED` is `true`, which is unset. `ci.yml` is unchanged.
