// Whether a trace's evidence is all there (source plan 5.4; source test T14).
// The evaluator reads the evidence itself -- the events, the artifacts a store
// holds, the recorder's declared losses -- and never trusts a recorder's
// `complete` claim alone. Every problem is tagged by the sequence range or the
// artifact it affects, so a consumer can mark only that scope inconclusive.
// Missing evidence never evaluates as complete: a trace that was never closed
// is truncated unless the caller knows its recorder is still writing, and an
// artifact an event references by digest must have reached this trace first.
//
// Redactions are reported apart, as fidelity limitations: the evidence is
// present but withheld, so the scope cannot pass exact parity, yet the capture
// itself is whole.

import type {
  ClientGatewayTraceArtifactEntry,
  ClientGatewayTraceArtifactPresence,
  ClientGatewayTraceCompleteness,
  ClientGatewayTraceCompletenessInput,
  ClientGatewayTraceCompletenessIssue,
  ClientGatewayTraceEvent,
  ClientGatewayTraceFidelityLimitation,
  ClientGatewayTraceIssueCode,
  ClientGatewayTraceLoss,
  ClientGatewayTraceManifest,
  ClientGatewayTraceSequenceRange
} from "./types.ts";
import { CLIENT_GATEWAY_TRACE_CAPTURE_BOUNDARY_VERSION, CLIENT_GATEWAY_TRACE_SCHEMA_VERSION } from "./versions.ts";

type Issues = ClientGatewayTraceCompletenessIssue[];

/** The trace's completeness status, every issue that makes it incomplete, and its redaction-limited scopes. */
export function evaluateClientGatewayTraceCompleteness(input: ClientGatewayTraceCompletenessInput): ClientGatewayTraceCompleteness {
  const { manifest } = input;
  const closed = manifest.closedAt !== null;
  const issues: Issues = [];
  contractIssues(input, issues);
  for (const loss of manifest.completeness.losses) {
    issues.push(issue(loss.reason, loss.range, null, loss.detail));
  }
  const events = orderedEvents(manifest, input.events, issues);
  coverageIssues(manifest, events, input.recorderActive, issues);
  correlationIssues(manifest, events, issues);
  artifactIssues(manifest, events, input.availableArtifacts, issues);
  referencedDigestIssues(manifest, events, issues);
  if (manifest.completeness.status === "incomplete" && issues.length === 0) {
    issues.push(issue("declared_incomplete", null, null, "the recorder declared this trace incomplete"));
  }
  const status = issues.length > 0 ? "incomplete" : closed ? "complete" : "open";
  return Object.freeze({ status, issues: Object.freeze(issues), limitations: Object.freeze(redactionLimitations(events)) });
}

function issue(code: ClientGatewayTraceIssueCode, range: ClientGatewayTraceSequenceRange | null, artifactId: string | null, detail: string): ClientGatewayTraceCompletenessIssue {
  return Object.freeze({ code, range: range === null ? null : Object.freeze({ from: range.from, to: range.to }), artifactId, detail });
}

function at(sequence: number): ClientGatewayTraceSequenceRange {
  return { from: sequence, to: sequence };
}

function contractIssues(input: ClientGatewayTraceCompletenessInput, issues: Issues): void {
  const { manifest, compatibility } = input;
  if (manifest.traceSchemaVersion !== CLIENT_GATEWAY_TRACE_SCHEMA_VERSION) {
    issues.push(issue("incompatible_contract", null, null, `trace schema version ${manifest.traceSchemaVersion}; this reader reads ${CLIENT_GATEWAY_TRACE_SCHEMA_VERSION}`));
  }
  if (manifest.captureBoundaryVersion !== CLIENT_GATEWAY_TRACE_CAPTURE_BOUNDARY_VERSION) {
    issues.push(issue("incompatible_contract", null, null, `capture boundary version ${manifest.captureBoundaryVersion}; this reader reads ${CLIENT_GATEWAY_TRACE_CAPTURE_BOUNDARY_VERSION}`));
  }
  if (compatibility.status === "compatible") return;
  if (compatibility.contracts.length === 0) issues.push(issue("incompatible_contract", null, null, "the trace's contracts were judged incompatible"));
  for (const contract of compatibility.contracts) {
    issues.push(issue("incompatible_contract", null, null, `${contract.name}@${contract.recordedVersion ?? "absent"}: ${contract.detail}`));
  }
}

