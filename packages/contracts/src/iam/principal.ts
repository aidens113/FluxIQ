/**
 * Principal types, the resource types of an `iam` FRN that name an identity
 * (`frn:fluxiq:iam:<workspaceId>:<type>/<id>`). A `group` holds policies but
 * never acts; a connected client acts as its `user`, narrowed by a session
 * policy. Platform-level service identities have no workspace segment
 * (`frn:fluxiq:iam::service-identity/<name>`).
 */
export const IAM_PRINCIPAL_TYPES = Object.freeze(["user", "group", "role", "service-identity"] as const);

export type IamPrincipalType = (typeof IAM_PRINCIPAL_TYPES)[number];

/**
 * The platform operator. A command-line principal only: it has no FRN, and
 * provisioning can never create it or attach a policy to it.
 */
export const IAM_PLATFORM_ADMIN_PRINCIPAL = "platform-admin";
