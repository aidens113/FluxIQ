/** What `IamAuditStore.expire` removed: whole allow-day tables, and individual deny / iam-change rows. */
export type IamAuditExpiry = {
  droppedTables: number;
  deletedRows: number;
};
