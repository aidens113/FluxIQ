# Client-authored Flow control guidance

A trusted host may provide optional `flowScriptGuidance` on its evidence-runtime
binding: `{version, act?: {controlOperations?: readonly string[]}}`. This closed
contract has one insertion slot for operation advice. Core emits its choice and
observed ensureState rules first, then these paragraphs, then its optional-step,
interruption/consequence and final-check rules. Worked examples remain a separate
companion appended after each section. Core never infers guidance from examples,
domain identity, version, system instructions or registered operations.

Binding admission rejects nonplain records, unknown keys/symbols, inherited or
accessor fields, malformed revisions, sparse/decorated arrays and nonstring text.
Only LF control characters are accepted. A revision has 1–64 lowercase ASCII
letters/digits/dot/underscore/hyphen characters and starts with a letter or digit.
Guidance has an independent 64KiB UTF8 bound (revision, paragraphs and joining
LFs) and at most 4096 paragraphs. Validation copies and freezes every metadata
container; checked bindings prevent later replacement or addition while retaining
host callback receivers. This is authored configuration, never model output.

Missing metadata, missing slots and empty arrays add no paragraph or separator.
An authored empty string contributes one paragraph. Indentation and embedded LF
are retained exactly. `assertAutomationStudioFlowScriptGuidance(value, domainId)`
is the public untrusted-input admission gate. The pure typed
`renderAutomationStudioFlowScriptFormat(examples?, guidance?)` renderer assumes
validated metadata. The completion factory accepts `(size?, examples?, guidance?)`;
its existing format-only description stays unchanged. Actual candidate and subflow
submission schemas carry the explicit companion through their binding.

Client text cannot remove Core rules or register or authorize an operation.
String validation does not establish semantic safety of host prose; runtime
permissions, parser, retry and executor rules remain authoritative. Old callers
receive the retained Core act rules without client operation advice. The web
adapter owns its three original control-operation paragraphs and supplies both
companions to preserve its exact prompt bytes. Other mixed client wording, fact
vocabulary, intent classification and fingerprint migration remain separate work.
