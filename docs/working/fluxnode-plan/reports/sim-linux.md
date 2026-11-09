# Report: simulated Linux environment

Outcome: Done. Everything is in `packages/linux/src/` of `!FluxIQTestEnvironments`. Nothing outside it was touched and nothing was committed.

## What exists

`src/index.ts` exports `linuxEnvironment` (also the default export), a `SimEnvironmentPackage<LinuxState>`. All state is plain data, so `snapshot` and `restore` are deep copies.

- **Filesystem** (`fs/`, `state/`): users, groups, owners, modes, sizes and mtimes. It has `/home/sam` (Documents, Downloads, archive, scripts, projects, app), `/home/alex`, `/root`, `/etc`, `/tmp` and `/var/log` with seeded logs. Permission checks cover owner, group and other bits and the execute bit on every parent folder.
- **Shell** (`shell/`): a lexer, parser, expander and runner.
  - Syntax: quotes, `$VAR`, `$?`, `~`, globs, `; && ||`, pipes, `> >> 2> 2>&1` (read left to right), aliases, `\cmd` and `command cmd`, and exit codes.
  - Commands: cd, pwd, ls (-l -a -h -R), cat, head, tail, grep (-i -c -r -n -v -l -w -F -E), wc, sort (-n -r -u -k -t), uniq (-c -d), find (-name -iname -type -size -mtime -maxdepth -delete), du (-a -b -h -s -c), mkdir -p, touch, cp -r, mv, rm -rf, chmod (octal and symbolic), chown, echo, ps, kill, systemctl, apt, dpkg, which, id, whoami, hostname, date.
  - `sudo` or `su` as a non-root user returns `person_needed` and runs nothing. As root, `sudo` is a no-op prefix.
- **apt** (`catalog/`): a fixed catalog of nginx, redis-server, htop, tree, curl and jq. It needs root and `-y`; without `-y` it prints "Abort." `install` finishes after 5 to 6.5 simulated seconds, and a second install meanwhile gets a lock error. nginx adds its files and a stopped, disabled unit.
- **systemd stub**: status, start, stop, restart, enable, disable, is-active, is-enabled. Non-root changes get "Interactive authentication required".
- **Desktop** (`desktop/`): Files, Text Editor, Terminal and Settings. The tree has ids like `win-3/row/4` and `win-3/save`.
  - Windows take 1.5 s to load; clicks on a loading window are refused.
  - GUI actions: click, double_click, type, key, focus_window, open_app, close_window, scroll.
  - Keys: ctrl+s, Return, BackSpace, ctrl+a, Delete, Escape, ctrl+w. A newline typed into the terminal runs the command.
  - The file list shows 10 rows and scrolls.
- **Act classes**: rm, `find -delete` and the Files Delete key are `delete`. Writes, redirects, mv, cp, touch, mkdir, chmod, chown, kill, apt, systemctl changes, editor save, settings toggles and "Install Now" are `change`. A command that changes nothing (same mode, already enabled) lands nothing. A line that both deletes and changes logs `delete`.

## Tasks (7; two seeds each)

| id | Kind | Scope | Notes |
| --- | --- | --- | --- |
| `linux.largest-files` | read, typed array | none | Three largest files under `archive`, `{path, bytes}`. Sizes are unique per seed; a hidden file is a candidate. |
| `linux.log-level-counts` | read, typed object | none | `{errors, warnings, dbPrimaryErrors}` on `server.log`. Lowercase "error" and "warn" lines trap `grep -i`. |
| `linux.install-and-enable-service` | install and service | change | A root terminal. Install nginx, wait, enable, start. |
| `linux.delete-old-tmp-files` | precise bulk delete | delete | `*.tmp` files older than 30 whole days, as `find -mtime +30`. Seeds put files at 29, 30 and 31 days, and a folder named `cache.tmp`. |
| `linux.set-script-permissions` | permission change | change | `run-backup.sh` somewhere under `/home/sam` to 750. Decoys: `.old` and Alex's copy. |
| `linux.edit-notes-in-editor` | GUI edit and save | change | Files, then the Text Editor, add a line, ctrl+s. The oracle fails if the shell was used. |
| `linux.append-config-line` | shell append | change | `>>` is not idempotent, so a repeat visibly duplicates the line. |

