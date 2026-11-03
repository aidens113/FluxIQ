/**
 * `reset` returns the site to the state the build started from, through the
 * site's own controls, before the judged whole run: it undoes exactly the
 * lasting acts this build's briefs made and never what was there before (user
 * rule, 2026-10-12). It carries no parts and permits no acts of its own:
 * reversing the build's own acts is not a new permission question.
 */
export const AUTOMATION_STUDIO_PROJECT_BRIEF_KINDS = Object.freeze(["build", "survey", "repair", "reset"] as const);
