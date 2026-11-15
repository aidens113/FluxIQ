# First-project admission and creator repair

Outcome: Done for read-only design. No production implementation or runtime acceptance is claimed.

The smallest coherent next unit is a Core prerequisite against the **live** project writer: trusted per-call admission, an exact durable bootstrap identity, and creator completion through the existing project/ownership stores. Integrate the tenant HTTP route only after that Core unit passes and its dependency outputs are rebuilt. Do not activate the separate canonical writer as part of this work.

## Correction to the preceding discovery

`remaining-gateway-mutations.md`, first-project chain item 4, incorrectly says that the service facade delegates to `service/projects/creation.ts`. Treat that chain as superseded by this inspection.

The actual constructor in `framework/automation-service/service.ts:423` constructs `AutomationStudioProjectStore` without a canonical authority. `createProject` at line 3720 implements creation itself. The call to `new AutomationStudioService` in `programs/_shared/runtime.ts:173` selects `storageRootDir` for layout v2, otherwise the existing legacy/memory options. Neither location constructs or calls `AutomationStudioProjectCreation` or `CanonicalAuthorityWholeOperation`. A scoped reference search finds the former class used only by its own creation/Flow tests and the canonical whole-operation fixture.

This agrees with the authored architecture, `docs/architecture/automation-studio/persistence.md`, “Opted-in canonical owner infrastructure”: the current host still selects canonical memory by default; the whole-writer helpers do not activate service routing, and actual constructor/writer integration remains a prerequisite. Preserve that separation. Canonical `reserve` really does write configuration/fences/lifecycle before effects, but it is **not this endpoint's live mutation boundary**.

## Observed live sequence

1. The current web `client-gateway/first-project/route.ts` uses the primary `getFluxIQ`, paired-token authorization and route IAM, then calls `automationStudioPersonProject`. It has no selected held workspace context or drain admission.
2. `programs/automation-studio/api/person-project.ts` calls registry `projects`, chooses the latest exact `ownerUserId === actor.userId`, then calls `create-project` when none is returned. The promise map coalesces only one process/registry/user/domain. A failed list becomes an empty list; a failed create becomes `null`. Each waiter unconditionally removes the shared map key.
3. `programs/_shared/api.ts:222` awaits IAM before invoking the handler. The handler at `automation-studio/api/handlers/projects.ts:105` calls the live `service.createProject`, with domain overwritten from the authorized scope. Neither boundary has trusted mutation metadata outside the request.
4. Live `service.ts:3734` uses `ProgramJsonStore.transaction` when `objectStore` and `projects.indexStore` exist. After the awaited index read, its **first project effect** is `transaction.write(indexPath, nextIndex)`. It then writes manifest, hierarchy nodes/deleted and preferences in the same transaction. No canonical reservation precedes these effects.
5. Otherwise, `writeProjectIndex` and `writeProjectRecord` run separately. `AutomationStudioProjectStore.writeProjectIndex` first awaits `ensureStorageReady`, which can migrate the legacy project store and write before reaching its index mutator. Placing a callback outside that method is therefore insufficient for a guarded first-use file path. No-storage services retain catalogue state in memory.
6. Registry `afterSuccess` at line 386 records the created resource's owner **after** project creation. `AutomationStudioProjectOwnership.recordOwner` awaits catalogue existence, then changes `ownership/projects.json`. Same creator is idempotent, a migration default can be replaced, and a different creator is refused. A thrown save produces a failed registry response after the project is already present.
7. The public trusted-host `recordAutomationStudioCreatedProjectOwner` can repair a **known** ID and never authorizes a user request. Its adjacent existing test explicitly injects a failed owner save and repairs that same ID. The person-project helper currently loses that identity.
8. Lookup is not uniformly read-only: the project list handler calls `withProjectOwners`, and service IAM list filtering calls `ProgramIamGate.resources` / `ownerOf`. Both can run default-owner migration. Guarding only project creation leaves these earlier ownership writes.

## Proposed additive API

The following is a proposal for root approval, not a claim that these exports exist. Keep all metadata out of `ProgramApiRequest`, `ProgramScope`, JSON schemas, model arguments, persisted business input and wire responses.

