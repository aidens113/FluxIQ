// How a finished web build becomes reusable. Each build attempt runs in a
// directory of its own and is never moved or rewritten. After `next build`
// exits 0 and every check passes, the attempt receives a completion marker;
// only then does the key directory receive `published.json`, naming that
// attempt. Both records are renamed into place whole.

export { markBuildComplete } from "./mark-build-complete.mjs";
export { newBuildAttemptName } from "./new-attempt-name.mjs";
export { publishBuildAttempt } from "./publish-build-attempt.mjs";
export { readBuildId, readPublishedBuild } from "./read/index.mjs";
export { RECORDS } from "./records.mjs";
