// The last part of a project build's time (`./project-build-duration.ts`),
// kept for its ending. The supervisor's own work -- its decisions, its
// builders, its whole trials -- stops this long before the bound, so the
// ending the supervisor records when it is stopped (t586: Core's reset brief
// where one can still undo this build's acts, then Core's list of what is left
// on the target) still runs inside the bound rather than after it. A reset
// brief undoes a handful of acts through the site's own controls; five
// minutes is several times what that takes.

/** How much of a project build's time its ending keeps: five minutes. */
export const AUTOMATION_STUDIO_PROJECT_BUILD_ENDING_MS = 300_000;
