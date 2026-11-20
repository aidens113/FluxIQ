import type { AutomationStudioInputRevision } from "../../../../runtime/input-basis/contracts/index.ts";
import { automationStudioRunSecrets } from "../../../../runtime/run-secrets/index.ts";
import type { AutomationStudioInputUseAuthority } from "../authority.ts";
import type { AutomationStudioInputUseLocation } from "../location.ts";
import type { AutomationStudioInputUseRead } from "../read.ts";
import type { AutomationStudioInputUseUnknown } from "../unknown.ts";
import { AutomationStudioInputUseCapture as Capture } from "../capture.ts";
import { AutomationStudioInputUseOperation as Operation } from "../operation.ts";
import type { AutomationStudioInputUseNodeCapture } from "./capture.ts";
import type { AutomationStudioInputUseNodeConsumer } from "./consumer.ts";
import type { AutomationStudioInputUseNodeLease } from "./lease.ts";
import type { AutomationStudioInputUseNodeObservation } from "./observation.ts";
import type { AutomationStudioInputUseNodeRequest } from "./request.ts";
import type { AutomationStudioInputUseNodeValues } from "./values.ts";

type Lease = AutomationStudioInputUseNodeLease;
/** The frame's own graph entry while it is still sealable; a node event is never proved from anything else. */
type Entry = Readonly<{ location: AutomationStudioInputUseLocation; reference: AutomationStudioInputRevision }>;
type Prepared = { lease: Lease; reference: AutomationStudioInputRevision; values: AutomationStudioInputUseNodeValues };
/** Fixed when the event begins: a later change to the request object cannot relabel it. */
type Labels = Readonly<{ consumer: AutomationStudioInputUseNodeConsumer; nodeId: string; attemptId: string }>;
type Event = { readonly labels: Labels; readonly location?: AutomationStudioInputUseLocation; reference?: AutomationStudioInputRevision; code?: AutomationStudioInputUseUnknown; settled: boolean };
type Owned = (original: unknown) => "clear" | "captured" | "unavailable";

/** What a callback-input seal never covers, per branch: live state ports, native entry, effects and child entry stay B/C2/C3's. */
const UNCOVERED: Readonly<Record<AutomationStudioInputUseNodeConsumer, readonly string[]>> = Object.freeze({
  builtin: Object.freeze(["variables", "iteration", "random", "clock", "expectations", "effects"]),
  native_callback: Object.freeze(["native_implementation", "host_context", "effects"]),
  composite_callback: Object.freeze(["child_options", "child_entry", "effects"]),
  call_subflow: Object.freeze(["child_options", "child_entry"])
});

/**
 * One frame's node-invocation events (t905 C1). Each actual callback is its own private event; only a callback handed
 * the lease-checked prepared pair can seal, and only after its lease is current again. Without proof the callback runs
 * on the original pair at once: no copy, and no await.
 */
export class AutomationStudioInputUseNodeController {
  #authority: Pick<AutomationStudioInputUseAuthority, "node"> | undefined;
  readonly #lifetime: AbortSignal;
  readonly #owned: Owned;
  readonly #events: Event[] = [];
  readonly #leases = new Set<Lease>();
  #closed = false;

  constructor(authority: Pick<AutomationStudioInputUseAuthority, "node"> | undefined, lifetime: AbortSignal, owned: Owned) {
    this.#authority = authority;
    this.#lifetime = lifetime;
    this.#owned = owned;
  }

  invoke<T>(entry: Entry | undefined, request: AutomationStudioInputUseNodeRequest, call: (values: AutomationStudioInputUseNodeValues) => T): T | Promise<Awaited<T>> {
    const labels: Labels = Object.freeze({ consumer: request.consumer, nodeId: request.nodeId, attemptId: request.attemptId });
    const refusal = this.refusal(entry, request);
    // The snapshot is taken before the first evidence await; an unsupported value is never normalized into one.
    const snapshot = refusal ? undefined : Capture.object(request.values);
    if (!entry || !snapshot || snapshot.status !== "valid") {
      this.#events.push({ labels, code: refusal ?? "unsupported_input", settled: true });
      return call(request.values);
    }
    return this.proven(entry, labels, request, snapshot.value, call);
  }

