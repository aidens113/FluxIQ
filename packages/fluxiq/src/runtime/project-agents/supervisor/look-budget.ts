/**
 * Looks the project supervisor may make before its look tools are withdrawn
 * for the rest of its run (`../../llm/decision-handlers/look-withdrawal.ts`,
 * the planning loop's look budget; t569). Its opening -- the task through
 * `project.read_task` and the start page as the build found it -- is free and
 * not counted.
 *
 * Three, because that is what planning from a short look needs and no more: a
 * find for the thing the task names, a look at what the start page offers to
 * reach it (a describe or a list's structure), and one to spare. The four A8
 * round-1 runs (2026-10-14) all spent theirs exploring like a builder with
 * tools that cannot act: on `run-mv7t07hx-fe96a174` (crossborder) the first
 * find already answered "0 matches ... type it into the site's search field"
 * -- the thing the task names is not on the start page, which makes it a
 * builder's to find -- and the six looks after it added nothing; on
 * `run-mv7t19hg-1d51f430` (bigbox) ten looks went on trying to dismiss a
 * consent layer and open a picker, and the task spec it then wrote quoted the
 * task alone; the social and everything-store runs made eight and more finds
 * on their start pages before any plan.
 */
export const AUTOMATION_STUDIO_PROJECT_SUPERVISOR_LOOK_BUDGET = 3;
