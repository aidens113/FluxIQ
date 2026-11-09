# Report: simulated Windows environment (packages/windows)

## Outcome
Done. `src/index.ts` exports `windowsPackage` (a `SimEnvironmentPackage<WinState>`, named and default), plus `WindowsEnvironment`, `tasks`, `perturbations`, `runPowerShell`. Only `packages/windows/**` was touched; the contract was not edited and seemed sufficient.

## What exists
- **Desktop**: UI Automation-like tree. Every node has `automation-id` and `class-name`. Roles: window, dialog, pane, button, edit, list, list-item, tree, tree-item, menu-bar, menu, menu-item, checkbox, radio, data-grid, row, cell, header, terminal, progress-bar, text. Taskbar (Start, one button per window, clock), Start menu, desktop icons. Lists show 10 rows; others are `offscreen` and must be scrolled to.
- **Apps**: File Explorer (in-memory C:\ with Users\alex\{Desktop,Documents,Downloads,Pictures}, address bar, nav pane, cut/copy/paste/delete/new folder, context menu, ctrl+click multi-select); Notepad (open, edit, Save/Save As, save-changes prompt); Settings (Display scale and dark mode, Default apps, Wi-Fi with key prompt, System/Remote Desktop); Mail (inbox with 12 seeded messages and attachments, read, reply, compose, send, delete, save attachment); Spreadsheet (CSV files; cells, SUM formula, Name box, formula bar, save); Registry Editor (HKCU and HKLM tree, value grid, edit dialog).
- **PowerShell** via `run_command` (output in `text` and in the window): Get-ChildItem, Get-Content, Set-Content, Add-Content, Copy-Item, Move-Item, Remove-Item, New-Item, Rename-Item, Test-Path, cd/pwd, Get-Process, Stop-Process, Get-Service, Stop/Start/Restart-Service, Get-ItemProperty, Set/New/Remove-ItemProperty (HKCU), Get-Date, Write-Output, Where-Object (script blocks and simple form), Select-Object, Sort-Object, Measure-Object, ForEach-Object, Format-Table/List, `;`, pipes, `(cmd).Prop`. Console-style tables and lists.
- **Actions**: click (with `ctrl`), double_click, right_click, type, key, focus_window, open_app, close_window, scroll, run_command.
- **UAC**: HKLM writes, protected folders (C:\Windows, Program Files), Remote Desktop, services and protected processes open a modal UAC dialog and return `person_needed`; Yes also returns `person_needed`; No dismisses. Modal dialogs block every other target (`target_not_actionable`).
- **Act classes**: delete (files, mail, registry values), send (mail), change (saves, moves, copies, registry, settings, attachments). Each lasting effect also goes to a hidden `audit` list in the state, which oracles use for exact counts. The act log's `landed` is the highest class landed by one act (delete > send > money > change).

## Tasks (9, each with oracle + honest path)
1. `windows-mail-unread-from-sender` (read, typed output `mails[{subject,date}]`, newest first)
2. `windows-mail-reply` (send)
3. `windows-move-pdfs` (every PDF from Downloads into Documents\Receipts; includes an upper-case `.PDF`)
4. `windows-sheet-total` (SUM of B2:B7 into B9 of Expenses.csv, saved once)
5. `windows-registry-set-value` (HKCU\Software\Contoso\Settings WelcomeScreen to 0 in Registry Editor)
6. `windows-powershell-log-report` (count, totalBytes, largest of the .log files; typed output)
7. `windows-notepad-create-file` (Notepad, Save As a full path)
8. `windows-settings-display-scale` (125%)
9. `windows-settings-wifi-connect` (Office-Guest with its key)
Seeds vary mail dates and read flags, PDF count, amounts and log sizes.

## Perturbations (4) and which tasks survive them
- `rename-send-button` (Send becomes Submit, new automation id): survived by mail-reply.
- `update-popup` (modal Windows Update dialog 500 ms after applying): survived by all nine; tests confirm each honest path actually meets and dismisses it.
- `slow-downloads-folder` (2.5 s "Working on it..."): survived by move-pdfs.
- `reorder-mail-list` (oldest first): survived by mail-unread and mail-reply.
Honest paths survive by matching `/^(Send|Submit)$/`, waiting in simulated time, dismissing pop-ups between steps and not relying on row position. Also tested: all four together on mail-reply, move-pdfs, mail-unread.

## Tests: 181, all passing
- tasks (101): honest path x 2 seeds for each task (18); per task and seed, doing nothing fails, a delete is out of scope, a stray file change fails; wrong outputs (mail-unread, powershell-report); wrong body/recipient, copy instead of move, partial move, a non-PDF moved, wrong cell value, other cell edited, unsaved sheet, wrong registry value, wrong text, wrong scale, wrong Wi-Fi key or network; lasting act done twice (second reply, double move, second save, second registry write, scale toggled back and forth, second connect); out-of-scope send.
- perturbations (34): survival matrix, combined perturbations, each perturbation's effect, naive path failing.
- env (17): same seed gives identical observations, tree shape, Start menu and taskbar, text and events shown once, every GUI action, offscreen and scroll, errors, act-log classes, UAC variants, snapshot/restore, time.
- powershell (22), fs (5), sheet (2).

## Acceptance output
```
$ pnpm --filter @fluxiq-test-env/windows typecheck
> tsc -p tsconfig.json          (no errors)
$ node --test "packages/windows/src/**/tests/*.test.ts"
# tests 181  # pass 181  # fail 0  # cancelled 0  # skipped 0
```

## Gaps
- A PowerShell line landing several classes logs only the highest in the act log; oracles use the audit list for exact counts.
- No variables, assignments, arithmetic, loops, `Select-String`, `Group-Object` or functions in PowerShell; no registry provider navigation (`cd HKCU:`) or `Get-ChildItem` on registry paths.
- Explorer: no rename by F2, no Recycle Bin, no drag and drop. Opening a PDF reports Microsoft Edge unavailable. Spreadsheet opens only from Explorer (no File > Open). Registry Editor click both selects and expands a key.
- Settings Default apps UI exists but no task covers it. Services are never really stopped (always UAC).
- Window geometry and minimise are not modelled; there is one user and one drive.
- Live use with FluxIQ (P8 domain binding) is untouched, as planned for Wave 1.
