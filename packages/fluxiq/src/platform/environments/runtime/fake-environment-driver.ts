import type { EnvironmentDriverObservation } from "../model/index.ts";
import type { EnvironmentDriver, EnvironmentDriverSpec, EnvironmentEnrolmentTickets } from "./types.ts";

export type FakeEnvironmentDriverStep = "inspect" | "allocate" | "start" | "stop" | "release";

type Fault = { error: Error; leavePartial: boolean };

/**
 * The `fake` driver: in-memory resources with the same transitions as a real
 * driver, plus fault injection for tests and local runs. A transition a real
 * driver could not make (starting what was never allocated) throws, so a
 * controller defect is loud rather than absorbed.
 */
export class FakeEnvironmentDriver implements EnvironmentDriver {
  readonly kind = "fake" as const;
  /** Every call, in order. */
  readonly calls: Array<{ step: FakeEnvironmentDriverStep; environmentId: string }> = [];
  /**
   * The enrolment ticket each environment's runner was last handed, taken at
   * start as a real runner takes it. A fake runner holds it in memory only,
   * like a real one, so a test can present it.
   */
  readonly tickets = new Map<string, string>();
  private readonly states = new Map<string, Exclude<EnvironmentDriverObservation, "absent">>();
  private readonly faults = new Map<FakeEnvironmentDriverStep, Fault>();

  /** The next call of `step` fails with `error`; an allocation can first leave partial resources. */
  failNext(step: FakeEnvironmentDriverStep, error: Error, options: { leavePartial?: boolean } = {}): void {
    this.faults.set(step, { error, leavePartial: options.leavePartial === true });
  }

  /** A running environment stops without being asked to. */
  crash(environmentId: string): void {
    if (this.states.get(environmentId) !== "running") throw new Error(`Fake environment ${environmentId} is not running`);
    this.states.set(environmentId, "crashed");
  }

  /** What exists now, without recording a call. */
  observation(environmentId: string): EnvironmentDriverObservation {
    return this.states.get(environmentId) ?? "absent";
  }

  async inspect(spec: EnvironmentDriverSpec): Promise<EnvironmentDriverObservation> {
    this.enter("inspect", spec);
    return this.observation(spec.environmentId);
  }

  async allocate(spec: EnvironmentDriverSpec): Promise<void> {
    this.enter("allocate", spec);
    if (this.states.has(spec.environmentId)) throw new Error(`Fake environment ${spec.environmentId} is already allocated`);
    this.states.set(spec.environmentId, "stopped");
  }

  async start(spec: EnvironmentDriverSpec, enrolment?: EnvironmentEnrolmentTickets): Promise<void> {
    this.enter("start", spec);
    const state = this.observation(spec.environmentId);
    if (state !== "stopped" && state !== "crashed") throw new Error(`Fake environment ${spec.environmentId} cannot start from ${state}`);
    if (enrolment !== undefined) this.tickets.set(spec.environmentId, enrolment.takeEnrolmentTicket());
    this.states.set(spec.environmentId, "running");
  }

  async stop(spec: EnvironmentDriverSpec): Promise<void> {
    this.enter("stop", spec);
    const state = this.observation(spec.environmentId);
    if (state === "absent" || state === "partial") throw new Error(`Fake environment ${spec.environmentId} cannot stop from ${state}`);
    this.states.set(spec.environmentId, "stopped");
  }

  async release(spec: EnvironmentDriverSpec): Promise<void> {
    this.enter("release", spec);
    this.states.delete(spec.environmentId);
    this.tickets.delete(spec.environmentId);
  }

  private enter(step: FakeEnvironmentDriverStep, spec: EnvironmentDriverSpec): void {
    this.calls.push({ step, environmentId: spec.environmentId });
    const fault = this.faults.get(step);
    if (fault === undefined) return;
    this.faults.delete(step);
    if (fault.leavePartial) this.states.set(spec.environmentId, "partial");
    throw fault.error;
  }
}
