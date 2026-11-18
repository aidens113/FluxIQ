# Cloud portability implementation

Delivered three independent Terraform VM entrypoints under `deploy/cloud`
plus one provider-neutral, digest-pinned release bundle built from the
existing Core Compose and Caddy files. The landing website stays in its
separate repository. No existing deployment asset, application/package,
workflow, shared working document or git state was changed by this worker.

## Implemented boundary

- AWS: dedicated VPC/subnet, TCP 80/443 security group, VM role/profile,
  explicit Ubuntu AMI/Nitro machine inputs, static Elastic IP, encrypted gp3
  state disk, IMDSv2/hop-limit 1/IPv6-metadata disabled, exact-secret read
  permission and optional secret KMS decrypt permission. State detach stops
  the VM first; state volume has `prevent_destroy`.
- Google Cloud: dedicated VPC/subnet, TCP 80/443 firewall, explicit pinned
  Ubuntu image/machine/region/zone, static IP, shielded VM, retained encrypted
  pd-balanced disk, service account with Secret Accessor on only the named
  secret, explicit numeric secret version and bootstrap-change VM replacement.
- Azure: resource group/VNet/subnet, NSG allowing edge TCP only and explicitly
  denying other inbound traffic (including default VNet ingress), static IP,
  Trusted Launch/SCSI VM, user-assigned identity, retained encrypted managed
  disk and secret-scoped Key Vault Secrets User assignment. Only an existing
  public SSH key enters variables because Azure requires one; port 22 stays closed.
- Shared bootstrap: nonsecret references in cloud-init; VM identity fetches
  one pre-existing configuration secret. Secret values never enter Terraform,
  user-data, command arguments or diagnostics. Payload errors are generic;
  fetched data stays briefly on private `/run`, then private host files and
  read-only secret mounts. Config does not use shell eval/source.
- Shared release contract: schema 1, explicit service/self-hosted profile,
  `linux/amd64`, real SHA-256-pinned Core and Caddy images. One public archive
  URL plus trusted archive hash works on all providers. Its five-file bundle
  preserves original Compose/private provisioning/Caddy behavior. Extraction
  rejects traversal, absolute paths, duplicates, links and special files.
- Boot ordering: Docker requires state/metadata guards and the state mount.
  The state guard checks actual disk identity and mounted UUID, refuses
  unexpected signatures/filesystems and fails closed on disk-probe errors.
  IPv4 and AWS/Google IPv6 metadata addresses are denied to bridge containers.
  Missing state must not cause fresh customer state on the OS disk.
- Ignore rules exclude nested provider caches, state/backups, plans, actual
  tfvars, backend inputs, crash logs, fetched/runtime secret artifacts and
  archives; the three generated provider lockfiles are intended source.

This is the Core control plane only. It does not deploy the downstream web
product/browser worker or claim C2/C3 multi-tenancy/commercial execution
acceptance. It is a single-VM deployment with planned downtime, no active-active
state, no automatic backup service and no production CI publisher. Host apt
packages remain distribution-managed; application/proxy images and release
archive are immutable by contract. Docker Engine/Compose installation itself
and systemd/firewall enforcement were not exercised on a VM here.

## Validation actually observed

Tools were initially absent from PATH. Terraform 1.13.5 Windows amd64 was
downloaded from HashiCorp to `%TEMP%/fluxiq-cloud-terraform-1.13.5`, verified
against its published SHA256SUMS, then used without a backend or cloud
credentials. Standalone Compose v2.40.3 was downloaded to
`%TEMP%/fluxiq-cloud-compose-2.40.3` and verified against the Docker release's
checksums before execution. Docker/Podman engines were unavailable.

- `terraform fmt -check -recursive deploy/cloud` -> exit 0 after formatting two provider files.
- `terraform -chdir=deploy/cloud/aws init -backend=false -input=false -no-color` -> success, HashiCorp-signed AWS 6.73.0, dependency lock generated.
- `terraform -chdir=deploy/cloud/gcp init -backend=false -input=false -no-color` -> success, HashiCorp-signed Google 6.50.0, dependency lock generated.
- `terraform -chdir=deploy/cloud/azure init -backend=false -input=false -no-color` -> success, HashiCorp-signed AzureRM 4.81.0, dependency lock generated.
- `terraform -chdir=deploy/cloud/aws validate -no-color` -> `Success! The configuration is valid.`
- `terraform -chdir=deploy/cloud/gcp validate -no-color` -> `Success! The configuration is valid.`
- `terraform -chdir=deploy/cloud/azure validate -no-color` -> `Success! The configuration is valid.`
- `node --test deploy/cloud/release/tests/release.test.mjs deploy/cloud/release/tests/compose.test.mjs deploy/cloud/runtime/tests/host-config.test.mjs`, with `FLUXIQ_COMPOSE_TEST_BINARY` pointing to the verified standalone executable -> 7 passed, 0 failed, 0 skipped.
- `python -m unittest discover -s deploy/cloud/runtime/tests -p 'test_*.py' -v` -> 12 tests, `OK`; hostile paths/links/types, payload validation/redaction and mocked provider identity request contracts passed. POSIX permission assertions intentionally run only on POSIX; the Windows run did not prove Linux ownership/modes.
- `bash -n deploy/cloud/runtime/install.sh deploy/cloud/runtime/mount-data.sh deploy/cloud/runtime/metadata-guard.sh deploy/cloud/release/launch.sh` using `C:/Program Files/Git/bin/bash.exe` -> exit 0.
- Provider-free Terraform `console` against a temporary local module referencing the actual bootstrap -> representative rendered cloud-init 26,415 bytes, gzip input 11,002 bytes, below EC2's 16,384-byte request limit. No Terraform plan/apply was run. Initial temporary fixture BOM/absolute-module-copy setup errors were corrected before the successful render.

