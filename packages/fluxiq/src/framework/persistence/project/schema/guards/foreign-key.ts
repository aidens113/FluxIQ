// Triggers that stand in for foreign keys: SQLite enforces them only when
// `pragma foreign_keys` is on per connection, so every relationship is guarded
// by an insert and an update trigger instead.

export function foreignKeyGuards(sourceTable: string, sourceColumn: string, targetTable: string, targetColumn: string, nullable = true): string[] {
  const triggerPrefix = `fk_${sourceTable}_${sourceColumn}`.replace(/[^A-Za-z0-9_]/g, "_");
  const missingPredicate = `${nullable ? `new.${sourceColumn} is not null and ` : ""}not exists (select 1 from ${targetTable} where ${targetColumn} = new.${sourceColumn})`;
  return [
    `create trigger ${triggerPrefix}_insert before insert on ${sourceTable} when ${missingPredicate} begin
      select raise(abort, '${sourceTable}.${sourceColumn} references missing ${targetTable}.${targetColumn}');
    end`,
    `create trigger ${triggerPrefix}_update before update of ${sourceColumn} on ${sourceTable} when ${missingPredicate} begin
      select raise(abort, '${sourceTable}.${sourceColumn} references missing ${targetTable}.${targetColumn}');
    end`
  ];
}
