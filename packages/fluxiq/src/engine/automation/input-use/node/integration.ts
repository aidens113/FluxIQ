import { AutomationStudioGraphInputUsePort } from "../port.ts";
import type { AutomationStudioInputUseNodeRequest } from "./request.ts";
import type { AutomationStudioInputUseNodeValues } from "./values.ts";

/**
 * Engine dispatch's only node-use hook: it wraps the actual callback. With no session port the callback runs at once on
 * the request's own pair, exactly as before; the methodless port itself exposes nothing to call.
 */
export class AutomationStudioInputUseNodeIntegration {
  static invoke<T>(port: unknown, request: AutomationStudioInputUseNodeRequest, call: (values: AutomationStudioInputUseNodeValues) => T): T | Promise<Awaited<T>> {
    const controller = port === undefined ? undefined : AutomationStudioGraphInputUsePort.controller(port);
    return controller ? controller.node(request, call) : call(request.values);
  }
}
