"use client";

import { DataTable } from "../../programs/components";
import { JsonToggle } from "../runtime";
import type { AutomationStudioRecordField, AutomationStudioRecordSchema } from "fluxiq/automation-studio/nodes";

export type RunDatasetTableProps = {
  label: string;
  schema: AutomationStudioRecordSchema | null;
  rows: Array<Record<string, unknown>>;
  loading?: boolean;
  hasMore?: boolean;
  onLoadMore?(): void;
};

/**
 * Stored rows of one run dataset.
 *
 * Columns come from the stored schema's field labels and never from the keys of
 * a row: a row missing an optional field would otherwise drop a column, and two
 * pages of the same dataset could disagree on their columns. Cells are read by
 * field id. A `url` value renders as text, never as an `href`, because the rows
 * were extracted from a page under automation and must not become one click
 * away from a live request.
 */
export function RunDatasetTable(props: RunDatasetTableProps) {
  const fields = props.schema?.fields ?? [];
  const columns = fields.map((field) => field.label);
  const rows = props.rows.map((row) => fields.map((field) => datasetCell(field, row[field.id])));
  return (
    <div className="automation-datasets-table">
      <DataTable
        columns={columns}
        empty="No rows were stored for this table."
        label={props.label}
        loading={props.loading ?? false}
        rows={rows}
      />
      {props.hasMore ? (
        <footer className="automation-datasets-table-footer">
          <span>{props.rows.length} rows loaded</span>
          <button
            className="automation-runtime-row-action"
            disabled={props.loading ?? false}
            onClick={props.onLoadMore}
            type="button"
          >
            {props.loading ? "Loading..." : "Load more"}
          </button>
        </footer>
      ) : null}
    </div>
  );
}

function datasetCell(field: AutomationStudioRecordField, value: unknown) {
  if (value === undefined || value === null) return "-";
  if (field.valueType === "json") return <JsonToggle key={field.id} label="Show value" value={value} />;
  if (typeof value === "object") return <JsonToggle key={field.id} label="Show value" value={value} />;
  return String(value);
}