```ts
type ProgramMutationAdmissionVerdict =
  | "allow" | "authentication-required" | "forbidden" | "draining";

type ProgramMutationAdmission = Readonly<{
  stillAuthorized(): Promise<ProgramMutationAdmissionVerdict>;
  beforeMutation(): ProgramMutationAdmissionVerdict;
}>;

type ProgramApiCallOptions = Readonly<{
  mutationAdmission?: ProgramMutationAdmission;
  projectCreation?: Readonly<{ kind: "first-project" }>;
}>;

registry.call(request, options?);
// Existing handlers may ignore the optional second argument.
type ProgramApiHandlerContext = Readonly<ProgramApiCallOptions>;
// handler(request, context?)

automationStudioPersonProject({
  registry, actor, domainId, create: true,
  mutationAdmission, // new optional trusted input
});
```

A closed verdict distinguishes drain503 from stale authentication401 / authorization403 without leaking a callback exception. Unknown values, thenables returned from `beforeMutation`, and thrown callbacks become fixed `mutation.admission_unavailable`503; only the exact `"allow"` value admits. No arbitrary error message or cause is sent back. If root prefers the prior boolean proposal, retain literal-true checks and add a separate typed drain refusal; do not conflate a drain with authorization denial.

`projectCreation.kind` is valid only for Automation Studio `projects` and `create-project`, and only with a supplied admission. On `projects` it means bootstrap lookup/accepted-attribution repair and non-persisting default ownership; on `create-project` it selects the durable first-project operation. Other endpoints refuse this option before their handler. Requested mutation admission on an unsupported mutating registration must refuse, rather than implying that a generic handler has a write guard. Existing calls without options retain their behavior and wire shape.

The projects handler derives creator from `request.actor.userId` and domain from the frozen authorized scope. A second, trusted service argument carries these derived values and admission, for example `createProject(input, { admission, firstProject: { userId, domainId } })`. The service validates exact scope/input equality. There is no caller-selected project ID, attempt ID, workspace ID or creator in the wire payload. Ordinary unguarded service/registry creation stays on its existing engine.

The registry composes the supplied asynchronous guard with a fresh decision for the exact registered action/resources and unchanged captured actor, outside storage locks. The asynchronous guard must itself reread caller proof, user/membership and actor fields from their authority owners. A fresh policy decision over a stale actor is not enough. The synchronous guard covers pinned primary/selected runtime generation, abort/release, live binding facts and drain after intervening waits.

Expose the new types additively through the existing public program/Automation Studio entry points needed by the web consumer. Keep helper return `Promise<string | null>`: null-domain/no-create absence remains null; in the new guarded create path, registry/storage/admission failures throw a closed coded error rather than becoming successful `null`. Existing unguarded callers' null/refusal behavior need not change in this prerequisite.

## Storage and admission contract

Use the actual existing `ProgramJsonStore` owner. Under layout v2, index/manifest paths and `ownership/projects.json` are in one `automation.state` root; `ProgramDocumentTransaction.state` already rejects crossing roots or kinds. A focused first-project receipt document beside ownership, e.g. `ownership/first-projects.json`, can participate in that same existing transaction. It is operation metadata, not another database, repository engine, route-owned store or replacement project catalogue.

The durable key is a collision-safe canonical encoding/hash of protocol + **exact** user ID + effective domain, scoped by the selected service's storage owner. Do not use session ID, client ID, project name, `safeSegment`, a lowercased lossy key or a caller-supplied workspace. Use this closed internal receipt shape (all fields validated; no token or callback):

```ts
type FirstProjectReceipt = {
  protocol: "fluxiq.first-project.v1";
  key: string;
  generation: number;
  userId: string;
  domainId: string;
  project: AutomationStudioProject; // generated ID and frozen normalized fields/times
  inputDigest: string;
  phase: "admitted" | "project-created" | "completed";
};
```

Keep a receipt map keyed by the validated key, preserving unrelated entries. Corrupt/mismatched records refuse; they are not absence. SQL creates the completed receipt in its coherent transaction; file phases retain the exact identity across separate effects.

