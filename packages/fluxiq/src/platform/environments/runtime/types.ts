import type { CloudAdmissionOptions, CloudAdmissionService } from "../../commerce/index.ts";
import type { EnvironmentDriverKind, EnvironmentDriverObservation, EnvironmentStore } from "../model/index.ts";

/** Whose resources a driver acts on. Every driver call is keyed by `environmentId` alone and is idempotent. */
export type EnvironmentDriverSpec = {
  environmentId: string;
  accountId: string;
  workspaceId: string;
};

/**
 * The driver port. A driver names nothing it allocated outside the spec: it
 * finds its resources again from `environmentId` (a container or VM name and
 * a label), so no handle is stored and a restarted engine can always ask.
 */
export interface EnvironmentDriver {
  readonly kind: EnvironmentDriverKind;
  /** What exists for the environment now; never throws for an environment it has never seen (`absent`). */
  inspect(spec: EnvironmentDriverSpec): Promise<EnvironmentDriverObservation>;
  /** `absent` to `stopped`. A failure may leave `partial` resources; `release` removes them. */
  allocate(spec: EnvironmentDriverSpec): Promise<void>;
  /**
   * `stopped` or `crashed` to `running`. `enrolment`, when the controller has
   * an enrolment port, mints the one-time ticket the environment's client
   * enrols with at its tenant's gateway; a driver hands it to the runner in
   * memory only, never in argv, environment, URL, file, log or trace.
   */
  start(spec: EnvironmentDriverSpec, enrolment?: EnvironmentEnrolmentTickets): Promise<void>;
  /** `running` or `crashed` to `stopped`; `stopped` stays. */
  stop(spec: EnvironmentDriverSpec): Promise<void>;
  /** Anything to `absent`, partial allocations included; `absent` stays. */
  release(spec: EnvironmentDriverSpec): Promise<void>;
}

/** What a driver's `start` may call for its runner's enrolment ticket; each call revokes the ticket before it. */
export type EnvironmentEnrolmentTickets = {
  takeEnrolmentTicket(): string;
};

/** One start's enrolment, open while its driver call runs: `close` once `start` returned, whatever it came to. */
export type EnvironmentEnrolmentSession = EnvironmentEnrolmentTickets & {
  close(): void;
};

/**
 * How an environment's client is trusted: by its tenant's own gateway, never
 * by a person. The environment's admitted operation is the authority, so the
 * controller opens enrolment only to start an environment whose recorded
 * intent is `running`, and revokes it whenever the intent is not.
 */
export type EnvironmentEnrolment = {
  /** Ends any trust the environment's client held, then answers a ticket source bound to the environment's workspace and id. */
  open(spec: EnvironmentDriverSpec): Promise<EnvironmentEnrolmentSession>;
  /** Ends the environment's pending tickets and every trust its client holds; repeats harmlessly. */
  revoke(spec: EnvironmentDriverSpec, reason: string): Promise<void>;
};

export type EnvironmentControllerOptions<Actor> = {
  store: EnvironmentStore;
  driver: EnvironmentDriver;
  /**
   * The existing commerce admission, the one authority for allocation: an
   * environment is a dedicated managed-cloud target whose `targetId` is its
   * `environmentId`, matched against the grant's `resourceIds`.
   */
  admission: Pick<CloudAdmissionService<Actor>, "admit">;
  /**
   * The same server-side IAM target resolver the admission service was built
   * with (`CloudAdmissionOptions.authorize`), used alone where nothing is
   * allocated: stopping, deleting and reading never need a paid entitlement,
   * so a lapsed subscription can still release what it holds.
   */
  authorize: CloudAdmissionOptions<Actor>["authorize"];
  /** The capability a dedicated environment's target and grant carry; `DEDICATED_ENVIRONMENT_CAPABILITY` by default. */
  capability?: string;
  /** How the environment's client enrols at its tenant's gateway and loses that trust; without it, nothing enrols. */
  enrolment?: EnvironmentEnrolment;
};

/** One operation by an actor on one environment in one workspace. */
export type EnvironmentCommand<Actor> = {
  operationId: string;
  environmentId: string;
  workspaceId: string;
  actor: Actor;
};

/** A read by an actor; no operation id. */
export type EnvironmentQuery<Actor> = Omit<EnvironmentCommand<Actor>, "operationId">;
