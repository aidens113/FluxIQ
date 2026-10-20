/**
 * The reason a domain may give, in place of a refusal's own cause, when it
 * gives that refusal again byte for byte: the cause was said on the first of
 * them. Core's runtime puts the first cause back on the repeats
 * (`activity/repeated-reason.ts`), says the repeats as such when a budget runs
 * out (`flow-bootstrap/unfinished-build/last-fix.ts`), and the chat's card
 * never reads one as a page miss (`ui/activity-action/failure-reason.ts`).
 *
 * One word in one place (t728, extension-core boundary audit): Core named it
 * in three files and the web domain in a fourth, and nothing kept them alike.
 */
export const AUTOMATION_STUDIO_REPEATED_ANSWER_REASON = "answered_the_same_again";
