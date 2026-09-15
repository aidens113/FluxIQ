# k1-record-set-contracts: report

## Outcome

Done within the brief's ownership. K1's record-set contracts exist under
`packages/contracts/src/record-sets/` and are exported from
`@fluxiq/contracts/automation-studio`. The 41 tests pass, and the contracts type
check passes. All five mutation targets were seen to fail.

Two caveats for the supervisor:
- **Audit.** The structure audit exits 1 on one violation, in a shared file I
  do not own: `[working-docs] docs/working/README.md is out of date`. I reran
  it once and got the same result. No audit line names `packages/contracts` or
  `record-sets`.
- **Mutation method.** The permission system refused an edit that weakens a
  guard in the repository source ("Security Weaken"). I ran the mutations on
  disposable copies in my scratchpad instead, after an unmutated copy passed
  41 of 41. The copies are deleted. The repository source was never mutated.

## What changed and why

- `packages/contracts/src/automation-studio.ts`: added
  `export * from "./record-sets/index.ts";` after the `failure/` export, with
  a comment. This follows the `failure/` pattern (report §4 K1).
- New files under `packages/contracts/src/record-sets/`:
  - `schema.ts`:
    - value types and handlings, each as a frozen list plus its type;
    - `AutomationStudioRecordField` and `AutomationStudioRecordSchema` (`schemaVersion: "0.1"`);
    - `AUTOMATION_STUDIO_RECORD_SCHEMA_LIMITS`: 200 fields, id pattern `^[A-Za-z0-9_-]{1,100}$`, reserved ids, labels up to 200 characters.
  - `output.ts`:
    - `AutomationStudioRecordOutput`, with `recordsPath` required (CD19);
    - `AUTOMATION_STUDIO_RECORD_WRITE_MODES`;
    - `AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS`, holding the §2.4 and CD20 values: dataset id pattern, `maxRecords` default 1,000 and ceiling 10,000, 64 KiB rows, 100,000 rows per dataset per run, plus the `recordsPath` caps and a 32-level depth cap for `json` cells.
  - `dataset.ts`:
    - `AutomationStudioRunDatasetSummary`, with `updatedAt` as epoch ms (the AS convention);
    - `AutomationStudioRunDatasetPage`;
    - `AutomationStudioRunDatasetExportFormat` (`csv` or `json`, per §2.5) and its frozen list;
    - `AUTOMATION_STUDIO_RUN_DATASET_EXPORT_LIMITS`: 10,000 rows and 5 MiB inline; 100,000 rows and 256 MiB streamed.
  - `parse-schema.ts`: `parseAutomationStudioRecordSchema(value, { allowEncrypt })`.
    - Returns `{ ok: true, schema }` or `{ ok: false, issues }`.
    - Exact fields and fresh objects; hostile input yields `record_schema.invalid`.
    - `allowEncrypt` defaults to false (§2.7.1).
  - `parse-output.ts`: `parseAutomationStudioRecordOutput(value, options)`, with the same result shape.
  - `stored-schema.ts`: `storedAutomationStudioRecordSchema(schema)`. It drops `exclude` fields, returns fresh objects, and never mutates the input.
  - `records-path.ts`: `parseAutomationStudioRecordsPath(value) -> string[] | null` (see decision 3).
  - `validate-records.ts`: `validateAutomationStudioRecords(rows, schema, { maxRecords })` returns `{ rows, invalidCount, truncated, issues }`.
    - Each row is copied from an allowlist of `include` fields, in schema order, built with `Object.fromEntries`. A field id therefore cannot reach a prototype.
    - A row larger than 64 KiB of UTF-8 JSON, measured with `TextEncoder`, is invalid.
    - `truncated = rows.length > maxRecords`.
  - `encode-csv.ts`: `encodeAutomationStudioRecordsCsvHeader` and `encodeAutomationStudioRecordsCsvRows`.
    - RFC 4180 quoting; every line ends in CRLF, so header and rows concatenate for streaming.
    - Only stored columns are written. The header uses labels.
    - A leading `= + - @ \t \r` is prefixed with `'`.
  - `is-plain-record.ts`: an internal guard shared by the parsers. It is deliberately not re-exported from the barrel.
  - `index.ts`: the barrel.
- Tests in `record-sets/tests/`, one file per subject:
  - `parse-schema.test.ts` (12 tests), `parse-output.test.ts` (7), `stored-schema.test.ts` (2);
  - `records-path.test.ts` (3), `validate-records.test.ts` (9), `encode-csv.test.ts` (8).
  - Every case the report lists is covered, plus boundary and hostile-input cases.

**Layout deviation.** The report put both parsers and the stored schema in
`parse-schema.ts`. I split them into `parse-schema.ts`, `parse-output.ts`, and
`stored-schema.ts`: the brief lists them as separate items, and the structure
rules want one exported thing per file. The acceptance command covers the
whole `tests/` folder, so it is unaffected. No `tsconfig.build.json` change was
made; `tests/` holds only `.test.ts` files.

