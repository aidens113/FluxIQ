import type { AutomationStudioGraphExecutionOptions } from "../../contracts/index.ts";
import { AutomationObservationBindings } from "../bindings.ts";
import { automationExecutionProperty } from "./callback/index.ts";

/** Descriptor checks return the original port; its existing owner keeps every call. */
export class AutomationExecutionPorts {
  static method<T>(options: AutomationStudioGraphExecutionOptions | undefined, original: T, key: PropertyKey): T {
    if (options) this.validate(options, original, [key]);
    return original;
  }

  static commandRun(options: AutomationStudioGraphExecutionOptions): AutomationStudioGraphExecutionOptions["commandRun"] {
    const port = automationExecutionProperty(options, options, "commandRun");
    this.validate(options, port, ["acceptsComposite", "own", "checkpoint", "context", "consume", "stop", "receipted", "withdraw"]);
    return port;
  }

  static runControl(options: AutomationStudioGraphExecutionOptions): AutomationStudioGraphExecutionOptions["runControl"] {
    const port = automationExecutionProperty(options, options, "runControl");
    this.validate(options, port, ["checkpoint", "heldBy"]);
    return port;
  }

  static subflowGraphs(options: AutomationStudioGraphExecutionOptions): AutomationStudioGraphExecutionOptions["subflowGraphs"] {
    const port = automationExecutionProperty(options, options, "subflowGraphs");
    this.validate(options, port, ["load", "recovery"]);
    return port;
  }

  private static validate(options: AutomationStudioGraphExecutionOptions, port: unknown, methods: readonly PropertyKey[]): void {
    if (!AutomationObservationBindings.of(options) || port === null || typeof port !== "object" && typeof port !== "function") return;
    for (const key of methods) automationExecutionProperty(options, port, key);
  }
}
