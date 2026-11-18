# Service bootstrap with multi tenancy

- Role: heavy worker, gpt-6.1-sol, max; no agents/git.
- Goal: reproduce and fix service first-owner setup after production composition was correctly switched to multi tenancy.
- Own: apps/web/src/server/owner-claim/**, app/setup/**, own report reports/service-owner-bootstrap.md. Do not edit shared docs or any Core package; report needed changes outside this partition.
- Read Current State, owner claim implementation/tests, app setup submit route, provisioning createAccount policy checks, platform-services composition and workspace routing as needed.
- Root evidence: claimOwner requests FluxIQOwnerFullAccess with workspace=new; multi-tenancy provisioning explicitly forbids OwnerFullAccess. Prior owner tests use single tenancy, while web runtime tests mock prepareOwnerClaim. Service setup must be proven with a REAL multi-tenancy composition.
- Local/self-hosted owner bootstrap and security marker/code lifecycle must remain unchanged. Do not weaken multi-tenant policy rejection or allow customers into the primary control workspace.
- Candidate: service bootstrap creates its initial administrator in a personal tenant using provisionable administrator access; platform operations continue through the private provisioning authority. Inspect whether that is coherent before implementing, and send the exact chosen semantics early.
- Preserve password checks, owner claim serialization/idempotency, private setup code, marker durability, default-admin retirement and safe failure reporting; no secrets in logs or reports.
- Never claim a marker after failed creation or leave a successful result that cannot log in/reach its own tenant. Tests must distinguish service from local/self-hosted and cover repeated concurrent claim.
- Do not alter general provisioning composition (lead-owned) or role grants outside this bootstrap partition. If a platform operator identity truly requires a separate Core capability, report rather than granting cross-tenant authority ad hoc.
- Web tests require a fresh Core build; root is preparing it. Write/inspect now and wait for build signal before running focused tests. No whole suites, servers, paid calls or user-state reads.
- End with standard Outcome/Changed/Validation/Not verified/Report/Notes and exact acceptance evidence.
