import { cloudAuthorizerState } from "./authorizer-state";
import type { CloudAuthorizer } from "./authorizer-type";

/**
 * Installs the server's IAM target resolver, the one authority that says who
 * the actor is and what the target is (`CloudAdmissionOptions.authorize`);
 * `null` removes it. Until one is installed every request is not authorized:
 * cloud admission fails closed, never open.
 */
export function setCloudAuthorizer(authorizer: CloudAuthorizer | null): void {
  cloudAuthorizerState.current = authorizer;
}
