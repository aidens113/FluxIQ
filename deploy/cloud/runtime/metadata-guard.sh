#!/usr/bin/env bash
set -euo pipefail
# Run before Docker on every boot, including when its restart policies restore containers.
# The host uses metadata for bootstrap; bridge containers must never inherit that identity.
for command in iptables ip6tables; do
  "$command" --wait -n -L DOCKER-USER >/dev/null 2>&1 || "$command" --wait -N DOCKER-USER
  "$command" --wait -C FORWARD -j DOCKER-USER 2>/dev/null || "$command" --wait -I FORWARD 1 -j DOCKER-USER
done
iptables --wait -C DOCKER-USER -d 169.254.169.254/32 -j DROP 2>/dev/null || iptables --wait -I DOCKER-USER 1 -d 169.254.169.254/32 -j DROP
for address in fd00:ec2::254/128 fd20:ce::254/128; do
  ip6tables --wait -C DOCKER-USER -d "$address" -j DROP 2>/dev/null || ip6tables --wait -I DOCKER-USER 1 -d "$address" -j DROP
done
