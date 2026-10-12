// 0024_scoped_flow_keys -- a Flow's interface port, variable and error ids are
// unique within that Flow, not across the project.
//
// `0002` made `port_id`, `variable_id` and `error_id` the sole primary key of
// `flow_ports`, `flow_variables` and `flow_errors`. So two Flows, or two Subflow
// graphs of one automation, that each declare a port, a variable or an error of
// the same id could not both be saved: the second write failed with
// `UNIQUE constraint failed: flow_ports.port_id` (or `.variable_id`,
// `.error_id`). Authoring gives a part's interface ports their names as ids,
// and two parts that both hand back `cart` are an ordinary script (t404, t405);
// a child part's `error.<id>` ports and same-named variables across Subflow
// graphs collide the same way. The model already validates each id as unique
// within its Flow; the tables now say the same, keyed `(flow_id, <id>)`. Every
// reader and writer already addresses these rows by `flow_id`, and nothing
// refers to a row by its id alone: graph edges' `source_port_id` and
// `target_port_id` name node ports, not these.
//
// SQLite cannot change a primary key in place, so each table is rebuilt in the
// migration's one transaction the way `0024_runtime_run_interrupted_status`
// rebuilds `runtime_runs`: rows to a plain copy, the table dropped (its index
// and its own guards with it; no other table holds a guard against any of the
// three), created again under the same name and column order, and the rows
// copied back unchanged before the index and guards are recreated. The old key
// implied the new one, so no row can be refused on the way back.
//
// Its id sorts after `0024_runtime_run_interrupted_status`, the previous last
// of the project administration set, and before `0025`: the stores that append
// their own `0025`-`0028` after that set need its ids ascending.
import type { AutomationStudioSchemaMigration } from "../../schema-migrations.ts";
import { foreignKeyGuards } from "./foreign-key-guards.ts";

type ScopedTable = { table: string; idColumn: string; columns: readonly string[]; definitions: string; uniqueIndex: string };

const TABLES: readonly ScopedTable[] = [
  {
    table: "flow_ports",
    idColumn: "port_id",
    columns: ["port_id", "flow_id", "direction", "name", "value_type", "required", "default_value_json", "description", "sort_key", "revision"],
    definitions: `port_id text not null,
      flow_id text not null,
      direction text not null check (direction in ('input', 'output')),
      name text not null,
      value_type text not null,
      required integer not null default 0 check (required in (0, 1)),
      default_value_json text,
      description text not null default '',
      sort_key text not null default '',
      revision integer not null default 1 check (revision > 0)`,
    uniqueIndex: "create unique index flow_ports_flow_direction_name_uq on flow_ports (flow_id, direction, name)"
  },
  {
    table: "flow_variables",
    idColumn: "variable_id",
    columns: ["variable_id", "flow_id", "name", "value_type", "initial_value_json", "description", "sort_key", "revision"],
    definitions: `variable_id text not null,
      flow_id text not null,
      name text not null,
      value_type text not null,
      initial_value_json text,
      description text not null default '',
      sort_key text not null default '',
      revision integer not null default 1 check (revision > 0)`,
    uniqueIndex: "create unique index flow_variables_flow_name_uq on flow_variables (flow_id, name)"
  },
  {
    table: "flow_errors",
    idColumn: "error_id",
    columns: ["error_id", "flow_id", "code", "description", "metadata_json", "revision"],
    definitions: `error_id text not null,
      flow_id text not null,
      code text not null,
      description text not null default '',
      metadata_json text not null default '{}',
      revision integer not null default 1 check (revision > 0)`,
    uniqueIndex: "create unique index flow_errors_flow_code_uq on flow_errors (flow_id, code)"
  }
];

function rekeyed({ table, idColumn, columns, definitions, uniqueIndex }: ScopedTable): string[] {
  const list = columns.join(", ");
  return [
    `create table ${table}_scoped_copy as select ${list} from ${table}`,
    `drop table ${table}`,
    `create table ${table} (
      ${definitions},
      primary key (flow_id, ${idColumn})
    )`,
    `insert into ${table} (${list}) select ${list} from ${table}_scoped_copy`,
    `drop table ${table}_scoped_copy`,
    uniqueIndex,
    ...foreignKeyGuards(table, "flow_id", "flows", "flow_id", false)
  ];
}

export const AUTOMATION_STUDIO_PROJECT_FLOW_SCOPED_KEY_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0024_scoped_flow_keys",
  statements: TABLES.flatMap(rekeyed)
};
