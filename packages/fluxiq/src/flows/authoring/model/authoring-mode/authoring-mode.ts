// How a build that creates or improves a Flow is authored, as one runtime
// setting with one owner. Every caller that starts such a build -- the chat's
// create-here, explore and improve, the web panel's evidence-guided build and
// improvement, and the Lab -- takes the mode from here (or from Core resolving
// it for them), never from a literal of its own.
//
// - `project` (the product default since 2026-10-16, A8): a project supervisor
//   breaks the task into parts, plans the Flow's subflows and their
//   interfaces, dispatches a bounded builder per subflow, assembles their
//   proposals into one candidate and tests that exact revision; promotion is
//   the candidate's, unchanged. It became the default when the Lab comparison
//   passed: on one frozen pair (A8 frozen pair 8) it passed every one of the
//   five realistic tasks twice in a row, where `candidate` failed one of them
//   (automation-project-agents-plan, A8 Run Plan).
// - `candidate`: the evidence-guided build explores,
//   submits the whole Flow as a draft and tests that exact revision; a supplied
//   start hook resets the target first. Only a
//   trial confirmed by two judges can produce a proposed adaptation for the
//   chat or panel to apply; an unverified draft keeps the Flow unchanged.
// - `legacy` (explicit opt-out): the evidence-guided build explores, tests and
//   judges a draft and answers with a proposed adaptation. The chat applies it
//   onto a blank Flow and asks before applying an improvement; the panel offers
//   the proposal for review.
//
// Raw API requests that omit authoringMode retain their legacy wire contract;
// configured product callers resolve this setting instead.
//
// Set with `FLUXIQ_AUTHORING_MODE` in the environment of the Core process. A
// value that is none of the modes refuses rather than falling back, so a mistyped
// setting never silently builds the other way.

/** The variable the Core process reads. */
export const AUTOMATION_STUDIO_AUTHORING_MODE_ENV = "FLUXIQ_AUTHORING_MODE";

/** Every mode, in the spelling the variable takes. */
export const AUTOMATION_STUDIO_AUTHORING_MODES = Object.freeze(["legacy", "candidate", "project"] as const);

export type AutomationStudioAuthoringMode = (typeof AUTOMATION_STUDIO_AUTHORING_MODES)[number];

/** The mode when nothing is set. */
export const AUTOMATION_STUDIO_AUTHORING_MODE_DEFAULT: AutomationStudioAuthoringMode = "project";

type Environment = Readonly<Record<string, string | undefined>>;

function processEnvironment(): Environment {
  return (globalThis as { process?: { env?: Environment } }).process?.env ?? {};
}

/** Whether `value` is one of the modes, exactly as spelled. */
export function isAutomationStudioAuthoringMode(value: unknown): value is AutomationStudioAuthoringMode {
  return typeof value === "string" && (AUTOMATION_STUDIO_AUTHORING_MODES as readonly string[]).includes(value);
}

/**
 * The authoring mode this Core runs in. Unset or blank is the default; any
 * other value that is not a mode throws, naming the variable and the modes.
 */
export function resolveAutomationStudioAuthoringMode(env: Environment = processEnvironment()): AutomationStudioAuthoringMode {
  const raw = env[AUTOMATION_STUDIO_AUTHORING_MODE_ENV];
  if (raw === undefined || raw.trim() === "") return AUTOMATION_STUDIO_AUTHORING_MODE_DEFAULT;
  const value = raw.trim();
  if (!isAutomationStudioAuthoringMode(value)) {
    throw new Error(`${AUTOMATION_STUDIO_AUTHORING_MODE_ENV} must be one of ${AUTOMATION_STUDIO_AUTHORING_MODES.join(", ")}. Unset it to use ${AUTOMATION_STUDIO_AUTHORING_MODE_DEFAULT}.`);
  }
  return value;
}
