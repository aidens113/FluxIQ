import type { AutomationStudioInputUseAuthority } from "./authority.ts";
import type { AutomationStudioInputUseObservation } from "./observation.ts";
import type { AutomationStudioInputUseChildCapture } from "./child-capture.ts";
import type { AutomationStudioInputUseUnknown } from "./unknown.ts";
import type { AutomationStudioInputUseRead } from "./read.ts";
import type { AutomationStudioInputUseNodeObservation } from "./node/index.ts";
import { AutomationStudioGraphInputUsePort } from "./port.ts";
import { AutomationStudioGraphInputUseController } from "./controller.ts";

/** Explicit lifetime and private trace associations; no ambient authority registry. */
export class AutomationStudioGraphInputUseSession {
  readonly port: AutomationStudioGraphInputUsePort;
  #records = new WeakMap<object, AutomationStudioInputUseObservation>();
  #nodes = new WeakMap<object, readonly AutomationStudioInputUseNodeObservation[]>();
  #controllers = new Set<AutomationStudioGraphInputUseController>();
  #closed = false;

  constructor(authority: AutomationStudioInputUseAuthority) {
    this.port = this.create(authority, undefined);
  }

  read(trace: object): AutomationStudioInputUseObservation {
    if (this.#closed) return { status: "unknown", code: "session_closed" };
    return this.#records.get(trace) ?? { status: "unknown", code: "unobserved" };
  }

  /** Read-only: the node callback events of the graph run that produced exactly this trace object (t905 C1). */
  readNodes(trace: object): AutomationStudioInputUseRead<readonly AutomationStudioInputUseNodeObservation[]> {
    if (this.#closed) return { status: "unknown", code: "session_closed" };
    const nodes = this.#nodes.get(trace);
    return nodes ? { status: "bound", value: nodes } : { status: "unknown", code: "unobserved" };
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    for (const controller of this.#controllers) controller.close();
    this.#controllers.clear();
    this.#records = new WeakMap();
    this.#nodes = new WeakMap();
  }

  private create(authority: AutomationStudioInputUseAuthority | undefined, boundary: AutomationStudioInputUseChildCapture | undefined, refusal?: AutomationStudioInputUseUnknown): AutomationStudioGraphInputUsePort {
    const controller = new AutomationStudioGraphInputUseController(authority, (trace, observation) => {
      if (!this.#closed) this.#records.set(trace, observation);
    }, (trace, nodes) => {
      if (!this.#closed) this.#nodes.set(trace, nodes);
    }, (childAuthority, childBoundary, why) => this.create(childAuthority, childBoundary, why), boundary, refusal);
    if (this.#closed) controller.close();
    else this.#controllers.add(controller);
    return new AutomationStudioGraphInputUsePort(controller);
  }
}
