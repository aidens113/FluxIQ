/** `fluxiq storage`'s help text. */
export const STORAGE_USAGE = [
  "Usage: fluxiq storage <inspect|setup|migrate|rollback> [--data-dir <dir>]",
  "",
  "Inspects or changes a FluxIQ data directory's storage layout, offline. It holds the data",
  "directory for the whole command, as a server does, so it is refused while the web panel or",
  "`fluxiq dev` serves it: stop that server first, then run it.",
  "  inspect   Print the storage layout and whether a migration is required",
  "  setup     Create the storage a fresh or current data directory needs",
  "  migrate   Upgrade layout v1 storage to v2 (the older files are archived, not deleted)",
  "  rollback  Undo a v1 to v2 migration that stopped before it was committed",
  "  --data-dir  The data directory (the folder that holds .fluxiq). Default: FLUXIQ_ROOT, else ~/.fluxiq/data",
  "The domain host module is loaded from FLUXIQ_HOST_MODULE, as the web panel loads it, so a",
  "domain's own storage is found as the panel finds it.",
  "Prints the result as JSON. Exit: 0 done, 1 refused or failed, 2 usage."
].join("\n");
