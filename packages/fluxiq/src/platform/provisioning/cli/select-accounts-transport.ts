import type { PlatformProvisioning } from "../types.ts";
import { AccountsTransportError } from "./transport-error.ts";
import { httpAccountsTransport } from "./http-accounts-transport.ts";
import { inProcessAccountsTransport } from "./in-process-accounts-transport.ts";
import type { AccountsCommandTransport } from "./types.ts";

export type SelectAccountsTransportOptions = {
  /** `--offline` was given. */
  offline: boolean;
  /** Builds the in-process service; called on first use only. */
  createInProcess(): Promise<PlatformProvisioning>;
  fetch?: typeof fetch;
};

/**
 * `--offline`, or neither FLUXIQ_PROVISIONING_LISTEN nor FLUXIQ_PROVISIONING_TOKEN_FILE
 * set: in-process. Both set: the private listener. Only one set is a
 * configuration error, reported when the transport is used.
 */
export function selectAccountsTransport(env: Readonly<Record<string, string | undefined>>, options: SelectAccountsTransportOptions): AccountsCommandTransport {
  const listen = env.FLUXIQ_PROVISIONING_LISTEN?.trim() || undefined;
  const tokenFile = env.FLUXIQ_PROVISIONING_TOKEN_FILE?.trim() || undefined;
  if (options.offline || (listen === undefined && tokenFile === undefined)) {
    let cached: Promise<AccountsCommandTransport> | null = null;
    return {
      async run(operation, input) {
        cached ??= options.createInProcess().then(inProcessAccountsTransport);
        return (await cached).run(operation, input);
      }
    };
  }
  if (listen === undefined || tokenFile === undefined) {
    return {
      async run() {
        throw new AccountsTransportError("set both FLUXIQ_PROVISIONING_LISTEN and FLUXIQ_PROVISIONING_TOKEN_FILE, or pass --offline");
      }
    };
  }
  return httpAccountsTransport({ listen, tokenFile, ...(options.fetch ? { fetch: options.fetch } : {}) });
}
