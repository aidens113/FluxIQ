/**
 * One entry of the workspace's activity, as `GET /api/security/audit` answers
 * it and the Activity section shows it. Built on the server field by field
 * from an allow-list; nothing else of an audit record reaches it.
 *
 * - `at`: when, in epoch milliseconds (the audit keeps whole seconds);
 * - `who`: the name of whoever acted, in words;
 * - `action`: the IAM action, `<service>:<PascalCase>`;
 * - `outcome`: whether it was allowed or denied;
 * - `resources`: what it acted on, in words;
 * - `hidden`: present only on a list request that hid items from whoever
 *   asked: how many it hid, a positive integer. The audit keeps one entry for
 *   such a request, not one per hidden item.
 */
export type ActivityEntry = {
  at: number;
  who: string;
  action: string;
  outcome: "allowed" | "denied";
  resources: string[];
  hidden?: number;
};

/** One page of activity, newest first; `next` asks for the page after it, null when there is no more. */
export type ActivityPage = { entries: ActivityEntry[]; next: string | null };
