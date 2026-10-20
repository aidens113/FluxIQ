// Where an allocated task id is recorded, so nothing ever hands it out again:
// one local ref per id, `refs/fluxiq/task-ids/t<NNN>` (`task-id.mjs` says why).
// The downstream web-extension repository imports this module and records under
// the same prefix, so a Core-paired task started there spends its id here as
// well.

export const TASK_ID_REF_PREFIX = "refs/fluxiq/task-ids/";
