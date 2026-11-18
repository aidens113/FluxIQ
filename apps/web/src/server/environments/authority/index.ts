// Who may act on a hosted dedicated environment: the IAM target resolver the
// web server installs for cloud admission and the controller, and the actor
// it accepts (a panel request's held authority).
export { hostedCloudAuthorizer } from "./hosted-cloud-authorizer";
export { platformWorkspaces } from "./platform-workspaces";
export type { HostedCloudAuthorizerDeps, HostedEnvironmentActor } from "./types";