/** This trace's events, one per sequence, in sequence order; every foreign or conflicting event is an issue. */
function orderedEvents(manifest: ClientGatewayTraceManifest, input: readonly ClientGatewayTraceEvent[], issues: Issues): ClientGatewayTraceEvent[] {
  const bySequence = new Map<number, ClientGatewayTraceEvent>();
  for (const event of input) {
    if (event.traceId !== manifest.traceId) {
      issues.push(issue("foreign_event", at(event.sequence), null, `event ${event.eventId} belongs to trace ${event.traceId}`));
      continue;
    }
    if (!Number.isInteger(event.sequence) || event.sequence < 1) {
      issues.push(issue("sequence_conflict", null, null, `event ${event.eventId} has an invalid sequence ${event.sequence}`));
      continue;
    }
    if (bySequence.has(event.sequence)) {
      issues.push(issue("sequence_conflict", at(event.sequence), null, `two events claim sequence ${event.sequence}`));
      continue;
    }
    if (!manifest.streams.includes(event.stream)) {
      issues.push(issue("undeclared_stream", at(event.sequence), null, `stream "${event.stream}" is not declared in the manifest`));
    }
    bySequence.set(event.sequence, event);
  }
  return [...bySequence.values()].sort((left, right) => left.sequence - right.sequence);
}

/** The parts of `from..to` no declared loss covers (declared losses are already issues). */
function undeclared(from: number, to: number, losses: readonly ClientGatewayTraceLoss[]): ClientGatewayTraceSequenceRange[] {
  const sorted = [...losses].sort((left, right) => left.range.from - right.range.from);
  const parts: ClientGatewayTraceSequenceRange[] = [];
  let cursor = from;
  for (const loss of sorted) {
    const lossTo = loss.range.to ?? Number.POSITIVE_INFINITY;
    if (lossTo < cursor || loss.range.from > to) continue;
    if (loss.range.from > cursor) parts.push({ from: cursor, to: loss.range.from - 1 });
    cursor = Math.max(cursor, lossTo + 1);
    if (cursor > to) return parts;
  }
  if (cursor <= to) parts.push({ from: cursor, to });
  return parts;
}

function coverageIssues(manifest: ClientGatewayTraceManifest, events: readonly ClientGatewayTraceEvent[], recorderActive: boolean, issues: Issues): void {
  const { lastSequence, losses } = manifest.completeness;
  let expected = 1;
  for (const event of events) {
    if (event.sequence > expected) {
      for (const gap of undeclared(expected, event.sequence - 1, losses)) issues.push(issue("sequence_gap", gap, null, `sequences ${gap.from}-${gap.to} are missing`));
    }
    if (event.sequence > lastSequence) {
      issues.push(issue("sequence_conflict", at(event.sequence), null, `sequence ${event.sequence} is past the declared last sequence ${lastSequence}`));
    }
    expected = event.sequence + 1;
  }
  if (manifest.closedAt === null) {
    if (!recorderActive) issues.push(issue("truncated", { from: expected, to: null }, null, "the trace was never closed and no recorder is writing it"));
    return;
  }
  if (lastSequence >= expected) {
    for (const tail of undeclared(expected, lastSequence, losses)) issues.push(issue("truncated", tail, null, `sequences ${tail.from}-${tail.to} at the end of the trace are missing`));
  }
}

function correlationIssues(manifest: ClientGatewayTraceManifest, events: readonly ClientGatewayTraceEvent[], issues: Issues): void {
  const byId = new Map<string, ClientGatewayTraceEvent>();
  const revisions = new Set<string>();
  for (const event of events) {
    if (byId.has(event.eventId)) issues.push(issue("sequence_conflict", at(event.sequence), null, `event id ${event.eventId} repeats`));
    const { causationEventId, baseRevision, observationRevision } = event.correlation;
    const cause = causationEventId === null ? undefined : byId.get(causationEventId);
    if (causationEventId !== null && cause === undefined) {
      issues.push(issue("broken_correlation", at(event.sequence), null, `cause ${causationEventId} was not delivered before this event`));
    }
    if (event.kind === "disposition" && cause?.kind !== "inbound") {
      issues.push(issue("broken_correlation", at(event.sequence), null, "a disposition must name the earlier inbound event it disposes of"));
    }
    if (baseRevision !== null && !revisions.has(baseRevision)) {
      issues.push(issue("broken_correlation", at(event.sequence), null, `base revision ${baseRevision} was not delivered before this event`));
    }
    if (observationRevision !== null) revisions.add(observationRevision);
    byId.set(event.eventId, event);
  }
  const bySequence = new Map(events.map((event) => [event.sequence, event]));
  for (const checkpoint of manifest.checkpoints) {
    const event = bySequence.get(checkpoint.sequence);
    const revisionMatches = checkpoint.observationRevision === null || event?.correlation.observationRevision === checkpoint.observationRevision;
    if (event === undefined || !revisionMatches) {
      issues.push(issue("broken_correlation", at(checkpoint.sequence), null, `checkpoint ${checkpoint.id} has no matching event`));
    }
  }
}

