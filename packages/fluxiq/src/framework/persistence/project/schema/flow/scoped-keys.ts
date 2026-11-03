import type { AutomationStudioSchemaMigration } from "../../migrations/contracts/index.ts";
import { foreignKeyGuards } from "../guards/index.ts";

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
