import type { JsonObject } from "../../../core/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../contracts/index.ts";
import type { AutomationStudioInvocationOptions } from "../frames/index.ts";
import type { AutomationStudioInputUseAuthority } from "./authority.ts";
import type { AutomationStudioInputUseBoundaryCapture } from "./boundary-capture.ts";
import type { AutomationStudioInputUseChildCapture } from "./child-capture.ts";
import type { AutomationStudioInputUseObservation } from "./observation.ts";
import type { AutomationStudioInputUseUnknown } from "./unknown.ts";
import type { AutomationStudioGraphInputUsePort } from "./port.ts";
import { AutomationStudioGraphInputUseFrame } from "./frame.ts";
import { AutomationStudioInputUseCapture as Capture } from "./capture.ts";
import { AutomationStudioInputUseLocationRead as Location } from "./location-read.ts";
import { AutomationStudioInputUseOperation as Operation } from "./operation.ts";

/** Session-owned engine control, not the capability exposed through graph options. */
export class AutomationStudioGraphInputUseController {
  #frame: AutomationStudioGraphInputUseFrame | undefined;
  #used = false;
  #closed = false;
  #authority: AutomationStudioInputUseAuthority | undefined;
  #record: (trace: object, observation: AutomationStudioInputUseObservation) => void;
  #createChild: (authority: AutomationStudioInputUseAuthority | undefined, boundary: AutomationStudioInputUseChildCapture | undefined, refusal?: AutomationStudioInputUseUnknown) => AutomationStudioGraphInputUsePort;
  #boundary: AutomationStudioInputUseChildCapture | undefined;
  #refusal: AutomationStudioInputUseUnknown | undefined;

  constructor(authority: AutomationStudioInputUseAuthority | undefined,
    record: (trace: object, observation: AutomationStudioInputUseObservation) => void,
    createChild: (authority: AutomationStudioInputUseAuthority | undefined, boundary: AutomationStudioInputUseChildCapture | undefined, refusal?: AutomationStudioInputUseUnknown) => AutomationStudioGraphInputUsePort,
    boundary?: AutomationStudioInputUseChildCapture, refusal?: AutomationStudioInputUseUnknown) {
    this.#authority = authority;
    this.#record = record;
    this.#createChild = createChild;
    this.#boundary = boundary;
    this.#refusal = refusal;
  }

  async enter(graphFlowId: string, options: AutomationStudioGraphExecutionOptions, suppliedInputs: JsonObject, activeSecrets: boolean, seeded: boolean): Promise<AutomationStudioGraphInputUseFrame> {
    const refusal = this.#used ? "port_reused" : this.#closed ? "session_closed" : this.#refusal;
    if (this.#used) {
      this.#frame?.refuse("port_reused");
      this.#frame?.close();
    }
    this.#used = true;
    const frame = this.#frame = new AutomationStudioGraphInputUseFrame(this.#authority, options.signal, this.#record, this.#boundary, refusal);
    await frame.prepare(graphFlowId, options, suppliedInputs, activeSecrets, seeded);
    return frame;
  }

  async child(handoff: { status: "valid"; value: AutomationStudioInputUseBoundaryCapture } | { status: "invalid" }, parent: AutomationStudioInvocationOptions | undefined,
    child: AutomationStudioInvocationOptions | undefined, signal: AbortSignal, activeSecrets: boolean): Promise<AutomationStudioGraphInputUsePort> {
    if (activeSecrets) return this.#createChild(undefined, undefined, "active_secrets");
    if (this.#closed || !this.#frame?.canFork || !this.#authority) return this.#createChild(undefined, undefined, "parent_unverified");
    if (handoff.status !== "valid") return this.#createChild(undefined, undefined, "unsupported_input");
    const locations = Location.child(parent, child);
    if (locations.status !== "bound" || !Capture.same(this.#frame.location, locations.value.parent)) return this.#createChild(undefined, undefined, "unverified_frame");
    const captured = Object.freeze({ boundary: handoff.value, parent: locations.value.parent, child: locations.value.child });
    try {
      const authority = await Operation.run(signal, this.#frame.lifetime.signal, () => this.#authority!.child(captured, signal));
      return authority.status === "bound" ? this.#createChild(authority.value, captured) : this.#createChild(undefined, captured, authority.code);
    } catch (error) {
      Operation.propagateCancellation(error, signal);
      return this.#createChild(undefined, captured, this.#closed ? "session_closed" : "fork_unverified");
    }
  }

  recordFailure(trace: object): void {
    this.#frame?.recordFailure(trace);
  }

  close(): void {
    this.#closed = true;
    this.#frame?.close();
    this.#boundary = undefined;
    this.#authority = undefined;
  }
}
