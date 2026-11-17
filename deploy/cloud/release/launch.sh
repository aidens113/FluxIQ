#!/usr/bin/env bash
set -euo pipefail
umask 077
release_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
profile="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["profile"])' "$release_dir/manifest.json")"
case "$profile" in self-hosted|service) ;; *) echo 'Invalid release profile' >&2; exit 1 ;; esac
export FLUXIQ_ENV_FILE=/etc/fluxiq/runtime.env
export FLUXIQ_SECRETS_DIR=/etc/fluxiq/secrets
export CADDYFILE="$release_dir/deploy/caddy/Caddyfile.example"
compose=(docker compose --project-name fluxiq-cloud -f "$release_dir/deploy/compose/$profile.compose.yml" -f "$release_dir/cloud.compose.json")
case "${1:-up}" in
  up)
    # Do not print `compose config`: resolved configuration can contain private settings.
    "${compose[@]}" config --quiet
    "${compose[@]}" pull --quiet
    # Recreate so updated bind-mounted secret files and the environment take effect together.
    "${compose[@]}" up -d --no-build --force-recreate --wait
    ;;
  stop|start|ps) "${compose[@]}" "$1" ;;
  verify)
    origin="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["FLUXIQ_PUBLIC_ORIGIN"])' /etc/fluxiq/environment.json)"
    curl --proto '=https' --tlsv1.2 --fail --silent --show-error --max-time 30 --output /dev/null "$origin/api/ready"
    curl --proto '=https' --tlsv1.2 --fail --silent --show-error --max-time 30 --output /dev/null "$origin/.well-known/fluxiq"
    ;;
  *) echo 'Usage: launch.sh up|stop|start|ps|verify' >&2; exit 1 ;;
esac
