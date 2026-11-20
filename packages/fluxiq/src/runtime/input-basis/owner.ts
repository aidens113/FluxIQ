import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { JsonObject } from "../../core/index.ts";
import type { AutomationStudioInputBasisOwnerPorts, AutomationStudioInputHead, AutomationStudioInputRead, AutomationStudioInputSnapshotReference, AutomationStudioNormalInputLease, AutomationStudioInputProducer, AutomationStudioInputRevision, AutomationStudioInputScope } from "./contracts/index.ts";
import { AutomationStudioInputBasisEncoding as Encoding } from "./encoding.ts";
import { automationStudioNormalInputLease } from "./lease.ts";

type Capture = Readonly<{ scope: AutomationStudioInputScope; values: JsonObject; producers: readonly AutomationStudioInputProducer[] }>;

/** The normal binding owner; engine use and replay admission are separate capabilities. */
export class AutomationStudioInputBasisOwner {
  constructor(private readonly ports: AutomationStudioInputBasisOwnerPorts) {}

  async observe(scope: AutomationStudioInputScope, values: JsonObject, producers: readonly AutomationStudioInputProducer[] = [], signal?: AbortSignal): Promise<AutomationStudioInputRead<AutomationStudioNormalInputLease>> {
    signal?.throwIfAborted();
    const result = await this.observeIn(scope, values, producers, signal);
    signal?.throwIfAborted();
    return result;
  }

  private async observeIn(scope: AutomationStudioInputScope, values: JsonObject, producers: readonly AutomationStudioInputProducer[], signal: AbortSignal | undefined): Promise<AutomationStudioInputRead<AutomationStudioNormalInputLease>> {
    // Isolated before the first await: mutation during inspection/storage cannot change this observation.
    const capturedScope = Encoding.scope(scope), checkedValues = Encoding.values(values), capturedProducers = Encoding.producers(producers);
    if (!capturedScope) return { status: "unknown", code: "invalid_scope" };
    if (checkedValues.status !== "valid" || !capturedProducers) return { status: "unknown", code: "unsupported_input" };
    const capturedValues = checkedValues.value;
    const capture: Capture = Object.freeze({ scope: capturedScope, values: capturedValues, producers: capturedProducers });
    const allowed = await this.authenticate(capture, signal);
    if (allowed.status === "unknown") return allowed;
    if (!this.ports.storage.durable) return { status: "unknown", code: "storage_unavailable" };
    let snapshot: AutomationStudioInputSnapshotReference | undefined;
    for (;;) {
      const state = await operation(signal, () => this.ports.storage.read(capturedScope));
      const head = state?.head;
      if (head) {
        const held = await operation(signal, () => this.ports.storage.readSnapshot(capturedScope, head));
        if (held === undefined) return { status: "unknown", code: "snapshot_unavailable" };
        const normal = Encoding.values(held);
        if (normal.status !== "valid") throw new Error("input_basis.snapshot_unreadable");
        if (isDeepStrictEqual(normal.value, capturedValues) && isDeepStrictEqual(head.producers, capturedProducers)) {
          const fresh = await this.authenticate(capture, signal);
          return fresh.status === "unknown" ? fresh : { status: "bound", value: this.lease(capture, head.reference) };
        }
      }
      const beforeWrite = await this.authenticate(capture, signal);
      if (beforeWrite.status === "unknown") return beforeWrite;
      snapshot ??= await operation(signal, () => this.ports.storage.writeSnapshot(capturedScope, capturedValues, capturedProducers));
      const ownerId = state?.ownerId ?? `input.owner.${randomUUID()}`;
      const reference = Encoding.reference({ ownerId, bindingId: head?.reference.bindingId ?? `input.binding.${randomUUID()}`, revision: head ? head.reference.revision + 1 : 1 });
      if (!reference) throw new Error("input_basis.revision_unavailable");
      const next: AutomationStudioInputHead = Object.freeze({ reference, snapshot, producers: capturedProducers });
      const written = await operation(signal, () => this.ports.storage.readSnapshot(capturedScope, next));
      const checked = written === undefined ? undefined : Encoding.values(written);
      if (checked?.status !== "valid" || !isDeepStrictEqual(checked.value, capturedValues)) return { status: "unknown", code: "snapshot_unavailable" };
      const beforeCommit = await this.authenticate(capture, signal);
      if (beforeCommit.status === "unknown") return beforeCommit;
      if (!await operation(signal, () => this.ports.storage.compareAndSwap(capturedScope, state, next))) continue;
      const published = await this.authenticate(capture, signal);
      return published.status === "unknown" ? published : { status: "bound", value: this.lease(capture, reference) };
    }
  }

