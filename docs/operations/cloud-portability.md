# Cloud portability

`deploy/cloud` runs the same Core image and existing Compose/Caddy deployment
on AWS, Google Cloud or Azure. Provider files own networking, VM, retained
disk, cloud identity and bootstrap references. Account, tenant, billing and
authorization behavior stays in Core. The landing site in
[`FluxIQWebsite`](https://github.com/aidens113/FluxIQWebsite) remains a separate
repository and release; it is not copied into the Core image. The app can use
`app.getfluxiq.com` while that site keeps the main domain.

This package deploys the Core panel, API and client gateway. It does not
include this project's downstream browser product, a browser-worker image,
browser profiles or browser-domain registration. Connecting an external
browser client remains a separate product deployment. A service-profile VM
does not establish multi-tenant or paid-execution readiness: C2/C3 application
isolation, account lifecycle, entitlement and execution acceptance are
separate rollout gates.

## Common deployment contract

| Concern | Contract on every provider |
| --- | --- |
| Host | Ubuntu 24.04 LTS amd64, cloud-init, systemd, Docker Engine with its iptables backend and Compose plugin |
| Release | Public Core and Caddy images pinned by SHA-256; one five-file bundle shared unchanged between clouds |
| Public edge | Stable IPv4; TCP 80 for certificate challenge/redirect and TCP 443 for HTTPS/WebSocket |
| Private services | Core 3000, gateway 4777 and optional provisioning 4780 are never published by the application service or admitted by the cloud firewall |
| State | A separate encrypted block disk at `/srv/fluxiq`; Core `/data` binds `/srv/fluxiq/core`; Caddy state/config use sibling directories |
| Secrets | One existing provider secret read by VM identity, then root-private host files and read-only Compose secret mounts; no values in Terraform or user-data |
| Readiness | `/api/health` is liveness; public HTTPS `/api/ready` and `/.well-known/fluxiq` must succeed after DNS/TLS |
| Recovery | Stop Core before a consistent encrypted backup; retain off-VM copies and prove a restore |

The unchanged Compose files also publish Caddy UDP 443 for HTTP/3 on the host;
these cloud firewalls intentionally admit only TCP. Clients use HTTPS over
TCP. No SSH, Docker API, debug, gateway or provisioning ingress is created.
The service provisioning network remains internal to Docker, so a website on
another host cannot call its private listener over the public internet.
Use Core's supported public account APIs or design an authenticated private
backend path separately; never publish 4780 for the landing site.

Docker's startup dependencies require the configured disk's actual mount and
identity, plus a metadata firewall guard. This prevents restart-policy
containers from booting against an empty root-disk directory if the state
disk is missing. The guard drops container access to `169.254.169.254`, AWS's
`fd00:ec2::254` and Google's `fd20:ce::254`. AWS also requires IMDSv2, uses hop
limit 1 and disables IPv6 metadata. Bridge networking must stay in use;
host-network containers would bypass this boundary. Docker documents its
[iptables/DOCKER-USER requirement](https://docs.docker.com/engine/install/ubuntu/),
and Google documents its [metadata addresses](https://docs.cloud.google.com/compute/docs/metadata/overview).

The package uses one VM and local SQLite/state ownership. It supports planned
downtime, not active-active replicas or zero-downtime upgrades. Retained disks
have Terraform `prevent_destroy`; that protects against routine destroy and
replacement but is not a backup. Select capacity, disk size, region and backup
policy for the actual workload; example machine types are not cost or
capacity guarantees.

## Prepare one public release

First build and smoke-test the existing Core container on a machine with
Docker, using [self-hosting](self-hosting.md). A release must pin the Dockerfile's
`NODE_IMAGE` build argument by digest and target `linux/amd64`. Publish the
tested Core image to an operator-owned public registry and obtain its actual
digest. Obtain the Caddy digest for the same platform. This package does not
publish images, select a registry or add a production CI deployment target.

Copy `deploy/cloud/release/manifest.example.json` to a private release working
directory and replace its invalid placeholders. Select `service` or
`self-hosted` explicitly. The manifest validator rejects mutable image tags,
placeholder digests, local profile, unsupported platform and unknown fields.
Build a new output directory from the repository root:

```sh
node deploy/cloud/release/build.mjs /secure/release-manifest.json /secure/fluxiq-release
tar -C /secure/fluxiq-release -czf /secure/fluxiq-release.tar.gz .
sha256sum /secure/fluxiq-release.tar.gz
```

Publish that archive at a public HTTPS URL and record its SHA-256 through the
trusted release process. Supply the identical URL and hash to whichever
provider is selected. Credentials, signed URL query strings and fragments are
not accepted. A checksum proves integrity relative to the chosen hash; the
operator still has to trust how the release and hash were produced.

The bundle contains its manifest, launcher, generated image/state overlay,
the selected original Compose file, and the original Caddyfile. It contains
no configuration secrets. The overlay fixes images even if the operator's
shell defines mutable `FLUXIQ_IMAGE` or `CADDY_IMAGE`. The launcher always uses
`--no-build`. On the VM, the verified archive is unpacked only after paths,
regular-file types, duplicates and the exact expected file set are checked;
symlinks, hardlinks and path traversal are refused.

The image SHA is separate from discovery's optional
`runtime.artifactDigest`, which describes built JavaScript provenance under
`fluxiq.core-runtime-identity.v1`. Discovery protocol support and
`minimumClient` determine client compatibility; container and JavaScript
digests are not interchangeable version gates. Keep `FLUXIQ_INSTANCE_ID`
stable across restart and recovery because SDK proof audiences bind to it.

## Prepare runtime configuration outside Terraform

Copy `deploy/cloud/runtime/config.example.json` into a private location
outside the checkout. Replace the origin, hostname, ACME email, exact browser
extension origins and stable instance id. Add real randomly generated
provisioning token/setup-code values for `service`. Self-hosted configuration
uses an empty `secrets` object, or only `email-api-key`; Core generates its own
owner setup code. The service token is at least 32 bytes; the setup code is at
least 16 characters. Never put real values into this example, Terraform
variables, shell history or chat.

Service configuration also requires `secrets.secret-keyring`, a JSON string with
`version: 1`, a `currentKeyId`, and a `keys` map from version IDs to canonical
base64-encoded 32-byte random keys. Generate it privately; the checked-in example
is deliberately invalid. The service mounts it at `/run/secrets/secret_keyring`
and selects that path with `FLUXIQ_SECRET_KEYS_KEYRING_FILE`. It protects the
per-record encryption keys needed for authenticated model use after restart.
There is no separate client unlock step. Missing or invalid protection causes
an explicit unavailable result rather than silently generating a replacement.

Back up this keyring separately and restore it with the database. Retain all old
key IDs while any record still uses them; choosing a new current ID alone does
not migrate every stored wrap. No automatic retirement command is provided.
Self-hosted local protection has its own persisted keyring; include that in
backup as well. See [Model keys](../architecture/platform.md#model-keys).

`environment` accepts only the named public settings in `write-config.py`;
runtime/profile overrides and environment credentials fail validation.
Values are serialized as literal Compose env-file entries, never sourced or
evaluated by a shell. `/etc/fluxiq` is root-private, runtime environment files
are mode 0600 and secret files mode 0400 owned by container uid 1000. The
fetched raw payload exists briefly under root-private `/run` and is removed
after bootstrap. The encrypted OS disk holds the installed private files;
root and the cloud's privileged VM operators are trusted.

For real email, set `FLUXIQ_EMAIL_SENDER=resend`, a verified `FLUXIQ_EMAIL_FROM`
and `secrets.email-api-key`. The overlay mounts it at
`/run/secrets/email_api_key`. The `file` example is an outbox for development,
not evidence of production delivery. See [production email](self-hosting.md#production-email).

Upload the private JSON through the provider CLI's file-input mechanism, not
through Terraform secret resources/data sources or plaintext command-line
arguments. These are operator-run examples that create/update paid-service
resources; none were executed while implementing this package:

```sh
# AWS: outputs only the secret ARN, not its value.
aws secretsmanager create-secret --region YOUR_REGION --name fluxiq-runtime \
  --secret-string file:///secure/runtime-config.json --query ARN --output text

# Google Cloud: the secret must already exist in the selected project.
gcloud secrets versions add fluxiq-runtime --project YOUR_PROJECT \
  --data-file=/secure/runtime-config.json

# Azure: vault must already exist and use Key Vault RBAC. Output only its versioned id.
az keyvault secret set --vault-name YOUR_VAULT --name fluxiq-runtime \
  --file /secure/runtime-config.json --encoding utf-8 --query id --output tsv
```

These file-input interfaces are documented by
[AWS](https://docs.aws.amazon.com/secretsmanager/latest/userguide/create_secret.html),
[Google](https://docs.cloud.google.com/sdk/gcloud/reference/secrets/versions/add)
and [Azure](https://learn.microsoft.com/en-us/azure/key-vault/secrets/multiline-secrets).
Disable CLI debug/HTTP tracing and do not print fetched payloads. Use normal
cloud audit controls that record access metadata rather than secret contents.
Public release images need no registry credential; private registries and
sovereign cloud endpoints are not implemented by these entrypoints.

## Select a provider

Each directory is an independent Terraform root. Copy its
`operator.tfvars.example` to ignored `operator.tfvars` and supply real
nonsecret inputs. Use normal provider SSO/CLI/workload-identity authentication;
no cloud credentials belong in variables. Before a real deployment, add an
ignored `backend.local.tf` for an approved encrypted, access-controlled state
backend with locking. Keep backend credentials outside configuration, and
keep the generated dependency lockfiles under version control. Local state,
plans, provider caches, crash logs and operator inputs are ignored.

| Provider root | Required operator inputs and behavior |
| --- | --- |
| `deploy/cloud/aws` | Commercial AWS account authentication; explicit region/AZ; pinned Ubuntu 24.04 amd64 AMI; x86_64 Nitro instance type; existing same-region/account Secrets Manager ARN; optional customer-managed secret KMS key ARN and supporting key policy. Creates VPC/subnet, TCP edge security group, EC2 role/profile, VM, Elastic IP and encrypted gp3 state volume. Nitro's volume serial identifies the state disk. |
| `deploy/cloud/gcp` | Project and API-enabling/IAM permission; explicit region/zone, amd64 machine type and pinned `ubuntu-os-cloud` image; existing same-project secret name and numeric version. Creates custom VPC/subnet, TCP edge firewall, service account, VM, static IP and encrypted pd-balanced disk. Only that secret gets Secret Accessor; OAuth scope is `cloud-platform` as required by Secret Manager. |
| `deploy/cloud/azure` | Subscription and RBAC-assignment permission; explicit location, Trusted Launch/SCSI-capable amd64 VM size, pinned Canonical Ubuntu 24.04 Gen2 image version and an existing public SSH key required by Azure's VM API; RBAC-enabled Key Vault ARM id, secret name and explicit version. Creates resource group, VNet/subnet, restrictive NSG, user-assigned identity, VM, static IP and encrypted managed disk at LUN 0. A secret-scoped Secrets User role does not grant vault-wide access. |

Google's [cloud-init metadata](https://ubuntu.com/blog/deploy-fully-configured-vms-in-minutes-on-google-cloud-using-gcloud-cli-and-cloud-init)
and [secret access scope](https://docs.cloud.google.com/secret-manager/docs/access-secret-version),
Azure's [Ubuntu image names](https://ubuntu.com/azure/docs/azure-how-to/find-ubuntu-images/)
and [secret-scoped RBAC](https://learn.microsoft.com/en-us/azure/key-vault/general/rbac-guide)
describe the provider prerequisites. Bootstrap fetches Azure secrets with its
[Get Secret API](https://learn.microsoft.com/en-us/rest/api/keyvault/secrets/get-secret/get-secret?view=rest-keyvault-secrets-2025-07-01).
AWS user-data is gzip-compressed cloud-init to fit the
[16 KiB request limit](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/user-data.html).

When ready to incur infrastructure costs, initialize the selected root,
review a saved Terraform plan using the private operator inputs, and apply
that reviewed plan through the organization's normal deployment process.
Bootstrap installs host packages from Ubuntu/Docker repositories, mounts
only the configured state disk, verifies the public release archive, fetches
its configuration with VM identity and starts the pinned containers. Host
packages remain distribution-managed; only application/proxy images and
release contents are pinned by this contract.

## Launch acceptance and operation

Set an A record for the configured host to Terraform's `public_ip` output.
Do not add an AAAA record for these IPv4 entrypoints. Check public HTTPS
`/api/ready` and `/.well-known/fluxiq`, then sign-in, exact-Origin rejection,
gateway WebSocket, SDK audience identity and the intended client behavior.
Infrastructure completion and Docker liveness alone are not acceptance.
On the VM, an authorized private operator session can run:

```sh
sudo bash /opt/fluxiq/current/launch.sh verify
sudo systemctl status fluxiq-bootstrap.service fluxiq-state-guard.service fluxiq-metadata-guard.service
```

No public admin connection is included. Establish an account-controlled
management path (for example a separately configured provider agent/Run
Command or approved private access) before production use. The templates do
not grant public SSH as a debugging shortcut. Bootstrap failures appear in
the systemd journal as generic messages; never use shell tracing, print the
configuration secret, dump resolved Compose configuration or export runtime
state to diagnose one. Cloud-init starts a supervised retrying systemd unit,
so an initially delayed disk/identity assignment can recover. Alert on failure
instead of treating an endlessly failing bootstrap as deployed.

Before upgrading, stop the existing application cleanly and take a consistent
encrypted backup of `/srv/fluxiq/core`, including accounts, workspaces, keys,
audit and SQLite files. Retain configuration/secret recovery separately under
operator control. Copy encrypted backups off the VM and test recovery; disk
retention and snapshots alone do not prove application-consistent recovery.
Use [self-hosting backup/restore semantics](self-hosting.md#backups), adjusting
the source from a named Docker volume to this bind-mounted directory.

Changing release references or bootstrap content replaces the VM while
retaining state disk and public IP. GCP has an explicit bootstrap-revision
replacement trigger because updating metadata alone does not rerun cloud-init.
Allow downtime and verify readiness afterwards. Secrets are reread on VM boot
or an authorized restart of `fluxiq-bootstrap.service`; the launcher recreates
containers so new file mounts and environment take effect. AWS uses the
secret's current version, while GCP/Azure references pin explicit versions.

For rollback after a storage change, restore the stopped pre-upgrade backup
and its previous image; do not assume a reverse migration. For movement to
another cloud, restore the logical encrypted backup to that provider's state
disk with Core stopped, carry over the stable instance id and selected
configuration securely, verify there, then change DNS. Provider block-volume
snapshots themselves are not a cross-cloud storage format.

An authorized cloud acceptance run must still prove cold boot, reboot with
the retained disk, startup refusal with a missing/wrong disk, secret access
boundaries, metadata denial from containers, TLS renewal, WebSocket reconnect,
backup/restore and a real image upgrade/rollback on each provider. No cloud
deployment, secret retrieval, VM boot, Docker image build or container smoke
was performed for this package's provider-free validation. Terraform schema
checks and Compose merge tests do not certify those behaviors.
