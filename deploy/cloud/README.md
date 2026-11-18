# Portable Core deployment

The AWS, Google Cloud and Azure Terraform entrypoints provision one Ubuntu
24.04 amd64 VM, a stable public IPv4 address, an encrypted retained state disk
and an identity allowed to read one existing runtime configuration secret.
Every provider boots the same digest-pinned Core/Caddy release bundle. The
landing website remains in its own repository.

This deploys the **Core control plane**. It does not package the downstream
browser product or a managed browser worker. It is a single-VM deployment
without high availability. Service-profile tenant isolation and commercial
execution still need their separate application acceptance.

Read the [operator guide](../../docs/operations/cloud-portability.md) before
using these entrypoints. It describes release assembly, secret configuration,
required cloud inputs, launch, backup, recovery and remaining live checks.
Examples deliberately contain invalid digest/image/secret placeholders.

Provider-free checks from the repository root:

```sh
node --test deploy/cloud/release/tests/release.test.mjs deploy/cloud/runtime/tests/host-config.test.mjs
python3 -m unittest discover -s deploy/cloud/runtime/tests -p 'test_*.py' -v
bash -n deploy/cloud/runtime/install.sh deploy/cloud/runtime/mount-data.sh deploy/cloud/runtime/metadata-guard.sh deploy/cloud/release/launch.sh
terraform fmt -check -recursive deploy/cloud
terraform -chdir=deploy/cloud/aws init -backend=false -input=false
terraform -chdir=deploy/cloud/aws validate
terraform -chdir=deploy/cloud/gcp init -backend=false -input=false
terraform -chdir=deploy/cloud/gcp validate
terraform -chdir=deploy/cloud/azure init -backend=false -input=false
terraform -chdir=deploy/cloud/azure validate
```

To verify the actual merged Compose configuration without a Docker engine,
set `FLUXIQ_COMPOSE_TEST_BINARY` to a standalone Docker Compose executable and
run `node --test deploy/cloud/release/tests/compose.test.mjs`. These two tests
explicitly skip without that executable; a skip is not Compose validation.
Terraform initialization downloads public provider schemas and uses the
tracked provider lockfiles; it does not configure a state backend or contact
a cloud account. No check above provisions infrastructure.
