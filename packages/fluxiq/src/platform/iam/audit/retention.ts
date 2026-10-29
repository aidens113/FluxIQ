/** Retention in days: `allowDays` for the day-partitioned allow tables (90 on service), `longDays` for deny and iam-change rows (365). */
export type IamAuditRetention = {
  allowDays: number;
  longDays: number;
};
