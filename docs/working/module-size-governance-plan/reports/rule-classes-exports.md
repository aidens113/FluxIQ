# Rule report: class-methods and exported-values

Worker deliverable. Two new read-only rule modules under
`scripts/structure-audit/rules/`. No other repository file was created or edited.

- `scripts/structure-audit/rules/class-methods.mjs` (id `class-methods`)
- `scripts/structure-audit/rules/exported-values.mjs` (id `exported-values`)

## 1. `class-methods` — what it checks and how

**Holds:** classes stay under `LIMITS.classMethods` (40); advisory at
`LIMITS.classMethodsWarn` (25).

**Scope:** every file in `ctx.scriptFiles` for which `ctx.isTestFile(file)` is
false.

**Walk:** `collectClasses` recurses the whole AST with `ts.forEachChild`
starting at the `SourceFile`, so classes nested inside functions, blocks,
other classes' methods, or object literals are all found. Each class is
measured independently — members of a nested class do not count toward the
enclosing one, because only `node.members` of that one class is iterated.

**Class nodes matched:** `ts.isClassDeclaration` and `ts.isClassExpression`.

**Members counted** (iterating `node.members`):

| AST predicate | Counted |
| --- | --- |
| `ts.isConstructorDeclaration` | no — skipped first, explicitly |
| `ts.isMethodDeclaration` | yes |
| `ts.isGetAccessorDeclaration` | yes |
| `ts.isSetAccessorDeclaration` | yes |
| `ts.isPropertyDeclaration` with initializer `ts.isArrowFunction` or `ts.isFunctionExpression` | yes |
| any other `PropertyDeclaration`, `IndexSignature`, `ClassStaticBlockDeclaration`, semicolon members | no |

**Finding shape:** `key` is `<path>::<ClassName>` (`<anonymous>` for an unnamed
class expression), `line` is the 1-based line of the class's first token, from
`sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1`.
Count > 40 gives `severity: "fail"`, `ratchet: true`. Otherwise count > 25
gives `severity: "warn"`, `ratchet: false` — matching `file-lines.mjs` and
`directory-files.mjs`, where advisory findings are never baselined.

### Finding counts by severity

| severity | count |
| --- | --- |
| fail | 2 |
| warn | 4 |
| suppressed by baseline | 0 (no baseline entries exist yet) |

### Three sample messages

```
FAIL  packages/fluxiq/src/programs/automation-studio/runtime/service.ts:804: class AutomationStudioService has 422 methods, exceeding the 40-method limit. Split it into a facade over collaborators grouped by responsibility.
FAIL  packages/fluxiq/src/client-gateway/service.ts:54: class ClientGatewayService has 43 methods, exceeding the 40-method limit. Split it into a facade over collaborators grouped by responsibility.
warn  packages/fluxiq/src/programs/identity-access/runtime/service.ts:53: class IdentityAccessService has 36 methods, past the 25-method advisory threshold. Move a group of related methods onto a collaborator before it reaches 40.
```

The remaining three warnings are
`apps/web/src/features/automation-studio/live/domain-commands.ts:64`
(`AutomationLiveDomainCommands`, 33),
`packages/fluxiq/src/programs/automation-studio/storage/project-flow-resource-repository.ts:55`
(`AutomationStudioProjectFlowResourceRepository`, 29) and
`packages/fluxiq/src/programs/automation-studio/storage/project-adaptation-store.ts:33`
(`AutomationStudioProjectAdaptationStore`, 26).

## 2. `exported-values` — what it checks and how

**Holds:** a module keeps a narrow public surface — at most
`LIMITS.exportedClasses` (1) exported class, at most
`LIMITS.exportedComponents` (1) exported component in a `.tsx`/`.jsx` file,
and at most `LIMITS.exportedValues` (15) exported values overall; advisory on
the total at `LIMITS.exportedValuesWarn` (8).

**Scope:** every file in `ctx.scriptFiles` that is not a test file and whose
basename without extension is not `index` — barrels are exempt, because
re-exporting is their whole job.

**Walk:** top-level `sourceFile.statements` only. Nothing inside functions,
blocks, or `declare module` bodies is counted.

**Counted as one exported value each:**

| Statement | AST predicate | Value count |
| --- | --- | --- |
| `export function f` | `isFunctionDeclaration` with an `ExportKeyword` modifier | 1 |
| `export class C` | `isClassDeclaration` with an `ExportKeyword` modifier | 1 (also +1 class) |
| `export enum E` | `isEnumDeclaration` with an `ExportKeyword` modifier | 1 |
| `export const/let/var a, b` | `isVariableStatement` with an `ExportKeyword` modifier | one per declarator in `declarationList.declarations` |
| `export default <anything>` | `isExportAssignment` with falsy `isExportEquals` | 1 |
| `export { a, b }` with no `from` | `isExportDeclaration`, no `moduleSpecifier`, not `isTypeOnly`, clause is `NamedExports` | one per element, skipping elements with `isTypeOnly` |

