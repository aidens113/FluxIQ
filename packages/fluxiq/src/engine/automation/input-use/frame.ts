import type { JsonObject, JsonValue } from "../../../core/index.ts";
import type { AutomationStudioInputRevision } from "../../../runtime/input-basis/contracts/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../contracts/index.ts";
import type { AutomationStudioRecordTraceSummary } from "../records/index.ts";
import type { AutomationStudioInputUseAuthority } from "./authority.ts";
import type { AutomationStudioInputUseChildCapture } from "./child-capture.ts";
import type { AutomationStudioInputUseLease } from "./lease.ts";
import type { AutomationStudioInputUseObservation } from "./observation.ts";
import type { AutomationStudioInputUseUnknown } from "./unknown.ts";
import type { AutomationStudioInputUseLocation } from "./location.ts";
import { AutomationStudioInputUseCapture as Capture } from "./capture.ts";
import { AutomationStudioInputUseLocationRead as Location } from "./location-read.ts";
import { AutomationStudioInputUseOperation as Operation } from "./operation.ts";
import { AutomationStudioInputUseOwnedCapture as Owned } from "./owned-capture/index.ts";
import { AutomationStudioInputUseNodeController as Nodes, type AutomationStudioInputUseNodeObservation, type AutomationStudioInputUseNodeRequest, type AutomationStudioInputUseNodeValues } from "./node/index.ts";

/** One private preparation and actual values initialization; never a whole-execution receipt. */
export class AutomationStudioGraphInputUseFrame {
  readonly lifetime = new AbortController();
  #lease: AutomationStudioInputUseLease | undefined;
  #inputs: JsonObject | undefined;
  #template: JsonObject | undefined;
  #reference: AutomationStudioInputRevision | undefined;
  #location: AutomationStudioInputUseLocation | undefined;
  #code: AutomationStudioInputUseUnknown | undefined;
  #consumed = false;
  #closed = false;
  #completed = false;
  #traces: object[] = [];
  #authority: AutomationStudioInputUseAuthority | undefined;
  #signal: AbortSignal | undefined;
  #record: (trace: object, observation: AutomationStudioInputUseObservation) => void;
  #boundary: AutomationStudioInputUseChildCapture | undefined;
  #records: Pick<AutomationStudioRecordTraceSummary, "captured"> | undefined;
  #recordNodes: (trace: object, observations: readonly AutomationStudioInputUseNodeObservation[]) => void;
  readonly #nodes: Nodes;

  constructor(authority: AutomationStudioInputUseAuthority | undefined, signal: AbortSignal | undefined,
    record: (trace: object, observation: AutomationStudioInputUseObservation) => void,
    recordNodes: (trace: object, observations: readonly AutomationStudioInputUseNodeObservation[]) => void,
    boundary?: AutomationStudioInputUseChildCapture, refusal?: AutomationStudioInputUseUnknown) {
    this.#authority = authority;
    this.#signal = signal;
    this.#record = record;
    this.#recordNodes = recordNodes;
    this.#nodes = new Nodes(authority, this.lifetime.signal, original => this.captured(original));
    this.#boundary = boundary;
    this.#code = refusal;
  }

