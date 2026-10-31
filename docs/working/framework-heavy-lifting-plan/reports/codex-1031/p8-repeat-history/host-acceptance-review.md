# Host acceptance source review

## Count correction

Fixed the producer mismatch in `runtime-repeat/capture.ts`: returned and
matched counts now correlate to raw shown descriptors, and candidates are
compared against that shown count rather than the full hidden-inclusive list.
Sanitized shown-count equality and all existing malformed/partial gates remain.

Source anchors:

- `apps/extension/src/content/dom-snapshot.ts:64` passes `shown` into
  `pageEvidence`; `snapshotElements` (183 onward) separately returns all entries
  and shown entries, and matched is `rendered.length` (204).
- `apps/extension/src/content/evidence/page.ts:56` sets returned from the supplied
  entries; it therefore counts shown descriptors even when the raw snapshot
  also includes hidden descriptors.
- Authored `host-runtime-repeat.test.ts` case compares an ordinary shown capture
  with a producer-shaped includeHidden:true capture carrying one extra hidden
  control but the same shown counts and shown semantic digest.

## Topology evidence gap

The current native merged capture does not carry an explicit complete frame
enumeration. `content/dom-snapshot.ts:77` writes frame isTop and viewportOffset
only. `background/connection/dom-snapshot.ts:184` turns a timed-out frame
enumeration into `[]`; lines 226 onward spread the top snapshot and add the
collected descriptors. Empty child frames contribute no stamped elements, and
missing enumeration is not distinguished from a genuine top-only page.
`mergePageEvidence` (394 onward) omits unansweredFrameIds when none are recorded.

`llm-evidence/page-evidence.ts:229` normalizes frame metadata and constructs
childFrameIds only from sanitized descriptor stamps. Missing childFrameIds is
therefore absence of reported child elements, not positive no-child proof.
The host's ordinary capture request is payload:{} and does not carry explicit
single-frame request provenance either.

Reported this contract tension to the lead before changing topology admission:
requiring explicit complete raw topology makes current ordinary merged captures
unavailable, including genuine top-only captures; maintaining success by treating
missing normalized child IDs as proof would preserve the reviewed defect.
Awaiting the lead's boundary decision; no producer/wire/Core changes are owned.

Validation: not run (parallel authoring prohibition). Tests are authored only.
