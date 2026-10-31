# Client-authored Flow script examples

Core retains the Flow script grammar, section order, parser and execution rules.
An evidence-runtime binding may provide `flowScriptExamples`: a version and
optional `format`, `act`, `loop` and `state` arrays of authored lines.

Binding validation copies and freezes the metadata independently of domain
system instructions. It rejects unknown fields, invalid versions, malformed
arrays and control characters, with a cumulative 64KiB UTF8 metadata bound.
This bound applies to authored configuration, not model output or evidence.
Snapshots preserve the original receiver of host callbacks and accessors.

The pure renderer appends each nonempty supplied array to its matching grammar
prefix with one newline. It preserves line order, indentation and blank lines.
Missing or empty sections add nothing. Core never infers examples from domain
names, node ids, system instructions or installed capabilities. Examples cannot
register a node or make it executable.

Candidate and subflow schemas carry the companion through their explicit
submission binding. The completion-schema factory retains its optional size
argument and accepts examples as a second optional argument. Its default uses
only grammar. Existing clients that omit the companion retain parser and
executor compatibility but receive no worked-example tails in their prompts.

The web adapter owns and supplies its four original example tails. Downstream
parity tests pin the original full section lengths and SHA256 digests, so the
explicit web rendering must remain byte-identical through this migration.
Inline medium-specific grammar prose, fact vocabulary, intent classification
and fingerprint contracts are separate migrations; extracting worked examples
does not by itself make every Core prompt medium-neutral.
