import type { JsonObject } from "../../../../../core/index.ts";
import { SQLiteRepository } from "../../../../database-manager/storage/sqlite-repository.ts";
import type { AutomationStudioFlowRunSummary } from "../../../model/index.ts";
import type { AutomationStudioAdaptationSummary } from "../indexes/index.ts";
import type { AutomationStudioAdaptationSummaryPage, AutomationStudioFlowRunSummaryPage } from "./store.ts";

// Paging over the SQL summary projections. Self-contained: the cursor, the
// row mapping and the page shape, with no dependency on the rest of the store.
export class AutomationStudioSqlSummaryPaging {
  async listSqlJsonSummaryPage(
    repository: SQLiteRepository<JsonObject>,
    field: "runs",
    flowId: string | undefined,
    limit: number,
    offset: number
  ): Promise<AutomationStudioFlowRunSummaryPage>;

  async listSqlJsonSummaryPage(
    repository: SQLiteRepository<JsonObject>,
    field: "adaptations",
    flowId: string | undefined,
    limit: number,
    offset: number,
    subflowId?: string,
    status?: string
  ): Promise<AutomationStudioAdaptationSummaryPage>;

  async listSqlJsonSummaryPage(
    repository: SQLiteRepository<JsonObject>,
    field: "runs" | "adaptations",
    flowId: string | undefined,
    limit: number,
    offset: number,
    subflowId?: string,
    status?: string
  ): Promise<AutomationStudioFlowRunSummaryPage | AutomationStudioAdaptationSummaryPage> {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (flowId) {
      clauses.push("json_extract(data, '$.flowId') = ?");
      params.push(flowId);
    }
    if (subflowId) {
      clauses.push("json_extract(data, '$.subflowId') = ?");
      params.push(subflowId);
    }
    if (status) {
      clauses.push("json_extract(data, '$.status') = ?");
      params.push(status);
    }
    const where = clauses.length ? `where ${clauses.join(" and ")}` : "";
    const result = await repository.transaction({}, async (transaction) => {
      const totalRow = await transaction.get<{ total: number }>(`select count(*) as total from ${repository.tableName} ${where}`, params);
      const rows = await transaction.all<{ data: string }>(
        `select data from ${repository.tableName} ${where} order by updated_at_ms desc, id asc limit ? offset ?`,
        [...params, limit, offset]
      );
      return {
        total: totalRow?.total ?? 0,
        items: rows.map((row) => JSON.parse(row.data) as unknown)
      };
    });
    return field === "runs"
      ? { runs: result.items as unknown as AutomationStudioFlowRunSummary[], total: result.total, limit, offset }
      : { adaptations: result.items as unknown as AutomationStudioAdaptationSummary[], total: result.total, limit, offset };
  }
}
