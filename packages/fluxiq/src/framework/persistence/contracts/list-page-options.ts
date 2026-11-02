export type RepositoryListPageOptions = {
  limit?: number;
  offset?: number;
  search?: string;
  orderBy?: "id" | "updated_at_ms" | "created_at_ms";
  direction?: "asc" | "desc";
};