function artifactIssues(
  manifest: ClientGatewayTraceManifest,
  events: readonly ClientGatewayTraceEvent[],
  availableArtifacts: readonly ClientGatewayTraceArtifactPresence[],
  issues: Issues
): void {
  const held = new Map(availableArtifacts.map((artifact) => [artifact.id, artifact]));
  const inventory = new Map(manifest.artifacts.map((entry) => [entry.id, entry]));
  const bySequence = new Map(events.map((event) => [event.sequence, event]));
  if (inventory.size !== manifest.artifacts.length) issues.push(issue("artifact_integrity", null, null, "an artifact id repeats in the inventory"));
  for (const entry of manifest.artifacts) {
    const copy = held.get(entry.id);
    if (copy === undefined) {
      issues.push(issue("missing_artifact", at(entry.sequence), entry.id, `artifact ${entry.id} is not available`));
    } else if (copy.sha256 !== entry.sha256 || copy.byteLength !== entry.byteLength) {
      issues.push(issue("artifact_integrity", at(entry.sequence), entry.id, `artifact ${entry.id} does not match its recorded digest`));
    }
    const arrival = bySequence.get(entry.sequence);
    if (arrival === undefined || arrival.kind !== "artifact" || !arrival.artifactIds.includes(entry.id)) {
      issues.push(issue("broken_correlation", at(entry.sequence), entry.id, `no artifact event at sequence ${entry.sequence} delivers ${entry.id}`));
    }
  }
  for (const event of events) {
    for (const artifactId of event.artifactIds) {
      const entry = inventory.get(artifactId);
      if (entry === undefined) {
        issues.push(issue("missing_artifact", at(event.sequence), artifactId, `event ${event.eventId} references an artifact the trace never captured`));
      } else if (entry.sequence > event.sequence) {
        issues.push(issue("broken_correlation", at(event.sequence), artifactId, `event ${event.eventId} references an artifact delivered later`));
      }
    }
  }
}

/**
 * Every digest an event references must name an artifact this trace captured
 * at or before that event. One captured only in another trace, or never, is
 * missing here; one captured only later cannot have been what the event saw.
 * Whether the bytes are still held is the inventory's check above.
 */
function referencedDigestIssues(manifest: ClientGatewayTraceManifest, events: readonly ClientGatewayTraceEvent[], issues: Issues): void {
  const bySha256 = new Map<string, ClientGatewayTraceArtifactEntry[]>();
  for (const entry of manifest.artifacts) {
    const held = bySha256.get(entry.sha256);
    if (held === undefined) bySha256.set(entry.sha256, [entry]);
    else held.push(entry);
  }
  for (const event of events) {
    for (const digest of event.referencedDigests) {
      const entries = bySha256.get(digest) ?? [];
      if (entries.length === 0) {
        issues.push(issue("missing_artifact", at(event.sequence), null, `event ${event.eventId} references artifact sha256 ${digest}, which this trace never captured`));
        continue;
      }
      if (entries.some((entry) => entry.sequence <= event.sequence)) continue;
      const laterId = entries[0]?.id ?? null;
      issues.push(issue("broken_correlation", at(event.sequence), laterId, `event ${event.eventId} references artifact sha256 ${digest}, which this trace captured only later`));
    }
  }
}

function redactionLimitations(events: readonly ClientGatewayTraceEvent[]): ClientGatewayTraceFidelityLimitation[] {
  const limitations: ClientGatewayTraceFidelityLimitation[] = [];
  for (const event of events) {
    for (const redaction of event.redactions) {
      limitations.push(Object.freeze({ code: "redaction_limited", range: Object.freeze(at(event.sequence)), path: redaction.path, reason: redaction.reason }));
    }
  }
  return limitations;
}
