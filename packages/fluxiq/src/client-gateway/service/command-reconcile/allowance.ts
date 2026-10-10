/**
 * How much longer than its answer deadline a dispatcher waits on a gateway
 * command, so the gateway can first ask the client what became of it (C8,
 * B3; this folder). The question is answered within the gateway's
 * `reconcileAnswerMs` (5,000 ms unless configured), and a command still
 * `running` is given one more window and asked again: at most three windows.
 *
 * `RuntimeService` adds it to its own deadline for a command. Without it the
 * runtime gave up at the very moment the gateway began asking, so a kept
 * result or a `not_seen` never reached the run on the runtime path a web Flow
 * takes, and a required run was stopped as uncertain before its client could
 * answer. A target that answers on time, or a gateway that has nobody to ask,
 * settles first, so the allowance only delays a target that hangs outright.
 */
export const COMMAND_RECONCILE_ALLOWANCE_MS = 15_000;
