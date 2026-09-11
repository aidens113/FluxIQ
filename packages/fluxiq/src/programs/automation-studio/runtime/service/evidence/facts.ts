import type { JsonObject } from "../../../../../core/index.ts";
import { safeSegment } from "../../../../_shared/storage.ts";
import type { RecordingDomainDefinition } from "../../../model/index.ts";
import type { EvidenceFact, EvidenceObservation } from "../../../mining/index.ts";
import type { NormalizedTimeline } from "../../../normalization/index.ts";
import { compactJsonObject } from "../compact-json.ts";
import { formatStatePath, readableStatePath, readableTokenValue, stateValueSummary } from "./text.ts";

// One normalized timeline entry becomes one evidence fact, and each fact
// becomes the observations a reviewer reads. Titles and summaries are written
// here so the two layers describe an entry the same way.

export function createEvidenceFact(
  miningRunId: string,
  timeline: NormalizedTimeline,
  entry: NormalizedTimeline["timeline"][number],
  domain?: RecordingDomainDefinition
): EvidenceFact {
  const domainId = typeof entry.metadata?.domainId === "string" ? entry.metadata.domainId : undefined;
  const eventType = "eventType" in entry ? entry.eventType : undefined;
  const eventDefinition = domain && eventType ? domain.events.find((event) => event.eventType === eventType) : undefined;
  const title = factTitle(entry, eventDefinition?.label);
  return {
    schemaVersion: "0.1",
    factId: `fact.${safeSegment(timeline.recordingId)}.${safeSegment(entry.id)}`,
    miningRunId,
    recordingId: timeline.recordingId,
    normalizedTimelineId: timeline.normalizedTimelineId,
    kind: entry.type,
    title,
    summary: factSummary(entry, title),
    occurredAt: entry.timestamp,
    offsetMs: entry.monotonicOffsetMs,
    source: { layer: "normalized_timeline", artifactId: timeline.normalizedTimelineId, entryId: entry.id },
    ...(domainId ? { domain: { domainId, ...(eventType ? { eventType } : {}), ...(eventDefinition?.label ? { label: eventDefinition.label } : {}) } } : {}),
    data: compactJsonObject({
      ...(entry.type === "action" ? { actionType: entry.actionType, ...(entry.outputId ? { outputId: entry.outputId } : {}), ...(entry.confirmationInputId ? { confirmationInputId: entry.confirmationInputId, confirmationTimeoutMs: entry.confirmationTimeoutMs ?? 5_000 } : {}), target: entry.target as JsonObject | undefined, parameters: entry.parameters as JsonObject } : {}),
      ...(entry.type === "domain_event" ? { eventType: entry.eventType, payload: entry.payload } : {}),
      ...(entry.type === "state_delta" ? { deltas: entry.deltas as unknown as JsonObject[] } : {}),
      ...(entry.type === "observation" ? { observationType: entry.observationType, signals: entry.signals as JsonObject | undefined, payload: entry.payload } : {}),
      ...(entry.type === "marker" ? { label: entry.label } : {}),
      ...(entry.type === "note" ? { noteId: entry.noteId } : {})
    }),
    metadata: compactJsonObject({
      sourceId: entry.sourceId,
      ...(entry.correlationId ? { correlationId: entry.correlationId } : {}),
      ...(entry.metadata ?? {})
    })
  };
}

