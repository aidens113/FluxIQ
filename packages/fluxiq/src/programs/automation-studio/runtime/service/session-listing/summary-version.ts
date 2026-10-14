// The shape a runtime run summary row is written in. Version 2 (t604) added the
// candidate trial a session tested, so a listing can be filtered to one build;
// a row written before carries no version, and the summary store rewrites it
// from its session the next time the listing is read.
export const AUTOMATION_STUDIO_RUNTIME_SUMMARY_VERSION = 2;
