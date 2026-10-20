// The closed vocabulary of why a replayed delivery point diverged from its
// recording (traces and offline trials, P3). A new class is a deliberate edit
// here, never a string a caller invents.

export const CLIENT_GATEWAY_TRACE_PARITY_CLASSES = Object.freeze(["capture_gap", "nondeterminism", "intake_defect"] as const);