export function createEvidenceObservations(fact: EvidenceFact): EvidenceObservation[] {
  if (fact.kind === "state_delta" && Array.isArray(fact.data?.deltas)) {
    return fact.data.deltas.map((delta, index) => {
      const statePath = formatStatePath(String((delta as any).namespace ?? ""), String((delta as any).path ?? ""));
      const previous = (delta as any).previous;
      const current = (delta as any).current;
      return {
        schemaVersion: "0.1",
        observationId: `obs.${safeSegment(fact.factId)}.${index + 1}`,
        miningRunId: fact.miningRunId,
        recordingId: fact.recordingId,
        normalizedTimelineId: fact.normalizedTimelineId,
        kind: "state_changed",
        title: `${readableStatePath(statePath)} ${readableTokenValue(String((delta as any).change ?? "changed"))}`,
        summary: `${readableStatePath(statePath)} changed from ${stateValueSummary(previous)} to ${stateValueSummary(current)}.`,
        factIds: [fact.factId],
        subject: { type: "state", statePath, label: readableStatePath(statePath) },
        ...(previous && typeof previous === "object" && !Array.isArray(previous) ? { before: previous as JsonObject } : {}),
        ...(current && typeof current === "object" && !Array.isArray(current) ? { after: current as JsonObject } : {}),
        metadata: compactJsonObject({ change: (delta as any).change })
      };
    });
  }
  const kind: EvidenceObservation["kind"] = fact.kind === "action"
    ? "action_performed"
    : fact.kind === "domain_event"
      ? "domain_event_observed"
      : fact.kind === "state_checkpoint"
        ? "state_recorded"
        : fact.kind === "note"
          ? "note_added"
          : fact.kind === "marker"
            ? "marker_added"
            : "condition_observed";
  return [{
    schemaVersion: "0.1",
    observationId: `obs.${safeSegment(fact.factId)}`,
    miningRunId: fact.miningRunId,
    recordingId: fact.recordingId,
    normalizedTimelineId: fact.normalizedTimelineId,
    kind,
    title: fact.title,
    summary: fact.summary,
    factIds: [fact.factId],
    subject: compactJsonObject({
      type: fact.kind,
      ...(fact.domain?.eventType ? { eventType: fact.domain.eventType } : {}),
      ...(typeof fact.data?.actionType === "string" ? { actionType: fact.data.actionType } : {}),
      ...(typeof fact.data?.outputId === "string" ? { outputId: fact.data.outputId } : {}),
      ...(typeof fact.data?.confirmationInputId === "string" ? { confirmationInputId: fact.data.confirmationInputId, confirmationTimeoutMs: typeof fact.data.confirmationTimeoutMs === "number" ? fact.data.confirmationTimeoutMs : 5_000 } : {}),
      ...(fact.data?.parameters && typeof fact.data.parameters === "object" && !Array.isArray(fact.data.parameters) ? { parameters: fact.data.parameters } : {}),
      ...(fact.data?.target && typeof fact.data.target === "object" && !Array.isArray(fact.data.target) ? { target: fact.data.target } : {})
    }) as NonNullable<EvidenceObservation["subject"]>,
    ...(fact.domain ? { metadata: { domain: fact.domain } } : {})
  }];
}

export function factTitle(entry: NormalizedTimeline["timeline"][number], eventLabel?: string): string {
  if (entry.type === "action") return `Action: ${readableTokenValue(entry.actionType)}`;
  if (entry.type === "domain_event") return eventLabel ?? `Event: ${readableTokenValue(entry.eventType)}`;
  if (entry.type === "state_delta") return `State changed: ${entry.deltas.map((delta) => readableStatePath(formatStatePath(delta.namespace, delta.path))).slice(0, 3).join(", ")}`;
  if (entry.type === "state_checkpoint") return "State checkpoint recorded";
  if (entry.type === "observation") return `Observation: ${readableTokenValue(entry.observationType)}`;
  if (entry.type === "marker") return `Marker: ${entry.label}`;
  return "Note added";
}

export function factSummary(entry: NormalizedTimeline["timeline"][number], title: string): string {
  if (entry.type === "domain_event" && entry.payload) return `${title} with ${Object.keys(entry.payload).join(", ") || "payload"}.`;
  if (entry.type === "state_delta") return `${entry.deltas.length} state change${entry.deltas.length === 1 ? "" : "s"} observed.`;
  if (entry.type === "observation" && entry.signals) return `${Object.keys(entry.signals).length} signal${Object.keys(entry.signals).length === 1 ? "" : "s"} observed.`;
  return `${title} at ${entry.monotonicOffsetMs}ms.`;
}