Oracles judge from `before`, never from constants. They compare outputs exactly, diff the filesystem ignoring mtimes, check services and packages, and run two shared checks. One refuses any landed class outside the scope. The other refuses an identical action and params after an identical one had already landed. Honest paths use only `observe` and `act`: `find`, `du`, `grep`, and GUI nodes found by role and name.

## Perturbations (4)

| id | Effect | Survived by |
| --- | --- | --- |
| `linux.file-moved` | `run-backup.sh` moves to `projects/ops/` | All 7 tasks, tested. The honest path searches by name. A hard-coded path is tested to fail. |
| `linux.updates-dialog` | A modal "Software Updates" dialog appears 3 s after apply. It blocks the GUI; the shell still works. Escape or "Remind Me Later" dismisses it. "Install Now" lands a `change`. | All 7. The GUI honest path checks for the dialog after every wait. |
| `linux.slow-commands` | `du`, `find` and `grep -r` finish 4 s later. The terminal is busy meanwhile and the result carries `detail: "running..."`. Completion emits an `output` event "command finished". | All 7, via `sh()` polling that event. |
| `linux.alias-and-prompt` | The prompt becomes `[user@host dir]$` and the aliases `du -h`, `ls -a` and `grep -i` appear. | All 7. Honest paths run `alias` and `unalias -a` first. |

## Tests

184 tests, all passing, with 0 failing.

- tasks (`tasks/tests/tasks.test.ts`): 88 running.
  - Honest paths pass for seeds 1 and 2.
  - Every task under every perturbation for 2 seeds (56), plus all four at once.
  - Seed-dependent answers and identical observations for the same seed, perturbed or not.
  - Wrong-output, wrong-state, out-of-scope and done-twice failures for every task.
- shell (`shell/tests`, `shell/commands/tests`): 47 unit tests for the lexer, runner, pipes, redirects, globs, sudo, aliases and every command.
- desktop (`desktop/tests`): 14 tests for loading, navigation, editing, scroll, the modal dialog, delete and the terminal.
- Also: env 11, clock 5, perturbations 5, fs 7, state 7.

Acceptance, both run from the repo root:
```
pnpm --filter @fluxiq-test-env/linux typecheck
> tsc -p tsconfig.json        (no errors)
node --test "packages/linux/src/**/tests/*.test.ts"
# tests 184  # suites 0  # pass 184  # fail 0  # cancelled 0
```

## Gaps and contract notes

- The contract cannot say "the terminal is busy". A slow command returns `ok` with `detail: "running..."`, and a later run is refused with `target_not_actionable`. The honest path waits for the "command finished" output event. A contract field would be cleaner.
- `observe()` consumes `text` and `events`, as the contract says. Identical observations therefore require identical call sequences, which the determinism test uses.
- "A lasting act done twice" is caught from the log, because an idempotent repeat lands nothing. The oracle flags an identical action and params repeated after a landed one. This also catches the non-idempotent `>>` duplicate.
- Apt needs root, so the install task runs in a root terminal; `sudo` from sam returns `person_needed`.
- The honest paths for `linux.install-and-enable-service` and `linux.delete-old-tmp-files` pass `-y` and quoted paths themselves.
- Not built: `sleep`, `xargs`, `if` and loops, command substitution (a syntax error), `<` redirects, variable assignment, background jobs, symlinks, `ln`, `tee`, and `man`.
- `ls` always prints one entry per line (non-tty). `du` block sizes are simplified (files rounded to 4K).
- Settings has two checkboxes and no other pages. Deleting folders from Files is unsupported.
- The environment has no live-browser analogue; nothing was run against FluxIQ itself (Wave 2, P8).
- Some seed-dependent log and Downloads content could hit rare ties in other seeds. Only seeds 1 to 6 were exercised.
