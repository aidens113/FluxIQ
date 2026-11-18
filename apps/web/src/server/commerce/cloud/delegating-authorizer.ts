import { cloudAuthorizerState } from "./authorizer-state";
import type { CloudAuthorizer } from "./authorizer-type";

/** The resolver admission asks on every call: the installed one, or a refusal when none is installed. */
export const delegatingCloudAuthorizer: CloudAuthorizer = async (request) => {
  const authorizer = cloudAuthorizerState.current;
  return authorizer === null ? null : authorizer(request);
};