### Layout v2: one actual storage transaction

1. Complete any asynchronous preparation outside the writer transaction; fresh route/caller and program IAM admission run after it. Guarded lookup/preparation must not silently run project/default-owner migrations before this point.
2. Acquire the existing transaction and read the current index, owner and receipt documents through it. Recheck the receipt and any existing owner/candidate after lock acquisition. Allocate a new ID only when no valid completed/pending attempt already supplies one. The synchronous admission verdict is checked immediately before the first receipt/index/owner write, with no further external await.
3. Write the five existing project documents, creator record and exact completed receipt in this transaction, preserving other catalogue/owner entries. The ownership owner supplies its validation/creator-transition logic to the transaction; do not reimplement permissive record parsing in the project writer or call its separate `change()` transaction from inside this transaction.
4. Owner-write/project-write failure rolls back **all** these effects. Registry's existing `afterSuccess` may still idempotently record the same creator; if its later read/save fails, the transaction already contains both the creator and stable receipt. A retry resolves that same project instead of allocating again.
5. Once this coherent commit is accepted, later HTTP/authority refusal suppresses the response; it does not undo the project or delete its receipt. Do not insert a refusal between project commit and mandatory creator association.

SQL first-project contention must be resolved from the durable receipt inside the transaction, not only a JS promise map. Another service object/process sharing this storage owner must recover the same attempt. All transaction reads/writes are storage work; external proof/IAM/default-owner lookups happen before acquiring its writer lock.

### Legacy files and memory

Preserve the existing file and memory creation paths. For the **new guarded** file bootstrap, use an exact-ID pending receipt through existing `ProgramJsonStore` / `programJsonDocumentTransaction`, then call the same live writer with an internal resume identity. The first durable pending-receipt write is already admission and must be guarded. Do not wait until its later index write. The pending record must precede project effects so an owner-save failure/crash cannot lose the ID. Finish accepted project/creator work without introducing later drain/refusal checkpoints between required effects.

The file writer must prepare/migrate before admission without unguarded side effects, or explicitly guard that migration at its own first write. Prefer an existing-only bootstrap view that refuses `migration_required` before any migration write; ordinary local callers retain their current migration behavior. An initialized legacy file workspace continues to work with no extra user lock. A fresh empty store is not a migration failure.

On retry, a pending receipt with the exact existing project is repaired through `recordAutomationStudioCreatedProjectOwner`; reject a different creator. Never infer a previous attempt by the name “My automations”. Do not replace an existing project ID/manifest with new fields. An uncertain partial file attempt remains a fixed `first_project.recovery_required` failure with its identity retained; it must not be cleared by timeout or interpreted as permission to create another project. A file receipt and five files are not an atomic transaction. Existing `ProgramJsonStore` ordinary file writes are process-cooperative; one per-document SQL guard does not prove all legacy writers are safe across processes. State this limitation in acceptance.

Memory uses the same validation and per-service operation identity for its lifetime, with no disk-durability claim. Existing no-options local service calls retain their behavior. The file recovery branch is required for guarded local-mode acceptance; do not claim only a SQL test proves those modes.

### Pending attribution, reads and deletion

Guarded bootstrap lookup first checks/finishes any already-admitted exact user/domain attribution obligation, then performs the existing IAM-filtered latest-own selection. This repair is completion of accepted work, not authorization to start another project; drain does not strand it. A failed repair is an explicit failure before any new allocation. Each requesting caller still needs fresh authority before receiving its result.

Add an explicit non-persisting ownership-read mode for this bootstrap context. Both handler `withProjectOwners` and IAM `ownerOf` must use it. Existing recorded creators win; validated pending creator intent must not be temporarily defaulted to an administrator. Ordinary legacy ownerless projects retain the same **effective default-owner/filtering semantics**, calculated without saving a default record on this guarded path. Do not skip IAM item filtering or treat a missing recorded owner as “this caller's”. Snapshot/non-bootstrap callers retain their current migration behavior.

