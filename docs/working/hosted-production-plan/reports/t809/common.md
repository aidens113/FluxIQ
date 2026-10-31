# t809 common rules (every worker reads this)
- Core tree: C:/Users/osrs_/FluxStuff/fxwork/t809/!FluxIQ (branch task/t809-hosted-wiring-followups). Never touch another tree, never commit/push/stash/checkout.
- Must not touch: packages/fluxiq/src/programs/_shared/{runtime,state-connections,storage}.ts, packages/fluxiq/src/framework/**, secret-keys/**, runtime/activity/hub.ts, programs/automation-studio/runtime/**. If you need one, stop and report which file and why.
- Never print or report tokens, codes, passwords, mail contents or links; say "a link was written".
- Tests go in `tests/` beside their subject. One exported thing per file, barrel per directory (Core code-structure rules); `pnpm structure:check` must stay clean for files you add.
- Heavy commands (tsc, vitest over >1 directory, pnpm check) go under the shared lock:
  L=/c/Users/osrs_/FluxStuff/lab-slots/heavy-check.lock; until mkdir $L 2>/dev/null; do sleep 20; done; <cmd>; rmdir $L
  Run a single small test file without the lock. Never remove the lock unless your command created it.
- No `node -e` / `python -c` one-liners. No paid runs.
- Report: a short md at the report path in your brief, ending with the return contract (Outcome/Changed/Validation/Not verified/Report/Notes).
