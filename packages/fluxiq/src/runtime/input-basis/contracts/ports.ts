import type { JsonObject } from "../../../core/index.ts";
import type { AutomationStudioInputScope } from "./scope.ts";
import type { AutomationStudioInputProducer } from "./producer.ts";
import type { AutomationStudioInputProducerOwner } from "./authority.ts";
import type { AutomationStudioInputBasisStorage } from "./storage.ts";

export type AutomationStudioInputBasisOwnerPorts = {
  storage: AutomationStudioInputBasisStorage;
  /** Trusted internal service authority, not a request's claimed principal. */
  scopeAuthority?: { authorize(scope: AutomationStudioInputScope): Promise<boolean> };
  /** Inspects the isolated actual normal capture and origins, never a redacted projection. */
  secrecy?: {
    inspect(capture: { scope: AutomationStudioInputScope; values: JsonObject; producers: readonly AutomationStudioInputProducer[] }): Promise<"nonsecret" | "active" | "raw" | "unverified" | "secret_origin">;
  };
  producerOwners?: ReadonlyMap<string, AutomationStudioInputProducerOwner>;
};
