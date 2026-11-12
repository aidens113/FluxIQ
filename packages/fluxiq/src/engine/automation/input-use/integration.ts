import type { JsonObject } from "../../../core/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../contracts/index.ts";
import type { AutomationStudioInvocationOptions } from "../frames/index.ts";
import type { AutomationStudioInputUseBoundaryCapture } from "./boundary-capture.ts";
import { AutomationStudioGraphInputUsePort } from "./port.ts";

/** Engine-only hooks. Exposed session/port objects contain none of these methods. */
export class AutomationStudioGraphInputUseIntegration {
  static accepts(port: unknown): port is AutomationStudioGraphInputUsePort {
    return AutomationStudioGraphInputUsePort.controller(port) !== undefined;
  }

  static enter(port: AutomationStudioGraphInputUsePort, graphFlowId: string, options: AutomationStudioGraphExecutionOptions, suppliedInputs: JsonObject, activeSecrets: boolean, seeded: boolean) {
    return AutomationStudioGraphInputUsePort.controller(port)!.enter(graphFlowId, options, suppliedInputs, activeSecrets, seeded);
  }

  static child(port: AutomationStudioGraphInputUsePort, handoff: { status: "valid"; value: AutomationStudioInputUseBoundaryCapture } | { status: "invalid" },
    parent: AutomationStudioInvocationOptions | undefined, child: AutomationStudioInvocationOptions | undefined, signal: AbortSignal, activeSecrets: boolean) {
    return AutomationStudioGraphInputUsePort.controller(port)!.child(handoff, parent, child, signal, activeSecrets);
  }

  static recordFailure(port: AutomationStudioGraphInputUsePort, trace: object): void {
    AutomationStudioGraphInputUsePort.controller(port)?.recordFailure(trace);
  }

  static close(port: AutomationStudioGraphInputUsePort): void {
    AutomationStudioGraphInputUsePort.controller(port)?.close();
  }
}
