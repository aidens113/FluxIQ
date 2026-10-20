// Compares a replay's capture with the recording event by event, at every
// delivery point, and writes the parity report (traces and offline trials,
// P3). Each recorded sequence is matched, diverged or outside gateway parity
// (a control input that bypassed the gateway, or the session view a trace
// took when it first claimed a session). A sequence missing from the trace, an
// event the replay lacks, one only the replay has, a field that differs, a
// delivery out of recorded order within its causal chain (D22,
// `causal-chains.ts`) and a differing artifact list are each a classified
// divergence. The verdict is `matched` only when none is. A disposition
// recorded under schema version 1 is compared on the fields it carries
// (`older-disposition.ts`); a legacy single-session trace's events arrive
// here with their session attached, and the report declares it.

import { CLIENT_GATEWAY_TRACE_LIFECYCLE_EVENTS } from "../../service/index.ts";
import type { ClientGatewayTraceEvent, ClientGatewayTraceManifest } from "../../trace/index.ts";
import { clientGatewayTraceCausalChains } from "./causal-chains.ts";
import { classifyClientGatewayTraceDivergence } from "./divergence-class.ts";
import { clientGatewayTraceEventDifferences } from "./event-differences.ts";
import { CLIENT_GATEWAY_TRACE_PARITY_NORMALIZATIONS } from "./normalizations.ts";
import { clientGatewayTraceOlderDispositionView } from "./older-disposition.ts";
import type {
  ClientGatewayTraceParityDivergence,
  ClientGatewayTraceParityEntry,
  ClientGatewayTraceParityNormalization,
  ClientGatewayTraceParityReport,
  ClientGatewayTraceReplayOutcome,
  ClientGatewayTraceSessionReferences
} from "../types.ts";

/** How a replay differs from live intake by construction. */
const DECLARED_DIFFERENCES: readonly string[] = Object.freeze([
  "inbound messages are fed one at a time, each awaited before the next, where live intake handles a socket's frames concurrently; order is compared per causal chain (D22): the inputs in the order received, each disposition after its own input, a command's messages, answers and outcomes in recorded order, and the remaining events in recorded order among themselves, so inputs whose handling overlapped live may finish in either order",
  "a command's answer wait runs out where the recording shows Core acting on its expiry, not on the clock",
  "a reconcile question's own wait (command-reconcile/) still runs on the real clock",
  "each session that existed before the trace began is paired by the replay and attached with the public view (client type, name, version, capabilities, metadata) the trace recorded when it first claimed it (D23); a trace without that record is attached as a custom client with the manifest's capabilities, if any"
]);

const NO_NAME = new Map<string, string>();

export function writeClientGatewayTraceParityReport(input: {
  manifest: ClientGatewayTraceManifest;
  events: readonly ClientGatewayTraceEvent[];
  lastSequence: number;
  outcome: ClientGatewayTraceReplayOutcome;
  sessionReferences: ClientGatewayTraceSessionReferences;
}): ClientGatewayTraceParityReport {
  const comparison = new Comparison(input.manifest, input.events, input.outcome);
  for (let sequence = 1; sequence <= input.lastSequence; sequence += 1) comparison.compare(sequence);
  comparison.extras();
  comparison.artifacts();
  const normalizations: ClientGatewayTraceParityNormalization[] = [...CLIENT_GATEWAY_TRACE_PARITY_NORMALIZATIONS.always];
  if (input.sessionReferences.status === "single_session") normalizations.push(CLIENT_GATEWAY_TRACE_PARITY_NORMALIZATIONS.onlySession);
  if (input.outcome.sessionIds.size > 0) normalizations.push(CLIENT_GATEWAY_TRACE_PARITY_NORMALIZATIONS.sessionIds);
  if (input.outcome.standIns.size > 0) normalizations.push(CLIENT_GATEWAY_TRACE_PARITY_NORMALIZATIONS.standIn);
  if (input.events.some(isClaimedView)) normalizations.push(CLIENT_GATEWAY_TRACE_PARITY_NORMALIZATIONS.claimedView);
  return Object.freeze({
    traceId: input.manifest.traceId,
    verdict: comparison.divergences.length === 0 ? "matched" : "diverged",
    sessionReferences: input.sessionReferences,
    entries: Object.freeze(comparison.entries),
    divergences: Object.freeze(comparison.divergences),
    normalizations: Object.freeze(normalizations),
    declaredDifferences: DECLARED_DIFFERENCES,
    replayEvents: input.outcome.replayEvents
  });
}

