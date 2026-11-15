#!/usr/bin/env bash
set -euo pipefail
umask 077
runtime=/opt/fluxiq-bootstrap
config=/etc/fluxiq-bootstrap.json
test "$(id -u)" -eq 0
export DEBIAN_FRONTEND=noninteractive

# Images must be Ubuntu 24.04 LTS amd64 with cloud-init and systemd.
. /etc/os-release
test "$ID" = ubuntu
test "$VERSION_ID" = 24.04
test "$(dpkg --print-architecture)" = amd64
if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg python3 iptables
  install -m 0755 -d /etc/apt/keyrings
  curl --proto '=https' --tlsv1.2 --fail --silent --show-error https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  printf 'deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu noble stable\n' > /etc/apt/sources.list.d/fluxiq-docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi
provider="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["provider"])' "$config")"
if [ "$provider" = aws ] && ! command -v aws >/dev/null; then
  # Ubuntu's repository owns and updates this host package; no credentials enter the install.
  apt-get update -qq
  apt-get install -y -qq awscli
fi
install -d -m 0755 /etc/systemd/system/docker.service.d
cat > /etc/systemd/system/fluxiq-metadata-guard.service <<'UNIT'
[Unit]
Description=Block cloud metadata identity from FluxIQ bridge containers
Before=docker.service
[Service]
Type=oneshot
ExecStart=/bin/bash /opt/fluxiq-bootstrap/metadata-guard.sh
RemainAfterExit=yes
[Install]
WantedBy=multi-user.target
UNIT
cat > /etc/systemd/system/docker.service.d/fluxiq-metadata-guard.conf <<'UNIT'
[Unit]
Requires=fluxiq-metadata-guard.service fluxiq-state-guard.service
After=fluxiq-metadata-guard.service fluxiq-state-guard.service
RequiresMountsFor=/srv/fluxiq
UNIT
cat > /etc/systemd/system/fluxiq-state-guard.service <<'UNIT'
[Unit]
Description=Require the configured FluxIQ persistent disk before Docker starts
Before=docker.service
RequiresMountsFor=/srv/fluxiq
[Service]
Type=oneshot
ExecStart=/bin/bash /opt/fluxiq-bootstrap/mount-data.sh /etc/fluxiq-bootstrap.json
RemainAfterExit=yes
UNIT
systemctl daemon-reload
systemctl enable fluxiq-metadata-guard.service
systemctl start fluxiq-metadata-guard.service
bash "$runtime/mount-data.sh" "$config"
# mount-data may have added fstab: resolve RequiresMountsFor against the new mount unit.
systemctl daemon-reload
systemctl start fluxiq-state-guard.service
systemctl start docker.service

work="$(mktemp -d /run/fluxiq-bootstrap.XXXXXXXX)"
trap 'rm -rf -- "$work"' EXIT
release_url="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["release_url"])' "$config")"
release_sha="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["release_sha256"])' "$config")"
curl --proto '=https' --proto-redir '=https' --tlsv1.2 --fail --silent --show-error --location "$release_url" -o "$work/release.tar.gz"
printf '%s  %s\n' "$release_sha" "$work/release.tar.gz" | sha256sum --check --status
python3 "$runtime/extract-release.py" "$work/release.tar.gz" "$work/release"
python3 "$runtime/fetch-config.py" "$config" > "$work/config.json"
profile="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["profile"])' "$work/release/manifest.json")"
python3 "$runtime/write-config.py" "$work/config.json" "$profile"
install -d -m 0700 /opt/fluxiq/releases
release_dir="/opt/fluxiq/releases/$release_sha"
if [ ! -d "$release_dir" ]; then
  # /run and /opt can be different filesystems: publish via a private staging directory on /opt.
  staging="$(mktemp -d /opt/fluxiq/releases/.install.XXXXXXXX)"
  cp -R "$work/release/." "$staging/"
  mv -T "$staging" "$release_dir"
fi
ln -sfn "$release_dir" /opt/fluxiq/current
bash "$release_dir/launch.sh" up
echo 'FluxIQ containers started. Verify public HTTPS readiness after DNS resolves.'