**Not counted:** `export type` (`TypeAliasDeclaration`), `export interface`
(`InterfaceDeclaration`), `export type { ... }`, per-element
`export { type A }`, anything with a `from` clause (`export * from`,
`export { a } from`, `export * as ns from`), `export = x`
(`isExportEquals`), and any non-exported declaration.
`export default function Foo() {}` is a `FunctionDeclaration` carrying both
modifiers, so it is counted once as a function rather than twice.

**Classes:** the class count is exported `ClassDeclaration`s only.

**Components** (`.tsx` / `.jsx` only): exported function declarations, and
exported `const`/`let`/`var` declarators whose binding is a plain `Identifier`,
whose name is PascalCase. PascalCase is `/^[A-Z][A-Za-z0-9]*$/` plus
`/[a-z]/` — starts uppercase, alphanumeric only, and contains at least one
lowercase letter.

**Findings** — a file can emit up to three. The two value findings are an
if/else chain, so a file never emits both the values fail and the values warn.

| condition | key | value | severity | ratchet |
| --- | --- | --- | --- | --- |
| classes > 1 | `<path>::classes` | class count | fail | true |
| components > 1 | `<path>::components` | component count | fail | true |
| values > 15 | `<path>::values` | total | fail | true |
| else values > 8 | `<path>::values` | total | warn | false |

### Finding counts by severity

| severity | count |
| --- | --- |
| fail | 61 |
| — of which `::classes` | 11 |
| — of which `::components` | 31 |
| — of which `::values` | 19 |
| warn | 41 |
| suppressed by baseline | 0 (no baseline entries exist yet) |

### Three sample messages

```
FAIL  apps/web/src/features/programs/shared-ui.tsx: 36 exported components, exceeding the 1-component limit. One component per file under components/, with a barrel.
FAIL  packages/fluxiq/src/programs/automation-studio/storage/project-ui-cache-store.ts: 3 exported classes, exceeding the 1-class limit. One class per file, in a file named after it.
warn  apps/web/src/features/automation-studio/flow-editor/graph-interactions.ts: 12 exported values is past the 8-value advisory threshold. Keep the module's surface to one responsibility.
```

## 3. Judgement calls

1. **Warn findings are `ratchet: false`.** The task fixed `ratchet: true` for
   the fail findings only and said nothing about warnings. Both reference
   rules leave advisory findings unratcheted, so a warning is never baselined
   and never suppressed. Warn findings still carry the same key as the
   corresponding fail, so a file crossing the fail threshold keeps one stable
   identity in the baseline.
2. **`class-methods`: constructors.** `ConstructorDeclaration` is a distinct
   node kind from `MethodDeclaration`, so it would not be counted anyway; it
   is skipped explicitly at the top of the loop so the exclusion is visible to
   a reader.
3. **`class-methods`: static blocks and index signatures are not methods.**
   Neither is a named callable member; both excluded.
4. **`class-methods`: nested classes are separate findings.** A class defined
   inside another class's method gets its own key, count and line.
5. **`exported-values`: per-element `export { type A, b }`.** The task named
   only the declaration-level `export type { ... }` form. I also skip elements
   with `element.isTypeOnly`, because they are type exports by any reading and
   counting them would inflate value counts with things that vanish at
   runtime. No file in the repository currently changes its finding because of
   this.
6. **`exported-values`: `export = x` is excluded.** `isExportAssignment` covers
   both `export default x` and `export = x`; only the former is an ES value
   export, so the rule guards on `!isExportEquals`.
7. **`exported-values`: `export namespace X` is not counted.** A namespace is a
   value in TypeScript, but the task enumerated the forms to count and did not
   list it. There are no occurrences in the repository, so this is inert today.
8. **`exported-values`: classes counted are declarations, not re-exported
   names.** `export { SomeClass }` where `SomeClass` is a locally declared
   class counts toward the value total but not the class total. Deciding
   otherwise would need local binding resolution, which the rule deliberately
   avoids.
9. **PascalCase requires at least one lowercase letter.** Without that,
   exported all-caps constants with no underscore (`DEFAULTS`, `API`) would be
   miscounted as components in `.tsx` files. The trade-off is that a genuine
   component named entirely in caps would be missed; none exist in the
   repository.
10. **The barrel exemption keys on the basename only**, so `index.ts`,
    `index.tsx` and `index.mjs` are all exempt regardless of directory.

## 4. Commands run, and the last 5 lines of each

All four were run from `F:/!FluxIQ`. `--update` was **not** run; no baseline
file was written or modified. Exit code 1 on all four is expected: the
baseline has no entries for these rules yet, so every ratcheted fail is
reported.