  get inputs(): JsonObject | undefined { return this.#inputs; }
  get location(): AutomationStudioInputUseLocation | undefined { return this.#location; }
  get canFork(): boolean { return this.#lease !== undefined && this.#code === undefined && this.#consumed && !this.#closed; }

  async prepare(graphFlowId: string, options: AutomationStudioGraphExecutionOptions, suppliedInputs: JsonObject, activeSecrets: boolean, seeded: boolean): Promise<void> {
    if (this.#code) return;
    if (activeSecrets) return this.refuse("active_secrets");
    if (seeded) return this.refuse("resume_state_unverified");
    if (!this.#authority) return this.refuse("authority_unavailable");
    const location = Location.of(options.invocation, graphFlowId);
    const values = Capture.object(options.inputs ?? {});
    const defaults = options.declaredInputDefaults === undefined ? undefined : Capture.object(options.declaredInputDefaults);
    const supplied = Capture.object(suppliedInputs);
    if (location.status !== "bound") return this.refuse(location.code);
    if (values.status !== "valid" || supplied.status !== "valid" || defaults?.status === "invalid") return this.refuse("unsupported_input");
    this.#location = location.value;
    if (this.#boundary && (!Capture.same(this.#boundary.child, location.value) || !Capture.same(this.#boundary.boundary.inputs, supplied.value)
      || !Capture.same(this.#boundary.boundary.declaredInputDefaults, defaults?.value ?? {}))) return this.refuse("handoff_mismatch");
    const capture = Object.freeze({ values: values.value, location: location.value, ...(defaults ? { declaredInputDefaults: defaults.value } : {}), ...(this.#boundary ? { boundary: this.#boundary } : {}) });
    try {
      const opened = await Operation.run(this.#signal, this.lifetime.signal, () => this.#authority!.open(capture, this.#signal), late => {
        if (late.status === "bound") this.dispose(late.value);
      }, () => {
        this.refuse("authority_failed");
        this.publish();
      });
      if (opened.status !== "bound") return this.refuse(opened.code);
      this.#lease = opened.value;
      this.#reference = Capture.reference(opened.value.reference);
      if (!this.#reference) return this.refuse("invalid_reference");
      const current = await Operation.run(this.#signal, this.lifetime.signal, () => opened.value.verifyCurrent(this.#signal));
      if (current.status !== "bound" || current.value !== true) return this.refuse(current.status === "unknown" ? current.code : "authority_failed");
      const execution = Capture.object(opened.value.executionCopy(), false);
      if (execution.status !== "valid" || !Capture.same(execution.value, values.value)) return this.refuse("lease_mismatch");
      this.#template = values.value;
      this.#inputs = execution.value;
    } catch (error) {
      this.failure(error);
    }
  }

  /** The running graph's own record owner, bound once by the engine before its first node; never request data. */
  own(records: Pick<AutomationStudioRecordTraceSummary, "captured">): void {
    if (!this.#closed) this.#records ??= records;
  }

  /** Asks that live owner, by identity, whether ORIGINAL handoff objects reach a captured array or row. */
  captured(original: unknown): "clear" | "captured" | "unavailable" {
    return Owned.inspect(this.#closed ? undefined : this.#records, original);
  }

  /** One actual node callback: provable only while this frame's own entry is still sealable (t905 C1). */
  node<T>(request: AutomationStudioInputUseNodeRequest, call: (values: AutomationStudioInputUseNodeValues) => T): T | Promise<Awaited<T>> {
    const entry = this.canFork && this.#location && this.#reference ? { location: this.#location, reference: this.#reference } : undefined;
    return this.#nodes.invoke(entry, request, call);
  }

  /** This is the initializer the graph actually uses, not a reference attached beside it. */
  initialize(actualInputs: JsonObject): Record<string, JsonValue> {
    if (this.#lease && !this.#code && actualInputs === this.#inputs && Capture.same(actualInputs, this.#template)) this.#consumed = true;
    else if (!this.#code) this.refuse("lease_mismatch");
    return { ...actualInputs };
  }

  async complete(...traces: object[]): Promise<void> {
    this.#traces = traces;
    if (!this.#code && !this.#consumed) this.refuse("unconsumed");
    try {
      this.#signal?.throwIfAborted();
      if (!this.#code && this.#lease) {
        const current = await Operation.run(this.#signal, this.lifetime.signal, () => this.#lease!.verifyCurrent(this.#signal));
        if (current.status !== "bound" || current.value !== true) this.refuse(current.status === "unknown" ? current.code : "authority_failed");
        else if (!Capture.same(this.#reference, Capture.reference(this.#lease.reference))) this.refuse("lease_mismatch");
      }
    } catch {
      // A graph already produced its trace. Optional evidence cannot replace it with a new ending.
      this.refuse(this.#signal?.aborted ? "cancelled" : this.lifetime.signal.aborted ? "session_closed" : "authority_failed");
    }
    this.#completed = true;
    this.publish();
  }

  recordFailure(trace: object): void {
    this.#traces = [trace];
    this.refuse(this.#signal?.aborted ? "cancelled" : this.#code ?? "unconsumed");
    this.publish();
  }

  refuse(code: AutomationStudioInputUseUnknown): void {
    this.#code ??= code;
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    if (!this.#completed) this.refuse(this.#signal?.aborted ? "cancelled" : "unconsumed");
    this.lifetime.abort(new Error("input_use.controller_closed"));
    const lease = this.#lease;
    this.#lease = undefined;
    this.#inputs = undefined;
    this.#template = undefined;
    this.#boundary = undefined;
    this.#authority = undefined;
    this.#records = undefined;
    this.#nodes.close();
    if (lease) this.dispose(lease);
    this.publish();
    this.#traces = [];
    this.#signal = undefined;
  }

  private failure(error: unknown): void {
    this.refuse(this.#signal?.aborted ? "cancelled" : this.lifetime.signal.aborted ? "session_closed" : "authority_failed");
    Operation.propagateCancellation(error, this.#signal);
  }

  private dispose(lease: AutomationStudioInputUseLease): void {
    try { lease.close(); }
    catch {
      this.refuse("authority_failed");
      this.publish();
    }
  }

  private publish(): void {
    const observation: AutomationStudioInputUseObservation = !this.#code && this.#consumed && this.#reference && this.#location
      ? Object.freeze({ status: "sealed", coverage: "graph_entry_inputs", reference: this.#reference, location: this.#location })
      : Object.freeze({ status: "unknown", code: this.#code ?? "unconsumed" });
    const nodes = this.#nodes.observations(observation.status === "sealed");
    for (const trace of this.#traces) {
      this.#record(trace, observation);
      this.#recordNodes(trace, nodes);
    }
  }
}
