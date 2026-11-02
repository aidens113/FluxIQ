import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { ElementMatcher } from "../../../../runtime/target-matching/index.ts";
import type { AutomationStudioNativeLogEntry } from "../../../../runtime/automation-host/index.ts";
export type AutomationStudioNativeNodeContext = {
  inputs: Readonly<Record<string, JsonValue>>;
  parameters: Readonly<Record<string, JsonValue>>;
  signal: AbortSignal;
  grants: Readonly<{
    permissions: string[];
    runtimeCapabilities: string[];
    networkDestinations: string[];
    secretHandles: string[];
    filesystemRoots: string[];
    process: boolean;
    childProcess: boolean;
  }>;
  host?: Readonly<{
    /** The enclosing execution's fixed reference for relative task dates. */
    referenceNow?: number;
    capabilityIds: string[];
    currentStateRef?: JsonObject;
    previousStateRef?: JsonObject;
    sideEffectClass: "none" | "internal" | "external" | "destructive";
    target?: JsonValue;
  }>;
  elementMatcher: ElementMatcher;
  resolveTarget(resolverId: string, target: JsonObject): Promise<JsonObject | null>;
  log(entry: AutomationStudioNativeLogEntry): void;
};
