#!/usr/bin/env bash
set -euo pipefail
umask 077
config="$1"
disk="$(python3 - "$config" <<'PY'
import json, subprocess, sys
config = json.load(open(sys.argv[1]))
if config['provider'] == 'aws':
    # Nitro exposes the EBS volume id as the serial; never infer a disk by position/size.
    devices = json.loads(subprocess.check_output(['lsblk', '--json', '--output', 'PATH,TYPE,SERIAL']))['blockdevices']
    expected = config['data_volume_id'].replace('-', '')
    candidates = [d['path'] for d in devices if d['type'] == 'disk' and (d.get('serial') or '').replace('-', '').strip() == expected]
    if len(candidates) != 1:
        sys.exit('Configured EBS disk is not attached unambiguously yet')
    print(candidates[0])
else:
    print(config['data_device'])
PY
)"
test -b "$disk"
test "$(lsblk --noheadings --nodeps --output TYPE "$disk")" = disk
test "$(lsblk --noheadings --output TYPE "$disk" | wc -l)" -eq 1
mkdir -p /srv/fluxiq
if filesystem="$(blkid -p -s TYPE -o value "$disk")"; then
  :
else
  probe_status=$?
  # blkid 2 means no recognized signature; other probe failures are never treated as a blank disk.
  test "$probe_status" -eq 2
  filesystem=''
fi
if [ -z "$filesystem" ]; then
  # Only a raw, unused disk with no known signatures may be initialized.
  signatures="$(wipefs --no-act --noheadings --output TYPE "$disk")"
  test -z "$signatures"
  test -z "$(findmnt --noheadings --source "$disk" || true)"
  mkfs.ext4 -q -L fluxiq-data "$disk"
elif [ "$filesystem" != ext4 ]; then
  echo 'Configured state disk has an unexpected filesystem; refusing to format it' >&2
  exit 1
fi
uuid="$(blkid -s UUID -o value "$disk")"
test -n "$uuid"
if mountpoint -q /srv/fluxiq; then
  test "$(findmnt --noheadings --output UUID --target /srv/fluxiq)" = "$uuid"
else
  # Never obscure files previously written to the root disk at this path.
  existing_file="$(find /srv/fluxiq -mindepth 1 -maxdepth 1 -print -quit)"
  test -z "$existing_file"
  mount -o nodev,nosuid "$disk" /srv/fluxiq
fi
if awk '$2 == "/srv/fluxiq" {found=1} END {exit !found}' /etc/fstab; then
  awk -v expected="UUID=$uuid" '$2 == "/srv/fluxiq" && $1 != expected {exit 1}' /etc/fstab
else
  printf 'UUID=%s /srv/fluxiq ext4 defaults,nodev,nosuid,nofail 0 2\n' "$uuid" >> /etc/fstab
fi
chmod 0700 /srv/fluxiq
install -d -m 0700 -o 1000 -g 1000 /srv/fluxiq/core
install -d -m 0700 /srv/fluxiq/caddy-data /srv/fluxiq/caddy-config
