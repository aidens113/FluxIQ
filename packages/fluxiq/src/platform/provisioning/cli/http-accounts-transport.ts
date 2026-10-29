import { PLATFORM_PROVISIONING_OPERATIONS, platformProvisioningResponseSchema, type PlatformProvisioningOperationName } from "@fluxiq/contracts/platform";
import { AccountsTransportError } from "./transport-error.ts";
import { provisioningListenerUrl } from "./provisioning-listener-url.ts";
import { readTokenFile } from "./read-token-file.ts";
import type { AccountsCommandTransport } from "./types.ts";

export type HttpAccountsTransportOptions = {
  /** `host:port` of the private provisioning listener. */
  listen: string;
  tokenFile: string;
  fetch?: typeof fetch;
};

const SET_PASSWORD_OFFLINE = "setPassword needs --offline (in-process, server stopped)";

/** Calls the private listener with the token file's current token. A password is never sent over http. */
export function httpAccountsTransport(options: HttpAccountsTransportOptions): AccountsCommandTransport {
  const doFetch = options.fetch ?? globalThis.fetch;
  return {
    async run(operation, input) {
      if (!Object.hasOwn(PLATFORM_PROVISIONING_OPERATIONS, operation)) throw new AccountsTransportError(`unknown operation "${operation}"`);
      const definition = PLATFORM_PROVISIONING_OPERATIONS[operation as PlatformProvisioningOperationName];
      if (!definition.http) return { ok: false, error: { code: "operation_unavailable", message: SET_PASSWORD_OFFLINE } };
      if (typeof input === "object" && input !== null && Object.hasOwn(input, "password")) throw new AccountsTransportError("a password is not sent over http; use --offline (in-process, server stopped)");
      const url = provisioningListenerUrl(options.listen, operation);
      const token = await readTokenFile(options.tokenFile);
      let status: number;
      let text: string;
      try {
        const response = await doFetch(url, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(input) });
        status = response.status;
        text = await response.text();
      } catch {
        throw new AccountsTransportError(`could not reach the provisioning listener at ${options.listen}`);
      }
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        throw new AccountsTransportError(`the provisioning listener answered HTTP ${status} with something that is not JSON`);
      }
      const parsed = platformProvisioningResponseSchema(definition.result).safeParse(body);
      if (!parsed.success) throw new AccountsTransportError(`the provisioning listener answered HTTP ${status} with something that is not a provisioning response`);
      return parsed.data;
    }
  };
}