The Compose tests used the actual v2.40.3 parser, not a YAML mock. Both
profiles retained exact Core/Caddy digest pins despite mutable shell image
overrides, hardened read-only Core runtime, private app ports, one bind mount
at `/data`, the email secret mount and service-only internal provisioning
network/secrets. These tests do not start a container. The initial release
test had an incorrect relative fixture path; that was fixed before all passing
runs. Generated-unit regression tests verify disk/metadata dependency
configuration; they do not prove kernel/systemd enforcement.

No provider account API, paid service/model call, infrastructure creation,
container build, panel server, production secret retrieval or live release
publication was performed. No repository-wide check was run by this worker;
the supervisor owns integration and final verification while other editors
continue package/application work.

## Operator inputs and outstanding live acceptance

The operator still selects account/project/subscription, region/zone, machine
capacity, exact supported base-image version, public DNS/ACME email, public
image registry/release URL and trusted digests, existing provider secret with
real private config, protected state backend, privileged management path and
encrypted off-VM backup/recovery policy. Azure also needs a public key and
Key Vault RBAC assignment permission; AWS customer-managed secret KMS keys
need a supporting key policy. Examples contain invalid placeholders.

Before a production claim: build/smoke the real Core image, deploy in each
chosen cloud, prove initial/cold boot, reboot/retained disk, missing/wrong disk
startup refusal, secret permissions, container metadata denial, DNS/TLS
renewal, readiness/discovery, WebSocket behavior, image upgrade/rollback and
consistent backup/restore. Browser-worker product deployment and C2/C3
application acceptance remain separate gates. No vendor deployment is certified.

## Primary references checked

- Terraform resource schemas: [AWS instance](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/instance), [AWS volume attachment](https://raw.githubusercontent.com/hashicorp/terraform-provider-aws/main/website/docs/r/volume_attachment.html.markdown), [Google instance](https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/compute_instance), [Azure Linux VM](https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs/resources/linux_virtual_machine).
- Metadata/identity/secret behavior: [Google access secret version](https://docs.cloud.google.com/secret-manager/docs/access-secret-version), [Google metadata](https://docs.cloud.google.com/compute/docs/metadata/overview), [Azure Get Secret](https://learn.microsoft.com/en-us/rest/api/keyvault/secrets/get-secret/get-secret?view=rest-keyvault-secrets-2025-07-01), [Azure secret-scoped RBAC](https://learn.microsoft.com/en-us/azure/key-vault/general/rbac-guide).
- Host/provider prerequisites: [Docker Ubuntu installation/firewall](https://docs.docker.com/engine/install/ubuntu/), [GCE cloud-init](https://ubuntu.com/blog/deploy-fully-configured-vms-in-minutes-on-google-cloud-using-gcloud-cli-and-cloud-init), [Azure Ubuntu image names](https://ubuntu.com/azure/docs/azure-how-to/find-ubuntu-images/), [Azure disk identification](https://learn.microsoft.com/en-us/azure/virtual-machines/linux/add-disk), [AWS cloud-init gzip](https://aws.amazon.com/blogs/developer/best-practices-for-local-file-parameters/), [EC2 user-data limits](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/user-data.html).

Outcome: Done
Changed: `deploy/cloud/**`, `docs/operations/cloud-portability.md`, this report.
Validation: Terraform fmt + all 3 provider validates -> pass; 7 Node tests -> pass/no skips; 12 Python tests -> OK; Bash syntax -> exit 0; real shared cloud-init Terraform render -> 11,002-byte gzip fixture.
Not verified: Cloud deployment/VM boot, Linux ownership/systemd/firewall enforcement, real secret retrieval, Docker build/smoke, browser-worker product or C2/C3 acceptance; integration checks belong to lead.
Report: `docs/working/hosted-platform-launch-plan/reports/cloud-portability.md`
Notes: No git, paid calls, provisioning or shared-source edits. Container SHA is distinct from discovery JavaScript artifactDigest. Landing website remains independent.
