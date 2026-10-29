import type { FluxIQDeploymentSettings } from "fluxiq/platform/profile";
import { isLoopbackHost } from "./is-loopback-host.ts";
import { admitClientGatewayOrigin, clientGatewayOriginStartRefusal, isPublicClientGatewayBind, parseClientGatewayOriginAllowlist } from "./origin-grammar.ts";

/** The Origin decision for one upgrade, as the contract returns it. */
export type ClientGatewayOriginVerdict = ReturnType<typeof admitClientGatewayOrigin>;

/** The transport's Origin rule, fixed at start. */
export type ClientGatewayOriginPolicy = {
  /** The `service` profile, or any profile bound beyond loopback. */
  readonly isPublic: boolean;
  admit(origin: string | null | undefined): ClientGatewayOriginVerdict;
};

/**
 * Parses the raw allowlist with the contract's grammar and fixes the rule
 * every upgrade is judged by. On a public gateway an entry the grammar refuses,
 * or an allowlist with no rule left, stops the start (the contract's
 * refusal); on a non-public one a refused entry is warned about and dropped,
 * and an empty allowlist admits every Origin, as a loopback install always has.
 */
export function createClientGatewayOriginPolicy(input: {
  profile: FluxIQDeploymentSettings["profile"];
  host: string;
  allowedOrigins: readonly string[] | undefined;
  warn: (message: string) => void;
}): ClientGatewayOriginPolicy {
  const { rules, refused } = parseClientGatewayOriginAllowlist(input.allowedOrigins ?? []);
  const context = { profile: input.profile, loopbackBind: isLoopbackHost(input.host), rules };
  const isPublic = isPublicClientGatewayBind(context);
  if (refused.length > 0) {
    const listed = refused.map((entry: string) => JSON.stringify(entry)).join(", ");
    const grammar = "Entries are exact https/http origins, chrome-extension://<id>, moz-extension://<uuid> or moz-extension://*; wildcards, paths and \"null\" are refused.";
    if (isPublic) throw new Error(`A public FluxIQ client gateway cannot start with Origin allowlist entries the grammar refuses: ${listed}. ${grammar}`);
    input.warn(`[FluxIQ] Ignoring client gateway Origin allowlist entries the grammar refuses: ${listed}. ${grammar}`);
  }
  const refusal = clientGatewayOriginStartRefusal(context);
  if (refusal !== null) throw new Error(refusal);
  return { isPublic, admit: (origin) => admitClientGatewayOrigin(origin, context) };
}
