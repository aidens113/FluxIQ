// The authoring mode one build runs in, from Core's setting and what the build
// does. A project build writes a Flow from nothing; extending one is not yet a
// project build's (automation-project-agents-plan, A7). In project mode an
// extend therefore builds as a candidate, which can extend and also ends in a
// tested candidate. So does an extend in answer-first mode: a saved Flow's later
// attempt is the Second Attempt lane's, and until it lands an extend stays the
// path that can extend. Legacy stays legacy: it is an explicit opt-out.
//
// Every caller that resolves Core's mode for a build uses this, so the chat's
// improve and the web panel's "Improve automation" (which asks Core with
// `authoringMode: "configured"`) build the same way.

import { resolveAutomationStudioAuthoringMode, type AutomationStudioAuthoringMode } from "./authoring-mode.ts";

type Environment = Readonly<Record<string, string | undefined>>;

/** The mode a `create` or `extend` build runs in under Core's setting. Throws, as the setting does, when it is misconfigured. */
export function resolveAutomationStudioBuildAuthoringMode(build: "create" | "extend", env?: Environment): AutomationStudioAuthoringMode {
  const configured = env === undefined ? resolveAutomationStudioAuthoringMode() : resolveAutomationStudioAuthoringMode(env);
  return build === "extend" && (configured === "project" || configured === "answer-first") ? "candidate" : configured;
}
