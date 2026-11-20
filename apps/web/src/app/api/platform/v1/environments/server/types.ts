import type { EnvironmentController, EnvironmentStore } from "fluxiq/platform";
import type { HostedEnvironmentActor } from "../../../../../../server/environments/authority";

/** What the environment routes reach, resolved for one request after its IAM decision. */
export type EnvironmentRouteDeps = {
  /** The caller's workspace, from its held session, never the request. */
  workspaceId: string;
  /** The request's held authority, which the controller's IAM resolver revalidates on every decision. */
  actor: HostedEnvironmentActor;
  controller: Pick<EnvironmentController<HostedEnvironmentActor>, "create" | "start" | "stop" | "delete">;
  environments: Pick<EnvironmentStore, "listByWorkspace">;
};

/** A route answer: the status and the JSON body. */
export type EnvironmentRouteAnswer = { status: number; body: unknown };

/** The operations a route may ask of one existing environment. */
export type EnvironmentChange = "start" | "stop" | "delete";
