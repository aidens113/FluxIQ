#!/usr/bin/env bash
# Smoke test of a built FluxIQ Core image, as .github/workflows/deploy.yml runs it:
#
#   deploy/docker/smoke.sh <image> <self-hosted|service>
#
# Starts the image the way the compose files do (read-only root, tmpfs at
# /tmp and Next's cache, a fresh /data volume, non-root), waits until Docker
# reports it healthy, then checks:
#   - /api/health and /api/ready answer 200;
#   - discovery (/.well-known/fluxiq) names the profile and the wss gateway URL
#     derived from the public origin;
#   - the process is not root and the root filesystem refuses writes;
#   - the client gateway refuses an upgrade from an Origin not on its allowlist;
#   - service only: a provisioning round trip (createAccount, then getAccount)
#     through the private listener, with the operator command line inside the
#     container and a token generated for this run.
# Needs docker, curl, jq and openssl. Every secret it uses is generated here,
# lives in a temporary directory, and is removed on exit; nothing is printed.

set -euo pipefail

image="${1:?usage: smoke.sh <image> <self-hosted|service>}"
profile="${2:?usage: smoke.sh <image> <self-hosted|service>}"
case "$profile" in
  self-hosted|service) ;;
  *) echo "profile must be self-hosted or service" >&2; exit 2 ;;
esac

name="fluxiq-smoke-${profile}-$$"
volume="${name}-data"
secrets="$(mktemp -d)"
panel_port="${SMOKE_PANEL_PORT:-13000}"
gateway_port="${SMOKE_GATEWAY_PORT:-14777}"
origin="https://fluxiq.example.org"

cleanup() {
  local status=$?
  if [ "$status" -ne 0 ] && docker container inspect "$name" >/dev/null 2>&1; then
    echo "--- container log (${name}) ---"
    docker logs "$name" 2>&1 | tail -n 200 || true
  fi
  docker rm --force "$name" >/dev/null 2>&1 || true
  docker volume rm "$volume" >/dev/null 2>&1 || true
  rm -rf "$secrets"
  exit "$status"
}
trap cleanup EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }

# Secrets the container reads as uid 1000 (the image's `node` user).
openssl rand -hex 32 > "$secrets/provisioning-token"
openssl rand -hex 24 > "$secrets/setup-code"
chmod 0444 "$secrets/provisioning-token" "$secrets/setup-code"

run_args=(
  --detach --name "$name"
  --read-only --tmpfs /tmp --tmpfs /app/apps/web/.next/cache
  --volume "$volume:/data"
  --publish "127.0.0.1:${panel_port}:3000"
  --publish "127.0.0.1:${gateway_port}:4777"
  --env "FLUXIQ_PROFILE=${profile}"
  --env "FLUXIQ_PUBLIC_ORIGIN=${origin}"
  --env "FLUXIQ_CLIENT_GATEWAY_ALLOWED_ORIGINS=moz-extension://*"
  --env "FLUXIQ_SETUP_CODE_FILE=/run/secrets/setup_code"
  --volume "$secrets/setup-code:/run/secrets/setup_code:ro"
  # Check health every few seconds here instead of the image's 30, so the
  # smoke does not idle; the command itself is the image's.
  --health-interval 5s
)
if [ "$profile" = "service" ]; then
  run_args+=(
    --env "FLUXIQ_PROVISIONING_LISTEN=0.0.0.0:4780"
    --env "FLUXIQ_PROVISIONING_TOKEN_FILE=/run/secrets/provisioning_token"
    --volume "$secrets/provisioning-token:/run/secrets/provisioning_token:ro"
  )
fi

echo "Starting ${image} as ${profile}"
docker run "${run_args[@]}" "$image" >/dev/null

# Wait for Docker's own health verdict. A container that stops or turns
# unhealthy fails at once; the workflow's job timeout bounds the whole run.
while :; do
  state="$(docker inspect --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' "$name")"
  case "$state" in
    "running healthy") break ;;
    "running starting") sleep 2 ;;
    *) fail "container is '${state}', not running and healthy" ;;
  esac
done
echo "Healthy"

base="http://127.0.0.1:${panel_port}"
expect_status() {
  local want="$1" path="$2" got
  got="$(curl --silent --output /dev/null --write-out '%{http_code}' "${base}${path}")"
  [ "$got" = "$want" ] || fail "${path} answered ${got}, expected ${want}"
  echo "${path}: ${got}"
}

expect_status 200 /api/health
# Health turns green before the runtime finishes starting; ready may lag.
until [ "$(curl --silent --output /dev/null --write-out '%{http_code}' "${base}/api/ready")" = "200" ]; do
  [ "$(docker inspect --format '{{.State.Status}}' "$name")" = "running" ] || fail "container stopped before it was ready"
  sleep 2
done
echo "/api/ready: 200"

discovery="$(curl --silent --fail "${base}/.well-known/fluxiq")" || fail "discovery did not answer 200"
[ "$(jq -r '.instance.profile' <<<"$discovery")" = "$profile" ] || fail "discovery does not name the ${profile} profile"
[ "$(jq -r '.gatewayUrl' <<<"$discovery")" = "wss://fluxiq.example.org/client" ] || fail "discovery does not advertise wss://fluxiq.example.org/client"
echo "Discovery: ${profile}, wss gateway advertised"

[ "$(docker exec "$name" id -u)" != "0" ] || fail "the server runs as root"
if docker exec "$name" sh -c 'touch /app/smoke-write' >/dev/null 2>&1; then fail "the root filesystem accepted a write"; fi
docker exec "$name" sh -c 'touch /data/.smoke-write && rm /data/.smoke-write' || fail "/data is not writable by the server"
echo "Non-root; root filesystem read-only; /data writable"

# An Origin outside the allowlist must not get a WebSocket. The bound only
# matters if the gateway wrongly accepts (an accepted socket stays open).
upgrade="$(curl --silent --http1.1 --max-time 10 --output /dev/null --write-out '%{http_code}' \
  --header 'Connection: Upgrade' --header 'Upgrade: websocket' \
  --header 'Sec-WebSocket-Version: 13' --header "Sec-WebSocket-Key: $(openssl rand -base64 16)" \
  --header 'Origin: https://not-allowed.example' \
  "http://127.0.0.1:${gateway_port}/client" || true)"
[ "$upgrade" != "101" ] || fail "the gateway accepted an Origin outside its allowlist"
echo "Gateway refused a foreign Origin (${upgrade})"

if [ "$profile" = "service" ]; then
  cli=(docker exec "$name" node /opt/fluxiq-gateway-runtime/dist/platform/provisioning/cli/main.js accounts)
  "${cli[@]}" createAccount --email smoke@example.org --display-name "Image smoke" --policy FluxIQUserAccess --workspace new >/dev/null \
    || fail "createAccount over the provisioning listener failed"
  "${cli[@]}" getAccount --email smoke@example.org >/dev/null \
    || fail "getAccount over the provisioning listener failed"
  echo "Provisioning round trip: createAccount, getAccount"
fi

# A clean stop: SIGTERM, the drain, then exit.
docker stop --time 60 "$name" >/dev/null
echo "Stopped: exit code $(docker inspect --format '{{.State.ExitCode}}' "$name")"
echo "PASS: ${image} (${profile})"
