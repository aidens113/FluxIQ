# Private web runtime repeat observation producer

Source is frozen for lead integration and validation. No checks, tests, builds,
audits, browser calls, API calls, provider runs, panel management or git commands
were run, as required by the implementation brief during parallel authoring.

## Changes

- The native host retains up to 32 accepted capture bindings, keyed by the exact
  public state reference plus snapshot ID and timestamp. Existing previous-ref
  reuse retains its original observation; unretained/altered references abstain.
- The optional observer uses the exact binding's existing v7 state digest and
  issues no command. Digest/resource/subject metadata remains outside public
  references, summaries, Flow data and trace/model context.
- Positive shown-state gating checks capture totals and raw descriptors,
  settled loading/navigation, no truncation/unanswered frames, no dropped or
  withheld shown state, actual gateway session/source, safe location and document
  time origin. Hidden-element proof is not required. Child/mixed/unknown scope
  abstains because the current merged capture lacks each document incarnation.
- Explicit whole-page snapshot reads are targetless. Initially supported
  click/type/clear/select/element-extract targets require the existing unique,
  multi-signal, record/dialog/root-aware captured identity match and selector
  correlation. Handles, selectors and positions are excluded from subject keys.
  Row-input and visual bindings abstain because dispatch transforms their subject.
- Resource/subject tokens use bounded private interning, with a host-instance
  namespace, rather than a hash that could merge distinct resource identities.
  Interning eviction discards comparability and never reuses an earlier token.
- Architecture documentation records the seam, scope and checksum limits.

## Authored acceptance coverage

`domain/src/runtime/tests/host-runtime-repeat.test.ts` exercises the actual host
callback: equal shown state across fresh refs/selectors; changed values/view;
tab/session/document changes; malformed/partial/loading/unanswered/child capture;
independent and ambiguous target identity, record identity, wrappers and unsupported
targets; previous-ref reuse, altered refs and capture eviction; abort/getter failure;
bounded private token shapes, non-disclosure and zero additional commands.

These are authored tests, not observed passing results. Existing native behavior
and browser behavior have not been revalidated. Lead must rebuild Core's SDK
before downstream typecheck because the frozen Core source interface is 0.21
while the compiled SDK was still 0.20 when this work began.

## Source review and limits

Reviewed the observer's direct call chain: memo lookup, captured-target matching,
private token interning and return. It has no gateway/capture/action access.
The ordinary public capture summary and prior-ref reuse branches remain intact.
New capture metadata failure is caught and withholds private proof only.

V7 digest retains its documented equality-checksum/reordering/scroll omissions;
this producer grants no action permission, effect certainty or repeat safety.
Operations outside its explicit supported set remain unavailable. The merged
wire cannot establish completeness/incarnation for child documents, so those
views deliberately remain unproven rather than inheriting top-document identity.

Outcome: Done
Changed: Down domain/src/runtime/host-runtime.ts; domain/src/runtime/runtime-repeat/{index,capture,element-known,target,memo}.ts; domain/src/runtime/tests/host-runtime-repeat.test.ts; docs/architecture/element-identity.md; this report
Validation: not run (lead prohibited checks/builds/audits while parallel work remained active)
Not verified: TypeScript compilation, authored tests, existing identity/native regressions, structure audit, live browser behavior
Report: docs/working/framework-heavy-lifting-plan/reports/codex-1031/p8-repeat-history/host-implementation.md
Notes: Source frozen; no unrelated/shared-document edits. Lead owns rebuild, acceptance checks and git integration.