Completed receipt replay must validate the current project, domain, creator and current visibility; it must not reveal a previously created ID that today's IAM hides. Existing but currently inaccessible receipt target means refusal, not a new duplicate. A legitimately completed-and-deleted project can allow a **new generation/new ID** after a fresh successful absence observation and new creation admission. Never revive the previous ID. A pending/uncertain attempt cannot be retired on missing data alone; dangling manifest/index or failed reads are recovery failures. Keep completed/deleted versus pending/unknown states explicit.

Remove the shared caller-proof promise as authority. Each caller runs its own lookup/admission/publication checks. Prefer letting the durable receipt serialize actual creation; an optional JS work queue may serialize storage work but cannot reuse the first waiter's actor or admission. If a promise map remains, only its exact owning promise may remove its entry. One revoked waiter must not cancel another caller's admitted coherent commit.

## Exact implementation partition

All paths below are **proposed ownership**, pending root approval. The Core unit includes its adjacent tests/barrels; source outside this list remains frozen.

| Owner | Paths and responsibility |
| --- | --- |
| Registry boundary | `packages/fluxiq/src/programs/_shared/api.ts`; new focused `_shared/mutation-admission/**`; `_shared/iam/program-iam-gate.ts`, `filter-program-list.ts` and adjacent tests. Optional trusted options/handler context, support refusal, fresh decision composition, non-persisting project-owner resolution, fixed failures. |
| Bootstrap API | `programs/automation-studio/api/person-project.ts`, `handlers/projects.ts`, `api/index.ts`, `automation-studio/index.ts` and adjacent tests. Thread trusted metadata, strict guarded failure handling, exact actor/scope derivation, pending repair before selection, independent waiters. Paths are beneath `packages/fluxiq/src/`. |
| Live writer | `framework/automation-service/service.ts` only actual create delegation and trusted bootstrap list forwarding; a new focused `service/projects/first-creation/**`; `service/projects/store.ts` and `service/catalogue.ts` only necessary existing-only bootstrap preparation/list/index mutation seams, relevant barrel/tests. Preserve existing legacy domain inference. Extract/reuse the live document-write body if needed; leave the unrelated existing `projects/creation.ts` canonical foundation untouched. |
| Existing ownership owner | `framework/persistence/automation/ownership/{ownership,ownerships,document-store,memory-store,types,owner-records,index}.ts`, a new focused `ownership/first-project/**`, adjacent tests; `framework/persistence/resource-owner/owner-resolver.ts` for optional non-persisting read options. Transaction-owned creator operation, exact receipt persistence/repair, old default semantics. No path exposed to the wire. |
| Lead integration | Additive necessary public type re-exports, package version, authored architecture/current-state/ledger, coordinated dependency builds/currency guard and eventual `apps/web/src/app/api/client-gateway/first-project/**` route/test integration. Lead reserves all existing runtime/context/shared route foundations. |

No canonical-authority source changes, new platform authority, key-custody changes, generic migration activation, shared gateway/presentation/account/trace edits, provider or browser work belong to the first unit. If transaction-owned owner writing requires extending `ProgramDocumentTransaction`, report that exact need before expanding ownership; its current read/write/same-owner enforcement appears sufficient.

## Acceptance to put in the implementation brief

The executable **first unit** is the Core API + actual live writer + existing ownership/receipt owner together. A helper-only callback patch is not a completed prerequisite. Before web integration, prove:

- Live `AutomationStudioService`, not only the unwired canonical class: no receipt, project index/manifest, ownership or legacy-migration project write after stale/abort/reload/drain refusal during lookup, IAM, preparation or storage contention. Capture before/after state in isolated temp roots.
- SQL all-or-nothing creator failure, post-commit registry ownership failure then exact-ID retry, close/reopen and a second real service/process sharing the root. No duplicate project; actual creator/receipt/index/manifest agree.
- File owner failure followed by exact-ID repair and restart; uncertain partial files refuse without a second allocation. No-options initialized/fresh file and memory callers remain compatible. Migration-required refusal makes no migration write.
- Foreign/default-owned projects remain excluded for a different user; admin-visible foreign content remains foreign. Guarded reads do not persist defaults and preserve ordinary owner-based IAM filtering. Corrupt reads and list/create failures never trigger an allocation or successful-null response.
- Two concurrent requesters with the same user/domain but different proofs, one revoked: one durable creation maximum, independent refusals/publication, no shared-proof authority or map-generation deletion. Different users/domains/storage roots remain independent.
- Pending accepted attribution finishes despite later drain/auth loss; stale response is withheld. A conflicting creator refuses. Completed receipt with inaccessible or deleted target follows the explicit refusal/new-generation rules; pending uncertainty never silently retires.
- Sync callback rejects malformed/Promise values; raw callback/storage errors are sanitized at public guarded boundaries. Callback data cannot be injected through request/payload/scope. No external authorization callback executes while the SQLite writer is held.

