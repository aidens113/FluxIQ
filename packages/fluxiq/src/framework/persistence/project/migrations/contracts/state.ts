export type AutomationStudioSchemaState = {
  status: "ready" | "migrating" | "failed";
  lockToken: string | null;
  lockAcquiredAt: number | null;
  failureMessage: string | null;
  updatedAt: number;
};
