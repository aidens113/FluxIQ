// A person's stored starting humanness, as the service reads it for a run whose request carried
// none. The person's record belongs to the identity program, which this framework layer never
// imports: the host binds a reader per service (`bind`, from `programs/_shared/runtime.ts`), keyed
// by the service object as the trial collaborators are, so the service class gains no member.
import { resolveHumanness } from "@fluxiq/contracts/automation";

const READERS = new WeakMap<object, (userId: string) => Promise<number | null | undefined> | number | null | undefined>();

/**
 * The person's starting humanness for a service's runs. A run's starting value is the request's
 * own when it carried one, else the person's stored value (`resolveHumanness`'s `person` source),
 * else none. The person is always the run's signed-in caller, never an id a request body named.
 */
export class AutomationStudioPersonHumanness {
  /** Binds how `owner` (a service) reads one person's stored value, null or undefined when they set none; a later bind replaces it. */
  static bind(owner: object, read: (userId: string) => Promise<number | null | undefined> | number | null | undefined): void {
    READERS.set(owner, read);
  }

  /**
   * The starting value a run of `actorUserId` starts from: `requested` when the request carried
   * one (the person's value is then not read), else the person's stored value, else undefined. A
   * service with no reader bound, or a run with no known person, keeps `requested` as it is.
   */
  static async startingFor(owner: object, requested: number | undefined, actorUserId: string | undefined): Promise<number | undefined> {
    const read = READERS.get(owner);
    const person = requested === undefined && actorUserId !== undefined && read !== undefined ? await read(actorUserId) : undefined;
    return resolveHumanness({ startingValue: requested, person });
  }
}