  /**
   * Closed, frozen events. `entrySealed` is whether the frame's own graph entry is still sealed as it publishes:
   * a node event is proved only within that entry, so a withdrawn entry withdraws every node seal with it.
   */
  observations(entrySealed = true): readonly AutomationStudioInputUseNodeObservation[] {
    return Object.freeze(this.#events.map(event => observe(event, entrySealed)));
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#authority = undefined;
    for (const event of this.#events) if (!event.settled) event.code ??= "session_closed";
    for (const lease of this.#leases) dispose(lease);
    this.#leases.clear();
  }

  /** Synchronous refusals only: an absent or unknown proof must not add an await before the callback. */
  private refusal(entry: Entry | undefined, request: AutomationStudioInputUseNodeRequest): AutomationStudioInputUseUnknown | undefined {
    if (this.#closed) return "session_closed";
    if (!entry) return "entry_unverified";
    if (automationStudioRunSecrets() !== undefined) return "active_secrets";
    if (typeof this.#authority?.node !== "function") return "authority_unavailable";
    // Identity against the live run's own captured rows, on the ORIGINAL pair: a copy would lose their markers.
    const owned = this.#owned(request.values);
    return owned === "clear" ? undefined : owned === "captured" ? "captured_records" : "records_unavailable";
  }

  private async proven<T>(entry: Entry, labels: Labels, request: AutomationStudioInputUseNodeRequest, snapshot: AutomationStudioInputUseNodeValues,
    call: (values: AutomationStudioInputUseNodeValues) => T): Promise<Awaited<T>> {
    const capture: AutomationStudioInputUseNodeCapture = Object.freeze({ values: snapshot, consumer: labels.consumer, location: entry.location, entry: entry.reference,
      nodeId: labels.nodeId, attemptId: labels.attemptId, refreshed: request.refreshed === true, occurrence: request.occurrence });
    let prepared: AutomationStudioInputUseRead<Prepared>;
    try {
      prepared = await this.prepare(capture, request.signal);
    } catch (error) {
      // Thrown only for the run's own cancellation: the callback never runs, and the gate leaves its disposition.
      this.#events.push({ labels, code: "cancelled", settled: true });
      throw error;
    }
    if (prepared.status !== "bound") {
      this.#events.push({ labels, code: prepared.code, settled: true });
      return await call(request.values);
    }
    const event: Event = { labels, location: entry.location, reference: prepared.value.reference, settled: false };
    this.#events.push(event);
    try {
      return await call(prepared.value.values);
    } finally {
      await this.finish(event, prepared.value.lease, request.signal);
    }
  }

  /** Opens, checks and copies one lease. Any refusal has already closed it; a late lease is closed once on arrival. */
  private async prepare(capture: AutomationStudioInputUseNodeCapture, signal: AbortSignal | undefined): Promise<AutomationStudioInputUseRead<Prepared>> {
    let lease: Lease | undefined;
    try {
      const opened = await Operation.run(signal, this.#lifetime, () => this.#authority!.node!(capture, signal), late => {
        if (late.status === "bound") dispose(late.value);
      });
      if (opened.status !== "bound") return { status: "unknown", code: opened.code };
      if (!opened.value || typeof opened.value !== "object") return { status: "unknown", code: "authority_failed" };
      lease = opened.value;
      this.#leases.add(lease);
      const checked = await this.check(lease, capture.values, signal);
      if (checked.status !== "bound") this.release(lease);
      return checked;
    } catch (error) {
      if (lease) this.release(lease);
      Operation.propagateCancellation(error, signal);
      return { status: "unknown", code: this.#lifetime.aborted ? "session_closed" : "authority_failed" };
    }
  }

  private async check(lease: Lease, snapshot: AutomationStudioInputUseNodeValues, signal: AbortSignal | undefined): Promise<AutomationStudioInputUseRead<Prepared>> {
    const reference = Capture.reference(lease.reference);
    if (!reference) return { status: "unknown", code: "invalid_reference" };
    const current = await Operation.run(signal, this.#lifetime, () => lease.verifyCurrent(signal));
    if (current.status !== "bound" || current.value !== true) return { status: "unknown", code: current.status === "unknown" ? current.code : "authority_failed" };
    const copy = Capture.object(lease.executionCopy(), false);
    if (copy.status !== "valid" || !Capture.same(copy.value, snapshot)) return { status: "unknown", code: "lease_mismatch" };
    return { status: "bound", value: { lease, reference, values: copy.value } };
  }

  /** After the callback, whatever it did: the lease must still be current and the same, then it closes exactly once. */
  private async finish(event: Event, lease: Lease, signal: AbortSignal | undefined): Promise<void> {
    try {
      const current = await Operation.run(signal, this.#lifetime, () => lease.verifyCurrent(signal));
      if (current.status !== "bound" || current.value !== true) event.code ??= current.status === "unknown" ? current.code : "authority_failed";
      else if (!Capture.same(event.reference, Capture.reference(lease.reference))) event.code ??= "lease_mismatch";
    } catch {
      // The callback already ran; a failed freshness check leaves its event unknown and never replaces its outcome.
      event.code ??= signal?.aborted ? "cancelled" : this.#lifetime.aborted ? "session_closed" : "authority_failed";
    }
    if (!this.release(lease)) event.code ??= "authority_failed";
    event.settled = true;
  }

  /** Closes a held lease once; one already released by close() is not closed again. */
  private release(lease: Lease): boolean {
    return this.#leases.delete(lease) ? dispose(lease) : true;
  }
}

function dispose(lease: Lease): boolean {
  try {
    lease.close();
    return true;
  } catch {
    return false;
  }
}

function observe(event: Event, entrySealed: boolean): AutomationStudioInputUseNodeObservation {
  const labels = { ...event.labels, uncovered: UNCOVERED[event.labels.consumer] };
  if (!event.code && event.settled && event.reference && event.location) {
    return entrySealed ? Object.freeze({ status: "sealed", coverage: "node_invocation_values", reference: event.reference, location: event.location, ...labels })
      : Object.freeze({ status: "unknown", code: "entry_unverified", ...labels });
  }
  return Object.freeze({ status: "unknown", code: event.code ?? "incomplete", ...labels });
}
