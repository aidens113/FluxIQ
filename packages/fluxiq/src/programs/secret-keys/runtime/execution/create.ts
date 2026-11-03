import { SecretKeysService } from "../service.ts";
import type { SessionProviderKeyExecutionPorts } from "../../../../runtime/models/secrets/execution/index.ts";

const nativePorts = SecretKeysService.executionPorts;

/** Only a genuinely constructed Service can expose its original private native owner. */
export function createSecretKeysExecutionPorts(original: SecretKeysService): SessionProviderKeyExecutionPorts {
  return nativePorts.call(SecretKeysService, original);
}
