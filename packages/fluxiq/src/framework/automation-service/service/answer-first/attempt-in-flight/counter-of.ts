// One in-flight count per service, reached by the service object itself (as `../attempt-store/store-of.ts`):
// `service.ts` has a line limit, so it keeps no field for this.

const COUNTS = new WeakMap<object, { inFlight: number }>();

/** The service's counter, made on first ask. */
export function automationStudioTaskAttemptCounterOf(owner: object): { inFlight: number } {
  const known = COUNTS.get(owner);
  if (known) return known;
  const made = { inFlight: 0 };
  COUNTS.set(owner, made);
  return made;
}
