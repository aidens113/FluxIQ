/**
 * One entry of the workspace's activity, as `GET /api/security/audit` answers
 * it and the Activity section shows it. Built on the server field by field
 * from an allow-list; nothing else of an audit record reaches it.
 *
 * - `at`: when, in epoch milliseconds (the audit keeps whole seconds);
 * - `who`: the name of whoever acted, in words;
 * - `action`: the IAM action, `<service>:<PascalCase>`;
 * - `outcome`: whether it was allowed or denied;
 * - `resources`: what it acted on, in words.
 */
export type ActivityEntry = {
  at: number;
  who: string;
  action: string;
  outcome: "allowed" | "denied";
  resources: string[];
};

/** One page of activity, newest first; `next` asks for the page after it, null when there is no more. */
export type ActivityPage = { entries: ActivityEntry[]; next: string | null };
