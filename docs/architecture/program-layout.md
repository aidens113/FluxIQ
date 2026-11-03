# Global Program Layout

Global programs live in `packages/fluxiq/src/programs/<program-id>`.

Each program should stay modular. Avoid single files that mix catalog metadata,
API handlers, storage, runtime behavior, and UI state.

A program is a controller of the framework. It registers its endpoints and
view state; the capabilities behind them (services, stores, model calls,
execution) belong to framework areas under `packages/fluxiq/src/`, even while
the program is their only caller. See [Controller Programs](#controller-programs).

## Controller Programs

Automation Studio is the reference controller. It holds exactly this:

```text
programs/automation-studio/
  index.ts              Public entry, published as fluxiq/automation-studio
  metadata.ts           Program catalog entry only
  api/
    index.ts            Barrel
    handlers.ts         Registers every handler group
    handlers/           One file per endpoint group: permission, resource,
                        classification, one call to the service
  ui/
    contracts.ts        View state and UI-facing DTOs
```

`scripts/structure-audit/rules/program-controllers.mjs` fails the audit if a
source file in a controller program sits outside `api/`, `ui/`, `index.ts` and
`metadata.ts`, and ratchets any function there over 20 lines, because a handler
that long holds logic that belongs to the framework. The 20 lines is a threshold
the audit uses, not a product rule. `importBoundaries` stops every framework
area importing the program, so the dependency runs one way: program to
framework. The framework side of Automation Studio is described in
[runtime ownership](./runtime-ownership.md).

A program that is not a controller may use the layered shape below.

## Standard Shape

```text
programs/<program-id>/
  index.ts              Public barrel for this program
  metadata.ts           Program catalog entry only
  types.ts              Program-owned domain-neutral document types
  api/
    contracts.ts        Request/response contracts and endpoint names
    handlers.ts         Framework handler registration, when implemented
  runtime/
    contracts.ts        Runtime adapters, services, runners, schedulers
    service.ts          Program orchestration, when implemented
  storage/
    contracts.ts        Repository interfaces and storage keys
    repositories.ts     File/database repository implementations
  ui/
    contracts.ts        View state and UI-facing DTOs
    navigation.ts       Program tabs, panels, and route metadata
```

Folders should be added when they have real ownership. `metadata.ts` and
`index.ts` are the minimum for every global program.

This shape defines the layers only. Inside a layer, files are grouped by
feature and then by kind, and each directory keeps its tests in a `tests/`
subfolder rather than loose beside the source. The placement
procedure, the prefix-becomes-directory rule, and the size budgets are
defined in [`code-structure.md`](./code-structure.md); a layer that outgrows
a handful of files follows that document, not this one.

All global program UI must use the shared theme described in
[`ui-theme.md`](./ui-theme.md). Program folders can own view state and local
panel composition, but not private color systems.

The global program shell is task-first. A program's working view remains mounted
as the primary surface. Framework API, storage, and runtime capability
inventories live in the secondary Technical Details drawer and must not appear
as equal-weight primary navigation tabs. The drawer supports direct tab
selection, Escape dismissal, backdrop dismissal, and narrow-viewport scrolling.

## Current Global Programs

- `automation-studio`
- `identity-access`
- `secret-keys`
- `database-manager`
- `background-tasks`
- `compute-control`
- `deployment-sync`
- `docs`
- `production-runner`

## Boundaries

Global programs can depend on framework services such as `core`, `io`,
`domains`, `components`, `flows`, `engine`, `framework` and `runtime`. No
framework area depends on a program.

Global programs must not import downstream domain implementations. Domain-owned
programs belong to the importing repository under its configured
`domains/programs` root.

Accounts Manager is intentionally not being ported yet. OSRS, GE, merchanting,
and other domain-specific programs are out of scope for this public framework.

## Web Program Launcher

The root and domain directory routes share one `ProgramLauncher`. It presents
compact grouped rows instead of descriptive cards, searches title, description,
category, and status, and stores up to six recent destinations in local browser
storage. Arrow Up/Down and Home/End move through visible destinations.

Domains appear in the same discovery model as programs while retaining their
own route and status. A domain route reuses the launcher with its scoped program
catalog. Loaded-empty and filtered-empty states are explicit. Program
availability and permission filtering remain server/catalog responsibilities.
## Global Web Shell

Directory routes use `GlobalTopbar` with a FluxIQ home link, optional semantic
breadcrumb, contextual actions, and the authenticated account menu. The account
menu links to Identity and Access and owns logout; account actions are not
scattered as isolated topbar icons.

Program workspaces use the same breadcrumb semantics while retaining commands
owned by their active program. Automation Studio keeps its contextual command
bar and unsaved-work guard. Narrow layouts preserve product home, current
breadcrumb, and account access while hiding only role/domain metadata.
## Program Workspace And Technical Details

A program workspace leads with its actual program UI. Framework API, Storage,
and Runtime capability inventories open from the explicit Technical Details
command in a shared right-side Drawer. They are never equal-weight primary
navigation.

The drawer inherits shared focus trapping, Escape, return focus, inert
background, scroll lock, dynamic viewport bounds, and labelled title/description.
Its category tabs use roving focus and linked tabpanels. Capability content is an
unframed detail region inside the drawer, not a nested card.
## Global Responsive Composition

Global pages use dynamic viewport height with compact desktop (1024px), tablet
(768px), and narrow (390px) compositions. Ordinary program panels collapse to
one column before their content becomes compressed. The program launcher keeps
primary labels and navigation while dropping only secondary row metadata.

At tablet widths, dialogs become bottom-aligned bounded surfaces with wrapped
actions and drawers retain a 520px maximum. At narrow widths, dialogs and
drawers become full-viewport sheets, footer commands become full width, and
inline-notice actions reflow below their message. Automation Studio region
recomposition remains owned by the strict workspace phase.
## Model provider admission at construction

`FluxIQOptions.modelProvidersEnabled` is optional and defaults to enabled.
`FluxIQ` forwards it to `createGlobalProgramRuntime`, whose second options
argument preserves existing one-argument callers. Explicit false omits the
standing result-check resolver, session-key execution resolver and chat
model/key bindings before any provider-key release or request. It preserves
ordinary program services, authentication, Secret Keys, storage, native
libraries, gateway and unlocked-session lookup. It does not rewrite stored
result policies or guarantee immutability against trusted later manual binding.

The web host accepts `FLUXIQ_MODEL_PROVIDERS_ENABLED`: absent or `true` enables,
`false` disables. Other values, including blank or whitespace, refuse before
construction. Both initial and inferred-domain construction paths receive the
same resolved value; reload validates before closing the prior host. Consumers
must measure actual run provider usage separately; configuration alone is not
proof of zero calls.