**Decisions taken where the report was silent.** Later phases must honour
these.
1. **Datetime cells.** A datetime cell whose text starts with a formula
   character is prefixed, despite "datetime never prefixed". See
   Contradiction 1.
2. **`encrypt` fields before K11.** `validateAutomationStudioRecords` drops
   them, copying only `include` fields as §2.7.3 says. K11 must extend
   validation.
3. **`recordsPath` syntax**, undefined anywhere before this:
   - 1-8 dot-separated segments of `[A-Za-z0-9_-]{1,100}`, 200 characters
     at most in all;
   - no `__proto__`, `constructor`, or `prototype` segment (capture
     replaces that subtree);
   - K4's reader and K7's lift should call `parseAutomationStudioRecordsPath`,
     so both walk exactly the segments K1 accepted.
4. **Schema rules:**
   - field ids `__proto__`, `constructor`, and `prototype` refused
     (`record_schema.reserved_field_id`);
   - blank labels refused;
   - an empty field list refused (`no_fields`);
   - an all-`exclude` schema refused (`no_stored_fields`);
   - `primaryKey` must be non-empty, unique, and name known fields that are
     neither `exclude` nor `encrypt`.
5. **Output rules.** Dataset ids `.` and `..` are refused (URL-path safety for
   download links). A blank output label is refused.
6. **Value rules:**
   - `null`, `undefined`, and a missing value all mean absent: invalid if
     required, omitted otherwise;
   - `string` also accepts a finite number or boolean, turned into a string;
   - `url` values are kept as given, not normalized;
   - `datetime` is kept as the given string.
7. **Issue codes.** Stable, listed once each, never containing a value:
   - `record_schema.{not_object, unknown_key, invalid_schema_version, invalid_fields, no_fields, too_many_fields, invalid_field, unknown_field_key, invalid_field_id, reserved_field_id, duplicate_field_id, invalid_field_label, duplicate_field_label, invalid_value_type, invalid_required, invalid_handling, encrypt_unavailable, no_stored_fields, invalid_primary_key, primary_key_unknown_field, primary_key_duplicate_field, primary_key_excluded_field, primary_key_encrypted_field, invalid}`;
   - `record_output.{not_object, unknown_key, invalid_dataset_id, invalid_label, missing_records_path, invalid_records_path, invalid_write_mode, invalid_max_records, max_records_above_ceiling, invalid}`;
   - `records.{not_array, invalid_max_records, row_not_object, required_missing, invalid_value, row_too_large, invalid_row}`.
   - The output parser passes the nested schema's `record_schema.*` codes
     through unchanged.

## Commands run and observed results

All were run alone, one at a time.

- `pnpm --dir "F:\!FluxIQ" --filter @fluxiq/contracts exec vitest run src/record-sets/tests --no-file-parallelism`
  - Printed `Test Files 6 passed (6)`, `Tests 41 passed (41)`.
- `pnpm --dir "F:\!FluxIQ" --filter @fluxiq/contracts check`
  - Printed `> tsc --noEmit` with no errors; the command succeeded.
- `pnpm --dir "F:\!FluxIQ" exec node scripts/structure-audit.mjs`, run twice.
  - Exit 1 both times, `structure-audit: 1 violation(s) across 1 rule(s).`
  - The only FAIL was `[working-docs] docs/working/README.md is out of date with the documents' header blocks.`
  - Filtering the second run for `contracts|record-sets|FAIL` found no line about my files.
- `node -e` probe of `Date.parse`:
  - accepted: `"@SUM(1) 2020"`, `"=HYPERLINK(1) Jan 1 2020"`, `"\t2020-01-01"`, `"\r2020-01-01"`, `"-2 Jan 2020"`;
  - rejected (NaN): `"=1+1"`.
- **Mutations**, on scratch copies of `record-sets/` plus `core.ts`, run with
  `vitest run --config <scratch>/k1-vitest.config.mjs --root <copy>`. The
  config aliases `vitest` to the contracts package's install.
  - Baseline, an unmutated copy: 41 of 41 passed.
  - Flipping the `allowEncrypt` default to `?? true` failed 2 tests: "refuses
    encrypt by default…" and the output parser's nested-issue test. Both
    reported `expected [] to deeply equal [ 'record_schema.encrypt_unavailable' ]`.
  - Replacing the allowlist copy with `{ ...row, ...Object.fromEntries(entries) }`
    failed 2 tests: "copies only include fields…" and "…omits absent optional
    fields" (`expected [ { title: 'ok', price: null, …(1) } ] to deeply equal [ { title: 'ok' } ]`).
  - Removing `=` from the prefix set failed 2 tests (`expected '=1+1\r\n' to be '\'=1+1\r\n'`,
    and the same for the `=cmd` header label).
  - Changing truncation `>` to `>=` failed "keeps N rows at maxRecords N…"
    (`expected true to be false`).
  - Removing the row byte check failed "passes a row of exactly 64 KiB…"
    (`expected [ Array(1) ] to deeply equal []`).
  - Afterwards the scratch copies and config were deleted (`Test-Path` reported False for both).
    - The real guards are intact: `validate-records.ts:47` has `rows.length > maxRecords`, `:85` has `Object.fromEntries(entries)`, `:86` has the byte check, `encode-csv.ts:5` has the full prefix set, and `parse-schema.ts:36` has `?? false`.