### `node scripts/structure-audit.mjs --rule class-methods` — exit 1

```
  warn  [class-methods] packages/fluxiq/src/programs/identity-access/runtime/service.ts:53: class IdentityAccessService has 36 methods, past the 25-method advisory threshold. Move a group of related methods onto a collaborator before it reaches 40.
  FAIL  [class-methods] packages/fluxiq/src/client-gateway/service.ts:54: class ClientGatewayService has 43 methods, exceeding the 40-method limit. Split it into a facade over collaborators grouped by responsibility.
  FAIL  [class-methods] packages/fluxiq/src/programs/automation-studio/runtime/service.ts:804: class AutomationStudioService has 422 methods, exceeding the 40-method limit. Split it into a facade over collaborators grouped by responsibility.

structure-audit: 2 violation(s) across 1 rule(s).
```

### `node scripts/structure-audit.mjs --rule class-methods --json` — exit 1, 74 lines, parses as JSON

```
    }
  ],
  "suppressed": 0,
  "lowerable": []
}
```

Parsed with `JSON.parse`: `failures: 2`, `warnings: 4`, `suppressed: 0`.

### `node scripts/structure-audit.mjs --rule exported-values` — exit 1

```
  FAIL  [exported-values] packages/fluxiq/src/programs/automation-studio/storage/project-schema.ts: 21 exported values, exceeding the 15-value limit. Split the module by responsibility, or stop exporting what no other module imports.
  FAIL  [exported-values] packages/fluxiq/src/programs/automation-studio/storage/project-ui-cache-store.ts: 3 exported classes, exceeding the 1-class limit. One class per file, in a file named after it.
  FAIL  [exported-values] packages/fluxiq/src/programs/identity-access/runtime/service.ts: 2 exported classes, exceeding the 1-class limit. One class per file, in a file named after it.

structure-audit: 61 violation(s) across 1 rule(s).
```

### `node scripts/structure-audit.mjs --rule exported-values --json` — exit 1, 1028 lines, parses as JSON

```
    }
  ],
  "suppressed": 0,
  "lowerable": []
}
```

Parsed with `JSON.parse`: `failures: 61`, `warnings: 41`, `suppressed: 0`.

## 5. Definition of done, measured

| check | expected | measured | verdict |
| --- | --- | --- | --- |
| both rules run without error | no crash | no crash; both complete over the full tracked file set | met |
| `AutomationStudioService`, `packages/fluxiq/src/programs/automation-studio/runtime/service.ts:804` | within 5 of 419 | **422** | met, +3 |
| `ClientGatewayService`, `packages/fluxiq/src/client-gateway/service.ts:54` | about 42 | **43** | met, +1 |
| `apps/web/src/features/programs/shared-ui.tsx` components | 37 | **36** | off by one — see below |

### The shared-ui.tsx discrepancy: 36, not 37

This is a genuine one-off difference, not a loose reading of the rule. I
enumerated the file's top-level exports directly from the AST to check. It has
exactly **40** exported value declarations, all of them `export function`, plus
10 `export type` declarations; no classes, no `export default`, no
`export { ... }` list, and no multi-declarator `const`. Of the 40 function
names, four are camelCase — `notifyGlobalAlert`, `resolveTreeFocusId`,
`toneFromMessage`, `titleFromTone` — leaving **36** PascalCase names:

`Panel, Field, Button, IconButton, ActionLink, Menu, Combobox, Tooltip,
DataTable, Pagination, List, ListRow, Tree, Toolbar, Breadcrumb, Splitter,
CodeViewer, JsonViewer, KeyValue, SummaryStrip, StatusBadge, SpecDatum,
Segmented, Modal, ModalContent, AlertDialog, AuthorizationDialog, Drawer,
InlineNotice, LoadingState, Skeleton, Progress, EmptyState, StatusText,
VisualAlert, GlobalAlertViewport`

I also checked HEAD, HEAD~1, HEAD~2 and HEAD~3 of that file: each yields 36 by
the same criterion, so the file has not shrunk since the plan was written. No
variation of the stated criterion produces 37 — relaxing PascalCase to "starts
with an uppercase letter" still gives 36, because none of the 36 are all-caps,
and widening to all exported values gives 40. My conclusion is that the 37 in
the definition of done is an off-by-one in the plan, and that 36 is the correct
count for the rule as specified. Flagging it rather than tuning the rule to hit
the number.

## 6. Not completed

Nothing in the assignment was left undone. Specifically:

- `--update` was deliberately not run, as instructed, so no baseline entries
  exist for either rule and both currently fail. That is the expected state.
- Only the two owned rule files were written, plus this report. `git status`
  shows no modification attributable to this worker outside
  `scripts/structure-audit/rules/class-methods.mjs`,
  `scripts/structure-audit/rules/exported-values.mjs` and this report file.
- Nothing was committed or pushed.
