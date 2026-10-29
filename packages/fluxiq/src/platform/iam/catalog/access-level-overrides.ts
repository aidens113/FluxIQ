import type { IamAccessLevel } from "@fluxiq/contracts/iam";

/**
 * Actions whose access level differs from the classification default. Endpoints
 * named `list-*` are `List` by rule (see `iamEndpointAccessLevel`).
 */
export const IAM_ACCESS_LEVEL_OVERRIDES: Readonly<Record<string, IamAccessLevel>> = Object.freeze({
  "iam:CreateUser": "PermissionsManagement",
  "iam:UpdateUser": "PermissionsManagement"
});