Suggested narrow commands, run only after the implementation owner signals source stability (not executed in this discovery):

```powershell
pnpm.cmd --dir packages/fluxiq exec vitest run src/programs/automation-studio/api/tests/person-project.test.ts src/programs/automation-studio/api/tests/record-created-project-owner.test.ts src/programs/automation-studio/api/tests/first-project-admission.test.ts src/framework/automation-service/service/projects/first-creation/tests src/framework/persistence/automation/ownership/first-project/tests src/programs/_shared/mutation-admission/tests --pool=forks --maxWorkers=1 --minWorkers=1
pnpm.cmd --dir packages/fluxiq exec node --max-old-space-size=8192 node_modules/typescript/bin/tsc --noEmit --incremental --tsBuildInfoFile node_modules/.cache/first-project-admission/check.tsbuildinfo
node scripts/structure-audit.mjs
```

The implementation brief must additionally name the existing adjacent ownership/IAM suites actually changed. Real SQLite tests need the existing real-sql group marker. Narrow API tests can use contracts-source aliases; web/extension consumers wait for root-coordinated fresh package outputs.

The subsequent web unit replaces primary access with one paired-only `workspaceRouteContext`, keeps its selected lease until release, forwards fresh async authority plus synchronous `current`/binding/drain admission, and revalidates before final publication. Domain/user/session/trust/currentProject/recording bindings come from the established caller, never payload. Existing-project lookup remains usable during drain; only new admission is refused. Keep response shape and managed-run rejection. The trace intake and other shared foundations remain unchanged.

## Version and guarantee limits

Current `fluxiq` is 0.50.1. This introduces public optional call/handler/helper types and guarded behavior, so recommend a minor 0.51.0 under the repository's pre-1.0 feature policy; root chooses/edits the version. No contracts schema, SDK method or client wire change is needed. Root rebuilds `fluxiq` and affected library graph, verifies dependency currency, then runs owned route/shared matrix acceptance. No consumer may use stale dist.

The asynchronous authority check followed by a synchronous current-binding predicate is **not atomic authority comparison across storage owners**. Identity/membership/policy or credential state may commit after the final asynchronous check while project SQL waits. Current context supplies runtime-generation/binding checks, not a durable identity/policy revision participating in project commit. Do not claim that this unit prevents every revocation/commit race, provides canonical lifecycle fencing, or makes legacy multi-file writes atomic. A stronger claim requires an agreed authority revision/transaction coordinator and real writer integration, not awaiting external authorization inside a SQL lock.

## Validation performed

Read-only `Get-Content`, `rg -n` and `rg --files` of the written brief, the preceding first-project discovery, live helper/registry/handler/service constructor and writer, project store, ProgramJsonStore/document transaction, canonical reservation/lifecycle, ownership/default migration/repair, public exports, owning tests and authored persistence architecture. Some initially guessed filenames did not exist; actual paths were located with `rg` and inspected. Tests were read as source evidence only. No source edits, builds, tests, live calls, provider calls or mutating git were performed.

Outcome: Done
Changed: This report only.
Validation: Read-only source/architecture inspection; no tests required or run for this design.
Not verified: Proposed API implementation, atomic rollback/retry/process behavior, guarded legacy recovery, runtime acceptance, route integration or builds.
Report: `docs/working/hosted-platform-launch-plan/reports/first-project-admission.md`
Notes: Prior live-to-canonical delegation claim is explicitly corrected. Implementation awaits root approval of this exact partition/API. Previous owned source remains frozen.
