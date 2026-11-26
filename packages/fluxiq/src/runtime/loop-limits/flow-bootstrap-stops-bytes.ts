// How large a build's published list of round stops may be, in bytes (t1056).
//
// A build's rounds end on its result, its purse, its clock or a person's Stop, never on a count of them (t1056; user,
// 2026-11-24: "THERE SHOULDNT BE ANY ARBITRARY FUCKING CALL LIMIT THAT RANDOMLY JUST RESETS EVERYTHING"). It was six
// live rounds (`AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_ROUNDS`), and an empty build whose rounds each ended on loop
// detection explored again until that count ended it, with money left. The published record must still stay
// readable, so its one list with an entry per round -- why each round stopped (`tried.stops`,
// `../flow-authoring/bootstrap/generation-failure/build-ending.ts`) -- is bounded by its size instead: the writer keeps
// the most recent stops that fit, and the reader refuses a list that does not
// (`../flow-authoring/bootstrap/generation-failure/stops-within.ts`). It lives here so both read one number without
// importing the lifecycle that runs the rounds.

/** The most bytes a build ending's `tried.stops` may hold, as UTF-8 JSON: the last 150 or so rounds' stops. */
export const AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STOPS_BYTES_MAX = 8_192;
