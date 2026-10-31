# Resolved control intent

A host's `resolvePlanNodeParameters` may return an optional `controlIntent`
companion on its `status: "resolved"` answer. This contextual authoring evidence
describes the one control Core asked the host to resolve:

```ts
type AutomationStudioResolvedControlIntent =
  | Readonly<{ intent: "accept"; responseOnly?: true }>
  | Readonly<{ intent: "dismiss" | "neutral" | "navigate" }>;
```

`accept` remains acceptance. `responseOnly: true` says the observed control only
answers the interruption containing it, rather than taking an underlying offer
or performing another act. Hosts derive that distinction from their actual
retained evidence, never from model-authored parameters, facts or metadata.
The annotation is neither permission nor an effect class, consequence
declaration, repeat-safety decision or instruction to press the control.
Automatic interruption clearing retains its stricter policy.

Core accepts only ordinary or null-prototype own-data records with the exact
discriminants above. No unknown or symbol key, inherited field or accessor is
accepted. Only accept can carry `responseOnly`, and its only supplied value is
literal `true`. An explicitly supplied `undefined` companion or field is
malformed. Omission alone remains compatible. Malformed metadata follows the
existing `bootstrap.parameter_resolution_invalid` refusal, never an absent
classification. Reading metadata runs no getters. Accepted values are copied
and frozen before the next node is resolved.

Core chooses sidecar keys from unambiguous JSON tuples of subflow and node
keys; dotted names cannot alias. Duplicate annotated tuples refuse instead of
overwriting. Only actual resolved plan nodes contribute entries. Fact-target
answers, untouched inherited nodes, unchanged/refused outcomes and model plan
JSON contribute none. Resolution and successful completion return the fresh
sidecar beside the plan. A frozen read-only view and private identity tracking
prevent arbitrary maps or provider result fields from becoming trusted input.
The private implementation lives at `runtime/llm/resolved-control-intent/`;
internal readers and key helpers are not package exports. The harness-options
barrel continues to export only the public companion type from that directory.

The shared candidate controller consumes this sidecar before relayout or other
transforms. Scoped subflow submissions use the same controller before they
rekey the accepted proposal. The existing way-out check still considers only
optional steps and handler bodies with explicitly empty consequences. A known
host `accept` without `responseOnly: true` produces
`flow_script.way_out_accepts` at the step's consequence line. A response-only
acceptance passes this additional semantic check. Bounded control wording is
used only for display; absent, long or misleading wording cannot hide a known
acceptance. Core has no English classification fallback and a model-written
dialog-consent fact grants no exception.

An explicitly lasting declaration still reaches the existing permission gate;
the companion cannot lower canonical effects, declarations or permission
requirements. Missing metadata supplies no new privilege and no safety proof.
The sidecar is not written to node parameters, graph metadata, fingerprints,
candidate records or saved Flows. Executable plans and their digests remain
identical when only the host annotation changes. This diagnostic applies to
candidate authoring; it does not add a new execution guard to existing saved
Flows or recovery patches.