  async reopen(scope: AutomationStudioInputScope, reference: AutomationStudioInputRevision, signal?: AbortSignal): Promise<AutomationStudioInputRead<AutomationStudioNormalInputLease>> {
    signal?.throwIfAborted();
    const read = await this.resolve(scope, reference, signal);
    signal?.throwIfAborted();
    return read.status === "unknown" ? read : { status: "bound", value: this.lease(read.value, read.value.reference) };
  }

  async verifyCurrent(scope: AutomationStudioInputScope, reference: AutomationStudioInputRevision, signal?: AbortSignal): Promise<AutomationStudioInputRead<true>> {
    signal?.throwIfAborted();
    const read = await this.resolve(scope, reference, signal);
    signal?.throwIfAborted();
    return read.status === "unknown" ? read : { status: "bound", value: true };
  }

  private lease(capture: Capture, reference: AutomationStudioInputRevision): AutomationStudioNormalInputLease {
    return automationStudioNormalInputLease(reference, capture.values, () => this.verifyCurrent(capture.scope, reference));
  }

  private async resolve(scope: AutomationStudioInputScope, reference: AutomationStudioInputRevision, signal: AbortSignal | undefined): Promise<AutomationStudioInputRead<Capture & { reference: AutomationStudioInputRevision }>> {
    const capturedScope = Encoding.scope(scope), requested = Encoding.reference(reference);
    if (!capturedScope) return { status: "unknown", code: "invalid_scope" };
    if (!requested) return { status: "unknown", code: "invalid_reference" };
    if (!await this.authorized(capturedScope, signal)) return { status: "unknown", code: "scope_unverified" };
    if (!this.ports.storage.durable) return { status: "unknown", code: "storage_unavailable" };
    const state = await operation(signal, () => this.ports.storage.read(capturedScope)), head = state?.head;
    if (!head) return { status: "unknown", code: "missing" };
    if (!isDeepStrictEqual(requested, head.reference)) return { status: "unknown", code: "stale" };
    const stored = await operation(signal, () => this.ports.storage.readSnapshot(capturedScope, head));
    if (stored === undefined) return { status: "unknown", code: "snapshot_unavailable" };
    const checkedValues = Encoding.values(stored);
    if (checkedValues.status !== "valid") throw new Error("input_basis.snapshot_unreadable");
    const values = checkedValues.value;
    const latest = await operation(signal, () => this.ports.storage.read(capturedScope));
    if (!isDeepStrictEqual(state, latest)) return { status: "unknown", code: "stale" };
    const capture = Object.freeze({ scope: capturedScope, values, producers: head.producers, reference: requested });
    const allowed = await this.authenticate(capture, signal);
    return allowed.status === "unknown" ? allowed : { status: "bound", value: capture };
  }

  private async authorized(scope: AutomationStudioInputScope, signal: AbortSignal | undefined): Promise<boolean> {
    try { return await operation(signal, () => this.ports.scopeAuthority?.authorize(scope)) === true; }
    catch (error) {
      propagateCancellation(error, signal);
      return false;
    }
  }

  private async authenticate(capture: Capture, signal: AbortSignal | undefined): Promise<AutomationStudioInputRead<true>> {
    if (!await this.authorized(capture.scope, signal)) return { status: "unknown", code: "scope_unverified" };
    try {
      if (await operation(signal, () => this.ports.secrecy?.inspect(capture)) !== "nonsecret") return { status: "unknown", code: "secrecy_unverified" };
    } catch (error) {
      propagateCancellation(error, signal);
      return { status: "unknown", code: "secrecy_unverified" };
    }
    for (const producer of capture.producers) {
      try {
        const owner = this.ports.producerOwners?.get(producer.reference.ownerId);
        const current = await operation(signal, () => owner?.verifyCurrent({ scope: capture.scope, role: producer.role }, producer.reference));
        if (current?.status !== "bound" || current.value !== true) return { status: "unknown", code: "producer_unverified" };
      } catch (error) {
        propagateCancellation(error, signal);
        return { status: "unknown", code: "producer_unverified" };
      }
    }
    return { status: "bound", value: true };
  }
}

function propagateCancellation(error: unknown, signal: AbortSignal | undefined): void {
  signal?.throwIfAborted();
  if ((error instanceof Error || error instanceof DOMException) && error.name === "AbortError") throw error;
}

/** Cancellation stops this operation's wait; an already-started storage commit may still finish. */
async function operation<T>(signal: AbortSignal | undefined, work: () => T | Promise<T>): Promise<T> {
  signal?.throwIfAborted();
  if (!signal) return await work();
  return await new Promise<T>((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener("abort", abort);
      reject(signal.reason);
    };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      abort();
      return;
    }
    Promise.resolve().then(() => {
      signal.throwIfAborted();
      return work();
    }).then(value => {
      signal.removeEventListener("abort", abort);
      if (signal.aborted) reject(signal.reason);
      else resolve(value);
    }, error => {
      signal.removeEventListener("abort", abort);
      reject(signal.aborted ? signal.reason : error);
    });
  });
}
