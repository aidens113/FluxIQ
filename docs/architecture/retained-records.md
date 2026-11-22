# Retained Record Data

Rows use the existing `JsonObject[]`, `AutomationStudioRecordSchema` and
`AutomationStudioRecordBatch` contracts. Field `valueType` describes the actual
JSON representation. Optional `semanticType` names text, number, currency,
count, date, datetime, URL, identity or flag semantics; optional `mark` names a
badge, flag or state on that actual occurrence. Original display strings stay
unchanged. Shared pure parsers interpret each actual row value; relative dates
use the run reference time. A detector's parsed column sample is never a value
for other rows. A validated `primaryKey` declares identity; arbitrary shared
links are not identity evidence.
Browser-safe clients validate and project schemas through
`fluxiq/components/automation`'s public `parseAutomationStudioRecordSchema` and
`storedAutomationStudioRecordSchema` exports, sharing the contract parser.

Requested columns are a presentation view over retained rows. Hidden filter,
ordering, identity and mark fields remain available to deterministic processing
and later attempts. The optional schema on answer-first stored rows and row
summaries carries this metadata independently of displayed columns. An execution
result's optional host `recordSchema` is strictly parsed: absent preserves legacy
inference, valid metadata is retained, and null means rejected metadata. Rejected
metadata produces an explicit row-storage failure without erasing the tool's
original effect, failure or evidence. Schema overflow is an error, never a slice.
An actual empty read with valid host schema stores a zero-row batch and dataset
identity, so restart can distinguish collected empty data from missing input.
Legacy empty calls without metadata retain their previous compatible behavior.
Materialized empty data alone never declares that the task succeeded.

`mergeAutomationStudioRecordSchemas` joins compatible page schemas in stable
field order. A field not present in every schema becomes optional. Known type
semantics and marks survive omitted metadata; conflicting physical types,
semantics, marks or handling are refused. Omitted handling means include.
Primary-key declarations must agree, including absence, so a common identity is
never invented. The caller's explicit schema-validation options are preserved;
runtime encryption availability is unchanged.

The run-dataset store reconciles compatible schemas and processing in the same
transaction as the append. A grown stored schema gets a canonical SHA-256 digest.
An earlier batch may retry with its original input digest after growth: batch
identity still replaces that batch rather than duplicating it. An identical
retry keeps row order, existing ordinals and a newer processing declaration.
A private canonical receipt hashes the original schema, processing and safe row
payload, distinguishing an earlier retry from a deliberate changed replacement.
Legacy null receipts retain the earlier replacement contract. Changed
replacements retain the existing replacement semantics. Schema/identity/policy conflicts leave prior
rows, schema and processing untouched.

Stored schemas omit excluded fields. Migration `0040_run_dataset_exclusions`
therefore adds a separate private nullable hash set for excluded field IDs;
neither excluded IDs nor values are stored in it. New datasets have a complete
empty/set policy. Every include on append is checked against it before row
writes; additive pages cannot resurrect exclusions. An explicit `startsOver`
replaces policy and rows atomically. A legacy null policy means the old store
forgot prior exclusions: existing-field appends remain possible, but growth
requires an explicit restart because safe additive fields cannot be distinguished
from previously excluded ones. Public schema and row responses do not expose
the private policy.

The evaluator's `retainedRows` and projected `rows` share exactly one selection,
dedupe, sort, limit and reference clock. Persistence keeps the retained answer
and its source provenance; public paging, streaming, CSV and JSON export apply
the requested view. Internal paging has separate `collected` and `answer` modes
and distinct cursor hashes. Only internal answer pages carry `displayColumns`,
while their schema describes the actual complete qualifying rows. Carry-on
copies collected rows, including fields the previous view hid.

Migration 0040 also marks old projected answers as `answer_rows_retained = 0`.
An internal retained answer read refuses that legacy projection until a normal
processing stage rebuilds it from collected rows. It never guesses missing
cells or runs a second evaluation at ambient time. New processing sets the
marker atomically with answer rows and its account; invalidation resets it.
Failed processing rolls all of them back. Old public views remain readable.

Provider-free regression coverage belongs beside contracts, answer-first row
ingestion, dataset storage and its migration. Tests use synthetic values and
throwaway databases, including additive pages, stale-batch retries, migration,
reopen, rollback, exclusion resurrection and export of the union schema.
