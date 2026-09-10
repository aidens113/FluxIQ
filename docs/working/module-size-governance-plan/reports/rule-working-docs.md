# Worker report: `working-docs` structure-audit rule

Owned file: `F:/!FluxIQ/scripts/structure-audit/rules/working-docs.mjs` (220 lines).
Also written by this worker, as the brief directed:
`F:/!FluxIQ/docs/working/module-size-governance-plan/reports/readme-generated.md`
(the generator's output, kept as diff evidence) and this report.
Nothing else was edited. No commit, no push. `--update` was NOT run.

## What each check does

**(1) Header conformance** — for every tracked `docs/working/*.md` (top level
only, `README.md` excluded), line 1 must start with `# `, line 2 must be blank,
and lines 3-10 must be exactly `Status`, `Status detail`, `Created`,
`Last updated`, `Owner`, `Scope`, `Paired document`, `Related`, one field per
line, each `Key: value` with a non-empty value. `Status` must be one of
`Active`, `Paused`, `Blocked`, `Complete`, `Superseded`, `Archived`,
`Unclassified`. Severity `fail`, `ratchet: false`, `key` = path, `value` = 1,
`line` = the offending line. The message names the expected field, quotes what
was found (truncated at 60 chars), and adds a wrapped-value hint when the
offending line carries no `Key: ` prefix at all.

**(2) Current State** — a document whose `Status` is `Active` must have a line
exactly `## Current State` in lines 11-30 (the 20 lines after the eight-field
header block). Severity `fail`, `ratchet: false`, `key` = path, `value` = 1.

**(3) Size** — `ctx.lineCount(path) > ctx.LIMITS.workingDocLines` (800).
Severity `fail`, `ratchet: true`, `key` = path, `value` = the line count. This
is the only ratcheted finding the rule produces.

**(4) README freshness** — the rule regenerates the index text from the
documents' header blocks and compares it with `ctx.read("docs/working/README.md")`.
Any difference is a `fail`, `ratchet: false`, `key` = `docs/working/README.md`.
`update(ctx)` — called only by `--update`, after the baseline is written —
writes the same generated text to `docs/working/README.md` as UTF-8 with LF
endings. That `writeFileSync` is the rule's only write; `run()` is read-only.

## Finding counts (current working tree, 25 documents)

| Check | Findings | Severity / ratchet |
| --- | --- | --- |
| (1) Header conformance | **2** | fail, ratchet false |
| (2) Current State | **0** | fail, ratchet false |
| (3) Size (> 800 lines) | **16** | fail, ratchet true |
| (4) README freshness | **1** (see below) | fail, ratchet false |
| Total | 19 failures, 0 warnings | |

Sixteen size failures matches the expected count and matches the index's own
"16 of 25 here" line.

## Header deviations found (reported, not fixed)

Both are real, both are wrapped values, and both are in supervisor-owned
documents. I did not touch either file.

1. `docs/working/agent-working-doc-protocol.md:5`

   ```text
   3  Status: Active
   4  Status detail: Protocol adopted; triage, retirement, and Current State retrofits
   5  are complete here; compaction of oversized documents remains, on touch.
   6  Created: 2026-09-10
   ```

   `Scope` also wraps (line 9 continues onto line 10), so the block occupies
   lines 3-12 rather than 3-10. The rule reports only the first deviation
   (line 5).

2. `docs/working/module-size-governance-plan.md:5`

   ```text
   3  Status: Active
   4  Status detail: Enforcement live; methodology published; the migration
   5  phases below are sequenced but not started.
   6  Created: 2026-09-10
   ```

   `Scope` wraps across lines 9-11 and `Related` across lines 13-14 in the same
   document. Again only line 5 is reported.

The protocol's "Header block" section is explicit ("one field per line, no
blank lines between fields") and the brief restates that a wrapped value is a
violation, so these are genuine failures rather than a rule that is too strict.
Both documents still pass check (2): `## Current State` sits at line 21 and 22
respectively, inside the 20-line window.

Everything else conforms: 23 of 25 documents have a clean eight-field header,
and all seven `Active` documents have `## Current State` in the window
(line 14 for five of them, 21 and 22 for the two above).

## Byte-for-byte proof of the README generator

Three comparisons were run. The generator is a faithful port.

**A. JS port vs. the reference Python generator, same inputs.**
The reference at `<scratchpad>/regen-index.py` was run over a scratch copy of
the current `docs/working/*.md` and compared with the rule's output:

```
$ python <scratchpad>/regen-index.py <scratchpad>/pyrepo core
core: 25 documents -> {'Active': 7, 'Paused': 5, 'Complete': 7, 'Superseded': 6}
$ cmp <scratchpad>/pyrepo/docs/working/README.md \
      F:/!FluxIQ/docs/working/module-size-governance-plan/reports/readme-generated.md
CMP: identical (JS port == Python reference, byte for byte)
```

**B. Generated text vs. the checked-in `docs/working/README.md`.**

```
$ diff docs/working/README.md docs/working/module-size-governance-plan/reports/readme-generated.md
24c24
< | [module-size-governance-plan.md](./module-size-governance-plan.md) | Senior supervisor agent | 314 | ... |
---
> | [module-size-governance-plan.md](./module-size-governance-plan.md) | Senior supervisor agent | 418 | ... |
DIFF_EXIT=1
```

One line differs, and it is a live-content difference, not a generator
difference: `docs/working/module-size-governance-plan.md` is 314 lines at
`HEAD` and 418 lines in the working tree right now — the supervisor is
appending to it while these worker briefs run. The checked-in README was
generated before those edits. This is exactly the drift check (4) exists to
catch, so the failure is correct behaviour.

**C. The checked-in README is byte-identical to the generator's output over the
committed documents**, and the rule's own comparison passes on that tree:

```
$ git show HEAD:docs/working/module-size-governance-plan.md > <scratchpad>/headrepo/docs/working/module-size-governance-plan.md
$ python <scratchpad>/regen-index.py <scratchpad>/headrepo core
core: 25 documents -> {'Active': 7, 'Paused': 5, 'Complete': 7, 'Superseded': 6}
$ cmp <scratchpad>/headrepo/docs/working/README.md F:/!FluxIQ/docs/working/README.md
CMP: checked-in README == generator output over the COMMITTED documents

$ node <scratchpad>/check-fresh.mjs      # calls the rule's run() with that one
                                         # document read at its committed content
total findings: 18
readme-freshness findings: 0
README FRESHNESS: PASS (rule's own comparison, byte for byte)
```

So the rule's own `ctx.read(...) !== generated` comparison passes byte for byte
against the checked-in `docs/working/README.md`. The one outstanding freshness
failure in the working tree will clear the moment the supervisor regenerates
the index for the 418-line document (`pnpm structure:baseline`).

`readme-generated.md` in this directory is the working-tree generation (the
418-line row), kept so the diff above is reproducible.

## Judgement calls

- **One header finding per document.** The block is parsed positionally, so
  after the first wrong line every later line is compared against the wrong
  field. Reporting only the first deviation also keeps `key` (= path) unique
  within the check, which matters because the brief assigns `key = path` to
  checks (1), (2) and (3) alike.
- **CRLF tolerated.** `docs/working/ui-ux-upgrade-audit-plan.md` is CRLF and
  `docs/working/adaptive-flow-training-roadmap.md` is mixed CRLF/LF. A trailing
  `\r` is stripped before structural comparison, matching the Python reference,
  which reaches the same result via `.strip()` on the captured value. Without
  this, both files would fail check (1) on line 2 for reasons that have nothing
  to do with the header.
- **`--update` was not run**, per the brief, so `working-docs` has no baseline
  entries yet. Until `pnpm structure:baseline` runs, all sixteen size findings
  fail outright rather than being suppressed (`applyRatchet` fails an unrecorded
  ratcheted finding). That is the intended first-run behaviour; the supervisor's
  baseline run will record them.
- **Document discovery uses `ctx.trackedFiles`**, per the rule contract, while
  the Python reference uses `os.listdir`. They agree today (the tree is clean of
  untracked top-level `.md` files); they would diverge for an untracked working
  document, and I chose the tracked set because the audit is a build gate.
- **Size message names the concrete archive path** (e.g.
  `docs/working/runtime-kernel-plan/archive/`) instead of the literal
  `<slug>/archive/`, since messages must be self-explanatory without opening the
  protocol.
- **`limit: 0`** on the three boolean checks, so `value: 1` reads as "one more
  than allowed"; check (3) uses `limit: LIMITS.workingDocLines`.
- The `⚠` in the generated index is U+26A0 with no variation selector
  (`e2 9a a0`), verified against the bytes in the checked-in README.

## Exact commands run, with the last 5 lines of output

```
$ node scripts/structure-audit.mjs --rule working-docs
  FAIL  [working-docs] docs/working/node-state-evidence-view-plan.md: 979 lines exceeds the 800-line compaction threshold. ...
  FAIL  [working-docs] docs/working/README.md is out of date with the documents' header blocks. Run "pnpm structure:baseline" to regenerate it.
  FAIL  [working-docs] docs/working/runtime-kernel-plan.md: 1050 lines exceeds the 800-line compaction threshold. ...
  FAIL  [working-docs] docs/working/ui-ux-upgrade-audit-plan.md: 6007 lines exceeds the 800-line compaction threshold. ...
  FAIL  [working-docs] docs/working/web-panel-ui-ux-functionality-audit-plan.md: 1223 lines exceeds the 800-line compaction threshold. ...

structure-audit: 19 violation(s) across 1 rule(s).      [exit 1]
```

```
$ node scripts/structure-audit.mjs --rule working-docs --json
  ],
  "warnings": [],
  "suppressed": 0,
  "lowerable": []
}                                                        [exit 1, valid JSON]
```

Parsed summary of that JSON: `failures 19, warnings 0, suppressed 0,
lowerable 0`; by check `{"size":16,"header":2,"readme":1}`; by ratchet
`16 ratchet:true, 3 ratchet:false`.

```
$ node scripts/structure-audit.mjs --list
imports                Imports respect forbidden modules, directory boundaries, and barrels
naming                 Names are specific, paths are shallow, prefixes become directories
test-placement         Test files live in a test root, not beside their source
working-docs           Working documents carry a conforming header, an up-front Current State, and a current index
```

```
$ node scripts/structure-audit.mjs | grep -i "working-docs.mjs"
grep_exit=1        # the new rule file trips no other rule (220 lines, under the
                   # 400-line advisory threshold, no naming or export findings)
```

The `cmp` / `diff` / `check-fresh.mjs` commands and their full output are
quoted in the section above.

## Not completed

Nothing in the brief was left undone. Two things are deliberately outstanding
and belong to the supervisor, not to this worker:

1. The two wrapped header blocks in `agent-working-doc-protocol.md` and
   `module-size-governance-plan.md`. They are outside my OWNS list and the brief
   said to report rather than fix, so check (1) reports 2 failures instead of 0.
2. The one README freshness failure, caused by the uncommitted growth of
   `module-size-governance-plan.md` from 314 to 418 lines. It clears with
   `pnpm structure:baseline` (which also records the sixteen size entries).
   `--update` was not run here, as instructed.