- `git -C "F:\!FluxIQ" status --short --untracked-files=all -- packages/contracts`
  - Showed only `M automation-studio.ts` plus the 17 new `record-sets/` files.

## Not verified

- **Build.** I did not run `pnpm build` or `pnpm --filter @fluxiq/contracts build`
  (instructed not to). So the emitted `dist` and the declaration-import rewrite
  for `record-sets/` are unchecked.
- **Wider checks.** I did not run the full `pnpm check` or `pnpm test`, and did
  not check other packages' consumers (none exist yet).
- **Mutation location.** The mutations were seen on scratch copies, not on the
  repository file itself, because the permission system refused that edit.
- **Spreadsheet behaviour.** I did not check whether spreadsheets treat a
  leading line feed or a fullwidth `＝` as a formula. The prefix set is exactly
  the report's, and neither is covered.

## Open questions or contradictions found

1. **Datetime and formula injection** (report §4 K1 contradicts itself).
   - The report validates `datetime` with `Date.parse` and says datetime cells
     are never prefixed.
   - V8's `Date.parse` accepts formula-leading strings such as
     `"@SUM(1) 2020"` and `"\t2020-01-01"` (probe above), so a datetime cell
     could carry a formula.
   - Decision: the encoder prefixes a datetime cell whose text starts with a
     formula character. Number and boolean values are still never prefixed,
     and ordinary ISO datetimes are unchanged.
   - Side effect: a rare expanded-year ISO string such as `+2020-01-01` would
     be prefixed. Tested in `encode-csv.test.ts`.
2. **`encryptedFieldIds?`.** The plan's Contracts section lists it on
   `AutomationStudioRunDatasetSummary`; report §4 K1 does not. I followed the
   report, because K1 refuses `encrypt`. K11 should add the optional field.
3. **K3 failure codes.** §2.7.2 names `record_output.encrypt_unavailable`,
   but the parser surfaces `record_schema.encrypt_unavailable` from the nested
   schema. K3 must map `record_schema.encrypt_unavailable` to
   `record_output.encrypt_unavailable`, and any other issue to
   `record_output.invalid`.
4. **Downstream open question: does Core's node parameter-schema dialect
   accept `oneOf`?** No.
   - **Node parameters** are not JSON Schema. `AutomationNodeParameter`
     (`packages/fluxiq/src/programs/automation-studio/nodes/contracts.ts:40-64`)
     has only `valueType`, `options`, and
     `constraints { minimum, maximum, minLength, maxLength, pattern, integer }`
     (`:56-63`), with no index signature.
     - Its validator, `parameterValueMatches`
       (`packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/validation.ts:221-244`),
       checks only those.
     - A `oneOf` key is a TypeScript excess-property error on a literal, and
       nothing reads it at run time.
   - **Recording event payloads** use a JSON-Schema-like dialect,
     `RecordingEventJsonSchema`. It is defined in
     `packages/contracts/src/automation-studio.ts` (lines 197-206 before this
     change, 200-209 after) and
     `packages/fluxiq/src/programs/automation-studio/model/recording-domain.ts:11`.
     - It supports `type`, `label`, `description`, `required`, `enum`,
       `properties`, `items`, and `metadata`, with no `oneOf`.
     - Its validator, `validateSchema` (`recording-domain.ts:261-285`), has no
       composition keywords.
   - **Domain output definitions.** `DomainOutputDefinition.schema?: JsonObject`
     (`packages/fluxiq/src/domains/index.ts:40`) is opaque. Core only compares
     it by `JSON.stringify` equality (`packages/fluxiq/src/io/index.ts:511,517`),
     so a `oneOf` there would be stored but never enforced.
   - **Where `oneOf` does appear** in non-test Core source: only LLM
     structured-output schemas.
     - `runtime/llm/deepseek-provider.ts:75` and `runtime/llm/evidence-loop.ts:241`;
     - `runtime/flow-bootstrap/plan/evidence-schema.ts:41` and `runtime/flow-bootstrap/plan/output-schema.ts:64`.
     - All four are under `packages/fluxiq/src/programs/automation-studio/`.
5. **Audit follow-up for the supervisor.** `docs/working/README.md` needs
   `pnpm structure:baseline` (or the index regeneration) after the latest
   working-document header changes. That is a shared-document edit outside
   worker ownership.
