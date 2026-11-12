import type { AutomationStudioInputUseAuthority } from "./authority.ts";
import type { AutomationStudioInputUseObservation } from "./observation.ts";
import type { AutomationStudioInputUseChildCapture } from "./child-capture.ts";
import type { AutomationStudioInputUseUnknown } from "./unknown.ts";
import { AutomationStudioGraphInputUsePort } from "./port.ts";
import { AutomationStudioGraphInputUseController } from "./controller.ts";

/** Explicit lifetime and private trace associations; no ambient authority registry. */
export class AutomationStudioGraphInputUseSession {
  readonly port: AutomationStudioGraphInputUsePort;
  #records = new WeakMap<object, AutomationStudioInputUseObservation>();
  #controllers = new Set<AutomationStudioGraphInputUseController>();
  #closed = false;

  constructor(authority: AutomationStudioInputUseAuthority) {
    this.port = this.create(authority, undefined);
  }

  read(trace: object): AutomationStudioInputUseObservation {
    if (this.#closed) return { status: "unknown", code: "session_closed" };
    return this.#records.get(trace) ?? { status: "unknown", code: "unobserved" };
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    for (const controller of this.#controllers) controller.close();
    this.#controllers.clear();
    this.#records = new WeakMap();
  }

  private create(authority: AutomationStudioInputUseAuthority | undefined, boundary: AutomationStudioInputUseChildCapture | undefined, refusal?: AutomationStudioInputUseUnknown): AutomationStudioGraphInputUsePort {
    const controller = new AutomationStudioGraphInputUseController(authority, (trace, observation) => {
      if (!this.#closed) this.#records.set(trace, observation);
    }, (childAuthority, childBoundary, why) => this.create(childAuthority, childBoundary, why), boundary, refusal);
    if (this.#closed) controller.close();
    else this.#controllers.add(controller);
    return new AutomationStudioGraphInputUsePort(controller);
  }
}