class Comparison {
  readonly entries: ClientGatewayTraceParityEntry[] = [];
  readonly divergences: ClientGatewayTraceParityDivergence[] = [];
  private readonly manifest: ClientGatewayTraceManifest;
  private readonly outcome: ClientGatewayTraceReplayOutcome;
  private readonly bySequence = new Map<number, ClientGatewayTraceEvent>();
  private readonly byId = new Map<string, ClientGatewayTraceEvent>();
  private readonly replayByKey = new Map<string, ClientGatewayTraceEvent>();
  private readonly matchedKeys = new Set<string>();
  /** Each command's recorded `server.execute_action`, by command id. */
  private readonly issuedBy = new Map<string, ClientGatewayTraceEvent>();
  /** Per causal chain, the latest replay sequence compared so far. */
  private readonly latestInChain = new Map<string, number>();
  private firstMissing: number | undefined;

  constructor(manifest: ClientGatewayTraceManifest, events: readonly ClientGatewayTraceEvent[], outcome: ClientGatewayTraceReplayOutcome) {
    this.manifest = manifest;
    this.outcome = outcome;
    for (const event of events) {
      this.bySequence.set(event.sequence, event);
      this.byId.set(event.eventId, event);
      if (event.kind === "outbound" && event.correlation.commandId !== null && event.messageType === "server.execute_action") this.issuedBy.set(event.correlation.commandId, event);
      else if (event.kind === "outbound" && event.correlation.commandId !== null && !this.issuedBy.has(event.correlation.commandId)) this.issuedBy.set(event.correlation.commandId, event);
    }
    for (const event of outcome.replayEvents) {
      const key = outcome.replayKeys.get(event.eventId);
      if (key !== undefined) this.replayByKey.set(key, event);
    }
  }

  compare(sequence: number): void {
    const event = this.bySequence.get(sequence);
    if (event === undefined) {
      this.firstMissing ??= sequence;
      this.diverge({ sequence, replaySequence: null, kind: null, messageType: null, class: "capture_gap", fields: ["event"], detail: this.missingDetail(sequence) });
      return;
    }
    // A claim's session view is compared like any recorded event (lead, P3): the replay's own tap records the view
    // it attached the session with, so a match proves the replay set the session up as the original had it.
    if (event.kind === "control") {
      this.entries.push({ sequence, kind: event.kind, messageType: event.messageType, status: "outside", replaySequence: null });
      return;
    }
    const key = this.outcome.originalKeys.get(event.eventId);
    const replay = key === undefined ? undefined : this.replayByKey.get(key);
    if (key !== undefined && replay !== undefined) this.matchedKeys.add(key);
    if (replay === undefined) {
      const gap = this.gapOf(event);
      const detail = gap ?? this.outcome.issueFailures.get(sequence) ?? "Core did not derive it in the replay";
      this.diverge({ sequence, replaySequence: null, kind: event.kind, messageType: event.messageType, class: gap === undefined ? "intake_defect" : "capture_gap", fields: ["event"], detail });
      return;
    }
    this.comparePair(event, replay);
  }

  /** Events only the replay has. */
  extras(): void {
    for (const event of this.outcome.replayEvents) {
      const key = this.outcome.replayKeys.get(event.eventId);
      if (key === undefined || this.matchedKeys.has(key) || isClaimedView(event)) continue;
      const gap = this.correlatedGap(event);
      this.divergences.push(Object.freeze({
        sequence: null,
        replaySequence: event.sequence,
        kind: event.kind,
        messageType: event.messageType,
        class: gap === undefined ? "intake_defect" : "capture_gap",
        fields: ["event"],
        detail: gap ?? "the replay derived an event the recording does not have"
      }));
    }
    for (const failure of this.outcome.failures) this.divergences.push(Object.freeze({ sequence: null, replaySequence: null, kind: null, messageType: null, class: "intake_defect", fields: ["gateway"], detail: failure }));
  }

  /** The artifacts each manifest lists, by digest, type and size, in order; a capture gap when the trace could not supply an artifact event's replay, whatever the reason. */
  artifacts(): void {
    const recorded = artifactSummaries(this.manifest);
    const replayed = artifactSummaries(this.outcome.replayManifest);
    if (recorded.join("\n") === replayed.join("\n")) return;
    const gap = [...this.bySequence.values()].filter((event) => event.kind === "artifact").map((event) => this.gapOf(event)).find((reason) => reason !== undefined);
    this.divergences.push(Object.freeze({
      sequence: null,
      replaySequence: null,
      kind: "artifact",
      messageType: null,
      class: gap === undefined ? "intake_defect" : "capture_gap",
      fields: ["manifest.artifacts"],
      detail: gap ?? `the replay took ${replayed.length} artifacts where the recording took ${recorded.length}, or different ones`
    }));
  }

