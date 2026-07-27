export type DatabaseManagerPanel = "stores" | "records" | "migrations";

export type DatabaseManagerViewState = {
  activePanel: DatabaseManagerPanel;
  selectedKind?: string;
  selectedRecordId?: string;
};