  private comparePair(event: ClientGatewayTraceEvent, replay: ClientGatewayTraceEvent): void {
    const older = clientGatewayTraceOlderDispositionView(event, replay);
    const recorded = { event, keys: this.outcome.originalKeys, sessionIds: NO_NAME };
    const replayed = { event: older?.event ?? replay, keys: this.outcome.replayKeys, sessionIds: this.outcome.sessionIds };
    const fields = clientGatewayTraceEventDifferences(recorded, replayed, this.outcome.standIns.has(event.sequence));
    const base = { sequence: event.sequence, replaySequence: replay.sequence, kind: event.kind, messageType: event.messageType };
    const outOfOrder = this.outOfOrder(event, replay.sequence);
    if (fields.length > 0) {
      const classified = classifyClientGatewayTraceDivergence(fields, this.gapOf(event));
      this.diverge({ ...base, class: classified.class, fields, detail: classified.detail });
      return;
    }
    if (outOfOrder !== undefined) {
      this.diverge({ ...base, class: "nondeterminism", fields: ["sequence"], detail: `delivered in another order than recorded within its causal chain (${outOfOrder})` });
      return;
    }
    if (older !== undefined) {
      this.diverge({ ...base, class: "capture_gap", fields: [older.field], detail: older.gap });
      return;
    }
    this.entries.push({ ...base, status: "matched" });
  }

  /** The first causal chain of `event` in which its replay came before one recorded earlier, or `undefined`; notes its place in each. */
  private outOfOrder(event: ClientGatewayTraceEvent, replaySequence: number): string | undefined {
    let broken: string | undefined;
    for (const chain of clientGatewayTraceCausalChains(event, this.outcome.originalKeys)) {
      const latest = this.latestInChain.get(chain) ?? 0;
      if (replaySequence < latest) broken ??= chainName(chain);
      this.latestInChain.set(chain, Math.max(latest, replaySequence));
    }
    return broken;
  }

  private diverge(divergence: ClientGatewayTraceParityDivergence): void {
    this.entries.push({ sequence: divergence.sequence ?? 0, kind: divergence.kind, messageType: divergence.messageType, status: "diverged", replaySequence: divergence.replaySequence });
    this.divergences.push(Object.freeze({ ...divergence, fields: Object.freeze([...divergence.fields]) }));
  }

  /** Why the trace cannot support `event`'s replay, when the replay noted or the trace shows it cannot. */
  private gapOf(event: ClientGatewayTraceEvent): string | undefined {
    const noted = this.outcome.gaps.events.get(event.sequence) ?? this.correlatedGap(event);
    if (noted !== undefined) return noted;
    if (event.kind === "disposition") {
      const cause = event.correlation.causationEventId === null ? undefined : this.byId.get(event.correlation.causationEventId);
      return cause === undefined ? "the message it answers is missing from the trace" : this.gapOf(cause);
    }
    const commandId = event.correlation.commandId;
    const issued = commandId === null ? undefined : this.issuedBy.get(commandId);
    // What Core derived for a command the replay could not issue, because the trace lacked what issuing it needed.
    if (issued !== undefined && issued !== event) return this.outcome.gaps.events.get(issued.sequence) ?? this.correlatedGap(issued);
    if (this.firstMissing !== undefined && commandId !== null && issued === undefined) return `the trace lacks the command it belongs to (sequence ${this.firstMissing} is missing)`;
    return undefined;
  }

  private correlatedGap(event: ClientGatewayTraceEvent): string | undefined {
    const bySession = event.session === undefined ? undefined : this.outcome.gaps.sessions.get(event.session);
    const commandId = event.correlation.commandId;
    return bySession ?? (commandId === null ? undefined : this.outcome.gaps.commands.get(commandId));
  }

  private missingDetail(sequence: number): string {
    const loss = this.manifest.completeness.losses.find((item) => item.range.from <= sequence && (item.range.to === null || item.range.to >= sequence));
    return loss === undefined ? `sequence ${sequence} is missing from the trace` : `sequence ${sequence} was lost at capture (${loss.reason}: ${loss.detail})`;
  }
}

/** The session view a trace took when it first claimed a session: what the replay attaches the session with, never a delivery. */
function isClaimedView(event: ClientGatewayTraceEvent): boolean {
  return event.kind === "lifecycle" && event.messageType === CLIENT_GATEWAY_TRACE_LIFECYCLE_EVENTS.sessionClaimed;
}

/** A chain as the report names it: its kind, never an id. */
function chainName(chain: string): string {
  if (chain === "inputs") return "the inputs in the order received";
  if (chain.startsWith("input|")) return "an input and its disposition";
  if (chain.startsWith("command|")) return "one command's messages and outcomes";
  return "events correlated with no input or command";
}

/** The artifacts a manifest lists, in order, by digest, type and size. */
function artifactSummaries(manifest: ClientGatewayTraceManifest): string[] {
  return manifest.artifacts.map((artifact) => `${artifact.sha256} ${artifact.mediaType} ${artifact.byteLength}`);
}
